from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Entry
from .serializers import EntrySerializer


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
        qs = super().get_queryset().select_related('parent').prefetch_related('children')

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
