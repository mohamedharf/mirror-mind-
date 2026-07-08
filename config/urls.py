from django.contrib import admin
from django.urls import path, include
from apps.accounts.views import DeleteAllUserDataView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('admin/', admin.site.urls),
    # allauth social login — لا تغير هذا المسار (OAuth callback يعتمد عليه)
    path('accounts/', include('allauth.urls')),
    # Auth APIs
    path('api/v1/auth/', include('dj_rest_auth.urls')),
    path('api/v1/auth/registration/', include('dj_rest_auth.registration.urls')),
    path('api/v1/auth/accounts/', include('apps.accounts.urls')),
    path('api/v1/account/delete-data/', DeleteAllUserDataView.as_view()),
    # Core APIs
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/v1/', include('apps.entries.urls')),
    path('api/v1/insights/', include('apps.insights.urls')),
    path('api/v1/audio/', include('apps.audio.urls')),
    path('api/v1/export/', include('apps.export_app.urls')),
]
