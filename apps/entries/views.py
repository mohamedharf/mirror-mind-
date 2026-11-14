from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.core.cache import cache
from .models import Entry, MetricDefinition
from .serializers import EntrySerializer
from .tasks import close_open_event_and_record_duration


class UserScopedViewSet(viewsets.ModelViewSet):
    """
    Base class إلزامي لكل ViewSets في المشروع.
    يضمن أن كل query مقيد بـ user=request.user.
    """
    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class EntryViewSet(UserScopedViewSet):
    queryset = Entry.objects.all()
    serializer_class = EntrySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset().select_related('parent').prefetch_related(
            'children',
            'metrics__definition',
            'children__metrics__definition',
        )

        # Filter by exact date
        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(created_at__date=date_param)

        # Filter by month/year
        month = self.request.query_params.get('month')
        year  = self.request.query_params.get('year')
        if month and year:
            qs = qs.filter(created_at__month=month, created_at__year=year)

        # Full-text search
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(text__icontains=search)

        # في list view: أرجع root entries فقط (الأبناء تظهر nested)
        if self.action == 'list':
            qs = qs.filter(parent__isnull=True)

        return qs

    def perform_create(self, serializer):
        instance = serializer.save(user=self.request.user)
        try:
            from .tasks import extract_entry_data
            extract_entry_data.delay(instance.id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to queue entry {instance.id}: {e}")
            # تحديث الحالة إلى failed إذا تعذر إرسال المهمة لـ Celery (مثال: Redis متوقف)
            instance.processing_status = 'failed'
            instance.save(update_fields=['processing_status'])

    def perform_destroy(self, instance):
        """لو للـ entry أبناء: الأبناء تصبح parent=null قبل الحذف"""
        instance.children.update(parent=None)
        instance.delete()

    @action(detail=True, methods=['patch'])
    def retry_analysis(self, request, pk=None):
        entry = self.get_object()
        if entry.processing_status not in ['failed', 'rate_limited', 'analysis_timeout']:
            return Response({'error': 'Entry is not in a failed state'}, status=400)
            
        entry.processing_status = 'pending'
        entry.save(update_fields=['processing_status'])
        
        from .tasks import extract_entry_data
        extract_entry_data.delay(entry.id)
        
        return Response({'message': 'Analysis queued for retry'})

    @action(detail=True, methods=['post'], url_path='close')
    def close_event(self, request, pk=None):
        """إغلاق حدث مفتوح مباشرة وحساب مدته دون انتظار تحليل الـ AI"""
        open_entry = self.get_object()
        if not open_entry.is_open_event:
            return Response({'error': 'هذا الحدث ليس مفتوحاً'}, status=400)

        # إنشاء مدخل وهمي للإغلاق ليُستخدم في حساب المدة وفي التسلسل الزمني
        closing_text = request.data.get('text', f"تم إنهاء الحدث: {open_entry.text[:50]}")
        closing_entry = Entry.objects.create(
            user=request.user,
            text=closing_text,
            parent=open_entry,
            processing_status='done',  # لا داعي للتحليل
            entry_type='routine',
            is_open_event=False
        )

        from .tasks import close_open_event_and_record_duration
        result = close_open_event_and_record_duration(open_entry, closing_entry)

        if result:
            return Response({
                'success': True,
                'metric_name': result.get('metric_name'),
                'duration_hours': result.get('duration_hours'),
            })
        
        # لو مفيش مدة مسجلة (لأي سبب)، نقفله بس
        open_entry.is_open_event = False
        open_entry.save(update_fields=['is_open_event'])
        return Response({'success': True, 'message': 'تم الإغلاق بدون حساب مدة.'})

    @action(detail=False, methods=['get'], url_path='today')
    def today(self, request):
        """GET /api/v1/entries/today/ — إدخالات اليوم مرتبة تنازلياً (الأحدث أولاً) وتجلب الجذور فقط"""
        today = timezone.localdate()
        entries = Entry.objects.filter(
            user=request.user,
            created_at__date=today,
            parent__isnull=True
        ).order_by('-created_at')

        total     = entries.count()
        show_more = total > 5
        serializer = self.get_serializer(entries[:5], many=True)

        return Response({
            'entries':     serializer.data,
            'total_today': total,
            'show_more':   show_more,
        })

    @action(detail=False, methods=['get'])
    def open_events(self, request):
        """GET /api/v1/entries/open_events/ — جلب الأحداث المفتوحة التي لم تُغلق بعد"""
        events = Entry.objects.filter(
            user=request.user,
            is_open_event=True,
            children__isnull=True,
            parent__isnull=True  # لمنع خطأ العمق > 1 عند الإغلاق
        ).order_by('-created_at')
        serializer = self.get_serializer(events, many=True)
        return Response(serializer.data)


class CloseSuggestionView(APIView):
    """
    GET:    يجلب اقتراح إغلاق حدث للـ entry المحدد (لو موجود في Cache)
    POST:   يؤكد الإغلاق ويسجل المدة كـ Metric
    DELETE: يرفض الاقتراح ويحذفه من Cache
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, entry_id):
        cache_key = f"close_suggestion:{request.user.id}:{entry_id}"
        suggestion = cache.get(cache_key)
        if not suggestion:
            return Response({'has_suggestion': False})
        return Response({
            'has_suggestion':  True,
            'open_entry_id':   suggestion['open_entry_id'],
            'open_entry_text': suggestion['open_entry_text'],
            'duration_hours':  suggestion['duration_hours'],
            'metric_name':     suggestion['metric_name'],
        })

    def post(self, request, entry_id):
        """المستخدم وافق — سجّل المدة وأغلق الحدث"""
        cache_key = f"close_suggestion:{request.user.id}:{entry_id}"
        suggestion = cache.get(cache_key)
        if not suggestion:
            return Response({'error': 'الاقتراح انتهت صلاحيته أو غير موجود'}, status=404)

        try:
            open_entry    = Entry.objects.get(id=suggestion['open_entry_id'],    user=request.user)
            closing_entry = Entry.objects.get(id=suggestion['closing_entry_id'], user=request.user)
        except Entry.DoesNotExist:
            return Response({'error': 'إدخال غير موجود'}, status=404)

        result = close_open_event_and_record_duration(open_entry, closing_entry)
        cache.delete(cache_key)

        if result:
            return Response({
                'success':        True,
                'metric_name':    result['metric_name'],
                'duration_hours': result['duration_hours'],
            })
        return Response({'error': 'لم يتم التسجيل — تحقق من البيانات'}, status=400)

    def delete(self, request, entry_id):
        """المستخدم رفض — احذف الاقتراح"""
        cache_key = f"close_suggestion:{request.user.id}:{entry_id}"
        cache.delete(cache_key)
        return Response({'dismissed': True})
