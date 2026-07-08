from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from apps.entries.models import Entry
from datetime import datetime
import csv
from django.http import HttpResponse

class ExportMarkdownView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from_date_str = request.data.get('from_date')
        to_date_str = request.data.get('to_date')

        if not from_date_str or not to_date_str:
            return Response({"error": "from_date and to_date are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_date = datetime.strptime(from_date_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(to_date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)

        entries = Entry.objects.filter(
            user=request.user,
            created_at__date__gte=from_date,
            created_at__date__lte=to_date
        ).order_by('created_at')

        content = f"# سجل المرايا\n"
        content += f"**المستخدم:** {request.user.username}\n"
        content += f"**الفترة:** {from_date_str} → {to_date_str}\n"
        content += f"**عدد الإدخالات:** {entries.count()}\n\n---\n\n"

        current_day = None
        for entry in entries:
            entry_day = entry.created_at.date()
            if entry_day != current_day:
                content += f"## [{entry_day.strftime('%A، %d %B %Y')}]\n\n"
                current_day = entry_day
            
            content += f"### [{entry.created_at.strftime('%H:%M')}]\n"
            content += f"**المزاج:** {entry.mood_score or 'N/A'}/5.0\n"
            content += f"**التاجز:** {', '.join(entry.tags) if entry.tags else 'بدون'}\n\n"
            content += f"{entry.text}\n\n"
            if entry.ai_reflection:
                content += f"> *انعكاس:* {entry.ai_reflection}\n\n"
            content += "---\n\n"

        filename = f"maraya_{from_date_str}_to_{to_date_str}.md"
        return Response({
            "filename": filename,
            "content": content
        })

class ExportJSONView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from_date_str = request.data.get('from_date')
        to_date_str = request.data.get('to_date')

        if not from_date_str or not to_date_str:
            return Response({"error": "from_date and to_date are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_date = datetime.strptime(from_date_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(to_date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)

        entries = Entry.objects.filter(
            user=request.user,
            created_at__date__gte=from_date,
            created_at__date__lte=to_date
        ).order_by('created_at')

        data = []
        for e in entries:
            data.append({
                'id': e.id,
                'created_at': e.created_at.isoformat(),
                'text': e.text,
                'mood_score': e.mood_score,
                'tags': e.tags,
                'entities': e.entities,
                'entry_type': e.entry_type,
                'reflection': e.ai_reflection
            })

        return Response({
            "filename": f"maraya_{from_date_str}_to_{to_date_str}.json",
            "data": data
        })

class ExportCSVView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from_date_str = request.data.get('from_date')
        to_date_str = request.data.get('to_date')

        if not from_date_str or not to_date_str:
            return Response({"error": "from_date and to_date are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_date = datetime.strptime(from_date_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(to_date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)

        entries = Entry.objects.filter(
            user=request.user,
            created_at__date__gte=from_date,
            created_at__date__lte=to_date
        ).order_by('created_at')

        response = HttpResponse(
            content_type='text/csv',
            headers={'Content-Disposition': f'attachment; filename="maraya_{from_date_str}_to_{to_date_str}.csv"'},
        )

        writer = csv.writer(response)
        writer.writerow(['ID', 'Date', 'Time', 'Text', 'Mood', 'Tags', 'Entry Type', 'Reflection'])
        for e in entries:
            writer.writerow([
                e.id,
                e.created_at.date().isoformat(),
                e.created_at.time().isoformat(),
                e.text,
                e.mood_score or '',
                ','.join(e.tags) if e.tags else '',
                e.entry_type,
                e.ai_reflection
            ])

        return response
