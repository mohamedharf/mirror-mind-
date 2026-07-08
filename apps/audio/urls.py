from django.urls import path
from .views import TranscribeView

app_name = 'audio'

urlpatterns = [
    path('transcribe/', TranscribeView.as_view(), name='transcribe'),
]
