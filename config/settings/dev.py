from .base import *

DEBUG = True

# Use console email backend in development to avoid SMTP connection issues.
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

CSRF_TRUSTED_ORIGINS = ["http://localhost:5173"]

DEV_LOGIN_ENABLED = True