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


@app.post("/rewrite")
def rewrite(req: RewriteRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    if groq_client is None:
        raise HTTPException(status_code=503, detail="Rewrite service not available.")

    system_prompt = (
        "أنت مساعد متخصص في إعادة صياغة النصوص العربية الضارة إلى نسخ آمنة ومحايدة. "
        f"النص المُدخل صُنِّف ضمن فئة: {req.tox_label}. "
        "أعد كتابة النص بحيث يُعبّر عن نفس المعنى الجوهري بأسلوب آمن ومقبول. "
        "لا تُضف أي تفسيرات أو مقدمات — فقط أعِد كتابة النص مباشرة باللغة العربية."
    )

    try:
        response = groq_client.chat.completions.create(
            model="qwen-2.5-7b-instruct",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": req.text.strip()},
            ],
            max_tokens=512,
            temperature=0.7,
        )
        rewritten = response.choices[0].message.content.strip()
        return {"rewritten": rewritten}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rewrite failed: {str(e)}")