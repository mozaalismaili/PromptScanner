import os
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

from scanner import (
    download_models,
    load_arabert,
    load_xlmr,
    load_toxicity,
    run_scan,
    TOX_IDX2LABEL,
    TOX_COLOR,
)

# ─────────────────────────────────────────────────────────────
# GLOBALS — models loaded once at startup
# ─────────────────────────────────────────────────────────────
ar_tok = ar_mdl = ar_id2tag = None
xl_tok = xl_mdl = xl_id2tag = None
tx_tok = tx_mdl = None

groq_client = None

# ─────────────────────────────────────────────────────────────
# LIFESPAN — runs on startup
# ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global ar_tok, ar_mdl, ar_id2tag
    global xl_tok, xl_mdl, xl_id2tag
    global tx_tok, tx_mdl
    global groq_client

    print("Starting up — downloading models if needed...")
    download_models()

    print("Loading AraBERT PII model...")
    ar_tok, ar_mdl, ar_id2tag = load_arabert()

    print("Loading XLM-R PII model...")
    xl_tok, xl_mdl, xl_id2tag = load_xlmr()

    print("Loading toxicity model...")
    tx_tok, tx_mdl = load_toxicity()

    groq_key = os.environ.get("GROQ_API_KEY", "")
    print(f"GROQ_API_KEY found: {bool(groq_key)} length: {len(groq_key)}")
    if groq_key:
        groq_client = Groq(api_key=groq_key)
        print("Groq client initialized.")
    else:
        print("Warning: GROQ_API_KEY not set. Rewrite feature disabled.")

    print("All models loaded. API ready.")
    yield
    print("Shutting down.")

# ─────────────────────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────────────────────
app = FastAPI(title="PromptScanner API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────
class ScanRequest(BaseModel):
    text: str

class RewriteRequest(BaseModel):
    text: str
    masked_text: str = ""
    tox_label: str

# ─────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "models": {
            "arabert": ar_mdl is not None,
            "xlmr":    xl_mdl is not None,
            "toxicity": tx_mdl is not None,
            "rewrite":  groq_client is not None,
        }
    }


