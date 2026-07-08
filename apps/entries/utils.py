import google.generativeai as genai
import json, os

EXTRACTION_SYSTEM_PROMPT = """
أنت مساعد تحليل نصوص خفيف. دورك استخراج بيانات منظمة من نص قصير كتبه مستخدم في يومياته الشخصية.
تجاوب فقط بـ JSON صالح. لا تضيف أي نص قبله أو بعده.
لا تحكم على المستخدم. لا تقدم نصائح. فقط استخرج.
"""

EXTRACTION_USER_PROMPT = """
النص:
{text}

التاجز التي ظهرت في آخر 14 يوم (للمساعدة في الاتساق فقط):
{recent_tags}

استخرج الآتي:

1. mood_score (float, 1.0-5.0):
   1.0-1.9 = سلبي جداً (حزن، إحباط شديد، غضب)
   2.0-2.9 = سلبي (تعب، ضغط، قلق)
   3.0-3.4 = محايد أو مختلط
   3.5-4.4 = إيجابي (ارتياح، إنجاز، سعادة)
   4.5-5.0 = إيجابي جداً (فرح، نجاح كبير، امتنان)

2. tags (list of str, 2-5 عناصر):
   - كلمات أو عبارات قصيرة بالعربي
   - فضّل التاجز الموجودة في القائمة السابقة إن انطبقت
   - أضف تاجز جديدة إن لزم
   - أمثلة: "شغل", "عائلة", "صحة", "نوم", "مال", "إنجاز", "توتر", "علاقات"

3. entities (object):
   {{
     "أشخاص": [],    // أسماء أشخاص مذكورة فقط
     "مشاريع": [],   // مشاريع أو مهام مذكورة
     "أماكن": []     // أماكن مذكورة
   }}
   ضع قوائم فارغة إن لم يوجد شيء.

4. reflection (str):
   جملة واحدة فقط. وصفية. تعكس ما كتبه المستخدم بكلمات مختلفة قليلاً.
   لا تحكم. لا تنصح. مثال صحيح: "يوم به ضغط مهني — ذُكرت الاجتماعات مرتين."
   مثال خاطئ: "يجب أن تتعامل مع الضغط بشكل أفضل."

5. is_open_event (bool):
   true فقط إذا: النص يصف حدثاً على وشك الحدوث أو بدأ ولم يكتمل.
   أمثلة true: "هروح الاجتماع بعد شوية"، "بدأت الشغل على المشروع الجديد النهارده"
   أمثلة false: "كل شيء عادي"، "اتعملت اجتماع"، "خلصت الشغل"

الرد:
{{
  "mood_score": float,
  "tags": [str],
  "entities": {{"أشخاص": [], "مشاريع": [], "أماكن": []}},
  "reflection": str,
  "is_open_event": bool
}}
"""

def call_gemini_extraction(text: str, recent_tags: list) -> dict:
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
    model = genai.GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-1.5-flash-latest"))

    prompt = EXTRACTION_USER_PROMPT.format(
        text=text[:2000],  # حد أقصى للنص عشان نوفر tokens
        recent_tags=", ".join(recent_tags[:20]) if recent_tags else "لا يوجد بعد"
    )

    response = model.generate_content(
        [EXTRACTION_SYSTEM_PROMPT, prompt],
        generation_config=genai.GenerationConfig(
            temperature=0.1,      # ثبات في الاستخراج
            max_output_tokens=400,
        )
    )

    raw = response.text.strip()

    # تنظيف لو الموديل أضاف ```json
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    result = json.loads(raw)

    # Validation بسيط
    result["mood_score"] = max(1.0, min(5.0, float(result.get("mood_score", 3.0))))
    result["tags"] = [str(t)[:30] for t in result.get("tags", [])[:5]]
    result["entities"] = result.get("entities", {"أشخاص": [], "مشاريع": [], "أماكن": []})
    result["ai_reflection"] = str(result.get("reflection", ""))[:300]
    result["is_open_event"] = bool(result.get("is_open_event", False))

    return result
