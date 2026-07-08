from django.urls import path
from django.conf import settings
from .views import GoogleOAuthSuccessView, GetAccessTokenView, DevLoginView

app_name = 'accounts'

urlpatterns = [
    path("google/success/", GoogleOAuthSuccessView.as_view(), name="google_oauth_success"),
    path("token/access/", GetAccessTokenView.as_view(), name="get_access_token"),
]

if getattr(settings, 'DEV_LOGIN_ENABLED', False):
    urlpatterns.append(
        path("dev-login/", DevLoginView.as_view(), name="dev_login")
    )
