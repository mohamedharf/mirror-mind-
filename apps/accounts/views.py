from django.shortcuts import redirect
from django.views import View
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.http import JsonResponse

User = get_user_model()


class GoogleOAuthSuccessView(View):
    def get(self, request):
        if request.user.is_authenticated:
            refresh = RefreshToken.for_user(request.user)
            access_token  = str(refresh.access_token)
            refresh_token = str(refresh)

            # إرسال الـ tokens في URL Fragment (لا يُسجَّل في server logs)
            frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
            redirect_url = (
                f"{frontend_url}/auth/callback"
                f"#access={access_token}&refresh={refresh_token}"
            )
            return redirect(redirect_url)

        return redirect(f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')}/login?error=auth_failed")


class GetAccessTokenView(View):
    def get(self, request):
        access_token = request.session.pop("access_token", None)
        if access_token:
            return JsonResponse({"access_token": access_token})
        return JsonResponse({"error": "Access token not found or expired"}, status=400)


class DevLoginView(View):
    """
    وضع التيست فقط — DEV_LOGIN_ENABLED = True في settings
    يعمل user وهمي ويرجع JWT في URL Fragment مباشرةً
    نفس الـ flow بالظبط زي Google OAuth
    """

    def get(self, request):
        if not getattr(settings, 'DEV_LOGIN_ENABLED', False):
            return JsonResponse({"error": "Dev login disabled in production"}, status=403)

        # إنشاء أو جلب المستخدم التجريبي
        user, _ = User.objects.get_or_create(
            username='test_user',
            defaults={
                'email':      'test@maraya.local',
                'first_name': 'مستخدم',
                'last_name':  'تجريبي',
            }
        )

        # توليد JWT tokens
        refresh      = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        # Redirect بنفس الـ Fragment flow
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        redirect_url = (
            f"{frontend_url}/auth/callback"
            f"#access={access_token}&refresh={refresh_token}"
        )
        return redirect(redirect_url)


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction

class DeleteAllUserDataView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user

        with transaction.atomic():
            # حذف البيانات بالترتيب الصحيح (FKs)
            from apps.entries.models import Metric, MetricBaseline, Entry
            from apps.insights.models import (
                DailyReflection, WeeklyInsight, MonthlyInsight
            )

            Metric.objects.filter(user=user).delete()
            MetricBaseline.objects.filter(user=user).delete()
            Entry.objects.filter(user=user).delete()
            DailyReflection.objects.filter(user=user).delete()
            WeeklyInsight.objects.filter(user=user).delete()
            MonthlyInsight.objects.filter(user=user).delete()

        return Response({'message': 'تم حذف جميع البيانات بنجاح'}, status=200)
