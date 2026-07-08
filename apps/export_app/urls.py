from django.urls import path
from .views import ExportMarkdownView, ExportJSONView, ExportCSVView

app_name = 'export_app'

urlpatterns = [
    path('markdown/', ExportMarkdownView.as_view(), name='export_markdown'),
    path('json/', ExportJSONView.as_view(), name='export_json'),
    path('csv/', ExportCSVView.as_view(), name='export_csv'),
]
