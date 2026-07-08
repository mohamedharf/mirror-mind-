import os
import tempfile
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from .stt import transcribe

class TranscribeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if 'audio' not in request.FILES:
            return Response({"error": "No audio file provided"}, status=status.HTTP_400_BAD_REQUEST)

        audio_file = request.FILES['audio']
        
        # Save to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.name)[1]) as tmp:
            for chunk in audio_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            # Synchronous transcription as recommended to avoid Celery worker issues
            result = transcribe(tmp_path)
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
