from .dev import *

# ══════════════════════════════════════════
#  TEST MODE — بدون Redis، بدون Celery Worker
#  Celery بيشتغل Sync في نفس الـ process
# ══════════════════════════════════════════

# تشغيل كل Celery tasks فوراً بدون worker (sync)
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Broker وهمي في الذاكرة — مش محتاج Redis
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'

# تفعيل Dev Login (bypass Google OAuth)
DEV_LOGIN_ENABLED = True

# Gemini API key
GEMINI_API_KEY = 'AIzaSyD955QemHzf-DnXwQgSHNaLqztEnWOD7lo'

# Force Celery app to update its config just in case it was loaded with dev.py earlier
from config.celery import app as celery_app
celery_app.conf.update(
    task_always_eager=True,
    task_eager_propagates=True,
    broker_url='memory://',
    result_backend='cache+memory://'
)
