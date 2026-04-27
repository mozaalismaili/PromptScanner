import os
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from sentence_transformers import SentenceTransformer, util

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
# GLOBALS
# ─────────────────────────────────────────────────────────────
ar_tok = ar_mdl = ar_id2tag = None
xl_tok = xl_mdl = xl_id2tag = None
tx_tok = tx_mdl = None
groq_client  = None
sim_model    = None

SIMILARITY_THRESHOLD = 0.80

# ─────────────────────────────────────────────────────────────
# REWRITE PROMPTS
# ─────────────────────────────────────────────────────────────
REWRITE_SYSTEM = """أنت متخصص في إعادة الصياغة الآمنة باللغة العربية فقط.
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
أمثلة:
الطلب الأصلي: "اشرح لي كيف أخترق حساب صديقتي"
الطلب الآمن: "اشرح لي كيف أحمي حسابي بكلمة مرور قوية وتوثيق ثنائي"
الطلب الأصلي: "يا حمار أنت غبي جداً"
الطلب الآمن: "أعتقد أن هذا الشخص يحتاج إلى تحسين أدائه"
الطلب الأصلي: "كيف أصنع قنبلة"
الطلب الآمن: "كيف تعمل المتفجرات من الناحية الكيميائية"
الآن طبق هذه الطريقة على الطلب الجديد:"""

REWRITE_USER = """أعد صياغة النص التالي كطلب آمن وبناء باللغة العربية فقط.
المطلوب: إعادة صياغة الطلب نفسه فقط، وليس الإجابة عليه.
النص الأصلي:
{text}"""

RETRY_SYSTEM = """أنت متخصص في إعادة الصياغة الآمنة باللغة العربية.
المحاولة السابقة لم تحافظ على المعنى الأصلي بشكل كافٍ.
أعد الصياغة مع الحفاظ على نفس الموضوع والهدف تماماً، لكن بأسلوب آمن.
قواعد صارمة:
- احتفظ بنفس الموضوع الأساسي للطلب
- فقط أزل المحتوى الضار واستبدله بصياغة مقبولة
- لا تغير الموضوع أو الهدف كلياً
- سطر واحد فقط بدون مقدمات
- الكلمات بين [] احتفظ بها كما هي"""

RETRY_USER = """النص الأصلي: {original}
إعادة الصياغة السابقة: {previous}
درجة التشابه: {score:.2f} (أقل من 0.80 — يجب تحسينها)
أعد الصياغة مع الحفاظ على نفس الموضوع بشكل أفضل:"""

# ─────────────────────────────────────────────────────────────
# LIFESPAN
# ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global ar_tok, ar_mdl, ar_id2tag
    global xl_tok, xl_mdl, xl_id2tag
    global tx_tok, tx_mdl
    global groq_client, sim_model

    print("Starting up — downloading models if needed...")
    download_models()

    print("Loading AraBERT PII model...")
    ar_tok, ar_mdl, ar_id2tag = load_arabert()

    print("Loading XLM-R PII model...")
    xl_tok, xl_mdl, xl_id2tag = load_xlmr()

    print("Loading toxicity model...")
    tx_tok, tx_mdl = load_toxicity()

    print("Loading semantic similarity model...")
    try:
        sim_model = SentenceTransformer(
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
        print("Similarity model loaded.")
    except Exception as e:
        print(f"Warning: Similarity model failed to load: {e}")
        sim_model = None

    groq_key = os.environ.get("GROQ_API_KEY", "")
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
# HELPERS
# ─────────────────────────────────────────────────────────────
def compute_similarity(text1: str, text2: str) -> float:
    """Compute cosine similarity between two Arabic texts."""
    if sim_model is None:
        return 1.0  # if model not loaded, assume ok
    try:
        emb1 = sim_model.encode(text1, convert_to_tensor=True)
        emb2 = sim_model.encode(text2, convert_to_tensor=True)
        score = float(util.cos_sim(emb1, emb2))
        return round(score, 4)
    except Exception as e:
        print(f"Similarity computation error: {e}")
        return 1.0

def call_groq(messages: list, max_tokens: int = 150, temperature: float = 0.3) -> str:
    """Call Groq API and return cleaned response."""
    response = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    text = response.choices[0].message.content.strip()
    # Take first line only, strip quotes
    text = text.split("\n")[0].strip().strip('"').strip("'").strip()
    return text

# ─────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "models": {
            "arabert":    ar_mdl is not None,
            "xlmr":       xl_mdl is not None,
            "toxicity":   tx_mdl is not None,
            "rewrite":    groq_client is not None,
            "similarity": sim_model is not None,
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

    pii_out = [
        {"value": e.get("value",""), "type": e.get("type",""), "source": e.get("source","")}
        for e in pii_ents
    ]

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


@app.post("/rewrite")
def rewrite(req: RewriteRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    if groq_client is None:
        raise HTTPException(status_code=503, detail="Rewrite service not available.")

    input_text = req.masked_text.strip() if req.masked_text.strip() else "[نص محجوب]"

    try:
        # ── ATTEMPT 1 ──────────────────────────────────────
        rewritten_1 = call_groq([
            {"role": "system", "content": REWRITE_SYSTEM},
            {"role": "user",   "content": REWRITE_USER.format(text=input_text)},
        ])

        score_1 = compute_similarity(input_text, rewritten_1)
        print(f"Rewrite attempt 1 — score: {score_1:.4f}")

        if score_1 >= SIMILARITY_THRESHOLD:
            return {
                "rewritten":        rewritten_1,
                "similarity_score": score_1,
                "attempts":         1,
                "passed":           True,
            }

        # ── ATTEMPT 2 (retry with stricter prompt) ─────────
        print(f"Score {score_1:.4f} below threshold {SIMILARITY_THRESHOLD}, retrying...")

        rewritten_2 = call_groq([
            {"role": "system", "content": RETRY_SYSTEM},
            {"role": "user",   "content": RETRY_USER.format(
                original=input_text,
                previous=rewritten_1,
                score=score_1,
            )},
        ], temperature=0.2)

        score_2 = compute_similarity(input_text, rewritten_2)
        print(f"Rewrite attempt 2 — score: {score_2:.4f}")

        # Return the best of the two attempts
        if score_2 >= score_1:
            best_text  = rewritten_2
            best_score = score_2
        else:
            best_text  = rewritten_1
            best_score = score_1

        return {
            "rewritten":        best_text,
            "similarity_score": best_score,
            "attempts":         2,
            "passed":           best_score >= SIMILARITY_THRESHOLD,
        }

    except Exception as e:
        print(f"Rewrite error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Rewrite failed: {str(e)}")