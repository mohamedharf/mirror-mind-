from faster_whisper import WhisperModel
import os, tempfile

_model_instance = None

def get_whisper_model() -> WhisperModel:
    """Singleton — يُحمَّل مرة واحدة فقط عند أول استخدام"""
    global _model_instance
    if _model_instance is None:
        _model_instance = WhisperModel(
            model_size_or_path=os.environ.get("WHISPER_MODEL_SIZE", "small"),
            device=os.environ.get("WHISPER_DEVICE", "cpu"),
            compute_type="int8",          # توفير RAM
            num_workers=2
        )
    return _model_instance


def transcribe(audio_path: str) -> dict:
    model = get_whisper_model()

    segments, info = model.transcribe(
        audio_path,
        language="ar",
        beam_size=5,
        vad_filter=True,            # يحذف الصمت
        vad_parameters=dict(
            min_silence_duration_ms=500
        ),
        word_timestamps=False,      # لا نحتاجها
        condition_on_previous_text=True,
    )

    segments_list = list(segments)

    if not segments_list:
        return {"text": "", "language": "ar", "confidence": 0.0}

    full_text = " ".join(s.text.strip() for s in segments_list)

    # confidence من avg_logprob (نطاق -∞ إلى 0، قيم قريبة من 0 أفضل)
    avg_logprob = sum(s.avg_logprob for s in segments_list) / len(segments_list)
    # تحويل لـ 0-1: نعتبر -0.5 = confidence 1.0 و -2.0 = confidence 0.0
    confidence = max(0.0, min(1.0, (avg_logprob + 2.0) / 1.5))

    return {
        "text": full_text.strip(),
        "language": info.language,
        "confidence": round(confidence, 2)
    }