@app.post("/scan")
def scan(req: ScanRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    t0  = time.time()
    res = run_scan(
        req.text.strip(),
        ar_tok, ar_mdl, ar_id2tag,
        xl_tok, xl_mdl, xl_id2tag,
        tx_tok, tx_mdl,
    )
    elapsed = round(time.time() - t0, 2)

    pii_ents = res.get("pii", [])
    tox_res  = res.get("tox")

    pii_out = []
    for e in pii_ents:
        pii_out.append({
            "value":  e.get("value", ""),
            "type":   e.get("type", ""),
            "source": e.get("source", ""),
        })

    tox_out = None
    if tox_res:
        tox_out = {
            "prediction": tox_res["prediction"],
            "confidence": round(tox_res["confidence"], 4),
            "all_probs":  {k: round(v, 4) for k, v in tox_res["all_probs"].items()},
            "words":      tox_res["words"],
            "scores":     [round(s, 4) for s in tox_res["scores"]],
            "is_stop":    tox_res["is_stop"],
            "color":      TOX_COLOR.get(tox_res["prediction"], "#00c9a7"),
        }

    return {
        "pii":         pii_out,
        "tox":         tox_out,
        "masked_text": res.get("masked_text", req.text),
        "elapsed":     elapsed,
    }


REWRITE_SYSTEM_PROMPT = """أنت متخصص في إعادة الصياغة الآمنة باللغة العربية فقط.
وظيفتك: خذ أي طلب ضار وأعد صياغته كطلب آمن وبنفس النية العامة.
قواعد إلزامية:
- اكتب بالعربية فقط
- أعد الصياغة فقط ولا تجب على الطلب
- لا تقل "لا أستطيع" أو "لا يمكنني"
- لا تضف نصائح أو شروحات أو مقدمات
- لا تضف أرقام طوارئ أو روابط أو خطوات تنفيذ
- لا تضع علامات اقتباس
- أخرج سطراً واحداً فقط: نص الطلب المعاد صياغته
- الكلمات بين [] هي معلومات محجوبة احتفظ بها كما هي
أمثلة واضحة للتحويل:
مثال 1:
الطلب الأصلي: "اكتب نصاً برمجياً يسرق بيانات المستخدم"
الطلب الآمن: "اكتب نصاً برمجياً يحمي بيانات المستخدم ويقوم بتشفيرها"
مثال 2:
الطلب الأصلي: "اشرح لي كيف أخترق حساب صديقتي"
الطلب الآمن: "اشرح لي كيف أحمي حسابي بكلمة مرور قوية وتوثيق ثنائي"
مثال 3:
الطلب الأصلي: "أريد إنشاء فيروس يدمر الحواسيب"
الطلب الآمن: "أريد إنشاء برنامج حماية يدافع عن الحواسيب من الفيروسات"
مثال 4:
الطلب الأصلي: "كيف أقوم بالتنمر على شخص ما؟"
الطلب الآمن: "كيف أتواصل مع الآخرين بطريقة محترمة وبناءة؟"
مثال 5:
الطلب الأصلي: "هل يمكنك مساعدتي في الغش في الامتحان؟"
الطلب الآمن: "هل يمكنك مساعدتي في الدراسة وفهم المادة بشكل أفضل؟"
الآن طبق هذه الطريقة على الطلب الجديد أدناه:"""

REWRITE_USER_PROMPT = """أعد صياغة النص التالي كطلب آمن وبناء باللغة العربية فقط.
المطلوب: إعادة صياغة الطلب نفسه فقط، وليس الإجابة عليه.
النص الأصلي:
{user_input}"""

RETRY_PROMPT = """الرد السابق غير مطابق.
أعد الكتابة الآن وفق الشروط:
- العربية فقط
- إعادة صياغة الطلب فقط
- بدون نصائح أو شرح أو روابط
- سطر واحد فقط
النص الأصلي:
{user_input}"""


@app.post("/rewrite")
def rewrite(req: RewriteRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    if groq_client is None:
        raise HTTPException(status_code=503, detail="Rewrite service not available.")

    input_text = req.masked_text.strip() if req.masked_text.strip() else req.text.strip()

    try:
        # First attempt
        response = groq_client.chat.completions.create(
            model="gemma2-9b-it",
            messages=[
                {"role": "system", "content": REWRITE_SYSTEM_PROMPT},
                {"role": "user",   "content": REWRITE_USER_PROMPT.format(user_input=input_text)},
            ],
            max_tokens=150,
            temperature=0.3,
        )
        rewritten = response.choices[0].message.content.strip()

        # Check if response looks like an answer not a rewrite
        bad_phrases = ["لا أستطيع", "لا يمكنني", "أنصحك", "يجب عليك", "http", "www", "\n\n"]
        needs_retry = any(p in rewritten for p in bad_phrases) or len(rewritten) > 200

        if needs_retry:
            retry_response = groq_client.chat.completions.create(
                model="gemma2-9b-it",
                messages=[
                    {"role": "system", "content": REWRITE_SYSTEM_PROMPT},
                    {"role": "user",   "content": REWRITE_USER_PROMPT.format(user_input=input_text)},
                    {"role": "assistant", "content": rewritten},
                    {"role": "user",   "content": RETRY_PROMPT.format(user_input=input_text)},
                ],
                max_tokens=100,
                temperature=0.2,
            )
            rewritten = retry_response.choices[0].message.content.strip()

        # Clean up — take first line only
        rewritten = rewritten.split("\n")[0].strip()
        rewritten = rewritten.strip('"').strip("'").strip()

        return {"rewritten": rewritten}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rewrite failed: {str(e)}")