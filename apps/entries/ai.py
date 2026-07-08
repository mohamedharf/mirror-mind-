import os
import json
import logging
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

logger = logging.getLogger(__name__)

genai.configure(api_key=os.environ.get('GEMINI_API_KEY', ''))

# ── Defaults ──────────────────────────────────────────────────
EXTRACTION_DEFAULT = {
    "metrics":       [],
    "mood_score":    3.0,
    "tags":          [],
    "entry_type":    "event",
    "entities":      {"أشخاص": [], "مشاريع": [], "أماكن": []},
    "reflection":    "",
    "is_open_event": False,
}

# ── System Prompt ──────────────────────────────────────────────
EXTRACTION_SYSTEM = "استخرج بـ JSON فقط بدون نصوص. لا تنصح. استخدم metrics/tags بدقة."

# ── User Prompt Template ───────────────────────────────────────
EXTRACTION_USER = """
النص: {text}
Metrics: {metrics_definitions}
Tags: {recent_tags}

استخرج:
1. metrics: [{"name":"..", "value":.., "unit":"..", "is_new":bool}] (دقيق فقط، لو ذُكر الوحدة مفرد مثل فنجان/سيجارة بدون رقم، افترض value=1)
2. mood_score: 1.0-5.0
3. tags: [أحداث/مشاعر فقط]
4. entry_type: routine/event/reflection
5. entities: {"أشخاص":[],"مشاريع":[],"أماكن":[]}
6. reflection: جملة تلخيص
7. is_open_event: bool

JSON:
"""


def safe_gemini_call(prompt: str, system: str, default: dict,
                     max_tokens: int = 600, temperature: float = 0.1) -> dict:
    """
    Wrapper آمن لكل استدعاءات Gemini.
    لو فشل لأي سبب → يُرجع default بدون crash.
    ⚠️ لو ResourceExhausted → يُعيد throw (Celery task تعمل retry)
    """
    try:
        model = genai.GenerativeModel(
            os.environ.get('GEMINI_MODEL', 'gemini-1.5-flash'),
            system_instruction=system
        )
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
            request_options={"timeout": 20}
        )
        raw = response.text.strip()
        # تنظيف markdown code blocks لو الموديل أضافها
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()
        return json.loads(raw)

    except google_exceptions.ResourceExhausted:
        logger.warning("Gemini rate limit — re-raising for retry")
        raise  # يُعاد throw للـ task عشان تعمل retry

    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Gemini response parse error: {e}")
        return default

    except Exception as e:
        logger.error(f"Gemini call failed: {e}")
        return default


def build_extraction_prompt(text: str, user_id: int) -> str:
    """بناء الـ prompt مع metrics definitions وrecent tags من الـ DB."""
    from django.utils.timezone import now
    from datetime import timedelta
    from django.db.models import Q
    from .models import MetricDefinition, Entry

    # metrics definitions (system + promoted)
    defs = MetricDefinition.objects.filter(
        Q(is_system=True) | Q(suggested_by_count__gte=1)
    ).values('name', 'unit', 'aliases')
    metrics_text = "\n".join(
        f"{d['name']} | {d['unit']} | {', '.join(d['aliases'])}"
        for d in defs
    )

    # recent tags (آخر 14 يوم)
    cutoff = now() - timedelta(days=14)
    recent_entries = Entry.objects.filter(
        user_id=user_id, created_at__gte=cutoff
    ).values_list('tags', flat=True)
    tag_counts: dict = {}
    for tags in recent_entries:
        for t in (tags or []):
            tag_counts[t] = tag_counts.get(t, 0) + 1
    recent_tags = ", ".join(
        sorted(tag_counts, key=tag_counts.get, reverse=True)[:20]  # type: ignore
    ) or "لا يوجد بعد"

    return EXTRACTION_USER.format(
        text=text[:2000],
        metrics_definitions=metrics_text or "لا يوجد بعد",
        recent_tags=recent_tags
    )
