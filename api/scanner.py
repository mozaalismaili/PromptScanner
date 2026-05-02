import torch
import torch.nn.functional as F
import json
import re
import os
import threading
import numpy as np
from pathlib import Path
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    AutoModelForSequenceClassification,
)
from huggingface_hub import snapshot_download

# ─────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────
ARABERT_CATEGORIES = ['PERS', 'ORG', 'ADDRESS', 'DATETIME']
XLMR_CATEGORIES    = ['ID', 'CREDENTIAL']
REGEX_CATEGORIES   = ['PHONE', 'EMAIL', 'IP', 'MAC', 'URL', 'FINANCIAL_INFO']

TOX_IDX2LABEL = {
    0: 'Dangerous',
    1: 'Mental Health',
    2: 'Mild Offense',
    3: 'Normal',
    4: 'Obscene',
    5: 'Offensive',
    6: 'Privacy Violation',
}
TOX_LABEL2IDX = {v: k for k, v in TOX_IDX2LABEL.items()}

DANGER_CATS = {'Dangerous', 'Obscene', 'Mental Health'}
WARN_CATS   = {'Offensive', 'Privacy Violation', 'Mild Offense'}

TOX_COLOR = {
    'Normal':            '#00c9a7',
    'Mild Offense':      '#f5a623',
    'Offensive':         '#ff8c42',
    'Privacy Violation': '#4db8ff',
    'Obscene':           '#ff4d6d',
    'Dangerous':         '#ff4d6d',
    'Mental Health':     '#9b59ff',
}

ARABIC_STOP_WORDS = {
    'في','من','الي','علي','عن','مع','بين','حتي','منذ','خلال','عند','لدي','نحو',
    'فوق','تحت','امام','وراء','حول','ضد','و','او','ثم','لكن','بل','حيث','اذا',
    'لان','كي','اذ','هو','هي','هم','هن','نحن','انا','انت','انتم','هذا','هذه',
    'ذلك','تلك','هولاء','الذي','التي','الذين','اللاتي','ما','ماذا','هل','كم',
    'اين','متي','لماذا','كيف','كان','يكون','ليس','يمكن','يجب','قد','سوف','لن',
    'لم','ال','لا','ان','اي','كل','بعض','غير','نفس','جدا','ايضا','فقط','بس',
    'يعني','طيب','مش','دي','ده','لي','بي','الا','اما','اذن','مثل','عبر','ذات',
}

MODELS_DIR = Path("models")

HF_TOKEN = os.environ.get("HF_TOKEN", "")

LATIN_OR_DIGIT = re.compile(r'[a-zA-Z0-9]')

# ─────────────────────────────────────────────────────────────
# MODEL DOWNLOAD
# ─────────────────────────────────────────────────────────────
def download_models():
    marker = MODELS_DIR / ".downloaded"
    if marker.exists():
        print("Models already downloaded, skipping.")
        return
    print("Downloading models from HuggingFace...")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id="aynaalh/promptscanner-models",
        local_dir=str(MODELS_DIR),
    )
    marker.touch()
    print("Models downloaded successfully.")

# ─────────────────────────────────────────────────────────────
# REGEX ENGINE
# ─────────────────────────────────────────────────────────────
REGEX_PATTERNS = {
    'PHONE': [
        r'\+968\s?[79]\d{7}', r'00968\s?[79]\d{7}',
        r'\b[79]\d{7}\b', r'\b[79]\d{3}[\s\-]\d{4}\b',
        r'\+968\s[79]\d{3}\s\d{4}',
    ],
    'EMAIL':          [r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'],
    'IP':             [r'\b(?:\d{1,3}\.){3}\d{1,3}\b'],
    'MAC':            [r'\b([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b', r'\b[0-9A-Fa-f]{12}\b'],
    'URL':            [r'https?://[^\s<>"]+', r'www\.[^\s<>"]+'],
    'FINANCIAL_INFO': [
        r'\b4\d{3}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b',
        r'\b5[1-5]\d{2}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b',
        r'\bOM\d{2}[A-Z]{3}\d{16}\b',
    ],
}

def regex_detect(text):
    found = []
    for pii_type, patterns in REGEX_PATTERNS.items():
        for pat in patterns:
            for m in re.finditer(pat, text):
                found.append({'value': m.group(), 'type': pii_type,
                               'char_start': m.start(), 'char_end': m.end(), 'source': 'regex'})
    found.sort(key=lambda x: (x['char_start'], -(x['char_end'] - x['char_start'])))
    filtered, last_end = [], -1
    for it in found:
        if it['char_start'] >= last_end:
            filtered.append(it)
            last_end = it['char_end']
    return filtered

# ─────────────────────────────────────────────────────────────
# ID / CREDENTIAL POST-FILTER
# ─────────────────────────────────────────────────────────────
def _is_valid_id_or_credential(value: str) -> bool:
    """Return True only if value could plausibly be an ID or credential."""
    if not value or len(value.strip()) < 2:
        return False
    return bool(LATIN_OR_DIGIT.search(value))
 
def _filter_entities(entities: list) -> list:
    """Remove ID/CREDENTIAL detections that are provably wrong."""
    filtered = []
    for e in entities:
        if e['type'] in ('ID', 'CREDENTIAL'):
            if not _is_valid_id_or_credential(e['value']):
                continue
        filtered.append(e)
    return filtered

# ─────────────────────────────────────────────────────────────
# MODEL LOADING
# ─────────────────────────────────────────────────────────────
def load_arabert():
    path = MODELS_DIR / "arabert_pii_aug" / "arabert_pii_aug"
    if not path.exists():
        print("AraBERT model directory not found:", path)
        return None, None, None
    try:
        tok   = AutoTokenizer.from_pretrained(str(path))
        model = AutoModelForTokenClassification.from_pretrained(str(path))
        model.eval()
        vocab_file = next(
            (p for p in [path/"tag_vocab.json", path/"tag_vocab_aug.json"] if p.exists()),
            None
        )
        if vocab_file is None:
            return None, None, None
        with open(vocab_file) as f:
            v = json.load(f)
        id2tag = {int(k): lbl for k, lbl in v["id2tag"].items()}
        return tok, model, id2tag
    except Exception as e:
        print("AraBERT load error:", e)
        return None, None, None


def load_xlmr():
    path = MODELS_DIR / "xlmr_pii" / "xlmr_pii_augmorg"
    if not path.exists():
        print("XLM-RoBERTa model not found at:", path)
        return None, None, None
    try:
        tok   = AutoTokenizer.from_pretrained(str(path))
        model = AutoModelForTokenClassification.from_pretrained(str(path))
        model.eval()
        vocab_file = next(
            (p for p in [path/"tag_vocab.json", path/"tag_vocab_augmorg.json"] if p.exists()),
            None
        )
        if vocab_file is None:
            return None, None, None
        with open(vocab_file) as f:
            v = json.load(f)
        id2tag = {int(k): lbl for k, lbl in v["id2tag"].items()}
        return tok, model, id2tag
    except Exception as e:
        print("XLMR load error:", e)
        return None, None, None


def load_toxicity():
    path = MODELS_DIR / "tox_model"
    if not path.exists():
        return None, None

    ckpt_file = None
    for candidate in ["arabert_expanded.pt", "arabert_contrast.pt", "best_model.pt"]:
        if (path / candidate).exists():
            ckpt_file = path / candidate
            break
    if ckpt_file is None:
        pts = list(path.glob("*.pt"))
        if pts:
            ckpt_file = pts[0]

    if ckpt_file is None:
        return None, None

    try:
        NUM_CLASSES = 7
        BASE_MODEL  = "aubmindlab/bert-base-arabertv02"
        tok   = AutoTokenizer.from_pretrained(BASE_MODEL)
        model = AutoModelForSequenceClassification.from_pretrained(
            BASE_MODEL, num_labels=NUM_CLASSES,
            ignore_mismatched_sizes=True,
            attn_implementation="eager",
        )
        ckpt = torch.load(str(ckpt_file), map_location="cpu", weights_only=False)
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()
        return tok, model
    except Exception as e:
        print("Toxicity load error:", e)
        return None, None

# ─────────────────────────────────────────────────────────────
# ARABIC PREPROCESSING
# ─────────────────────────────────────────────────────────────
def clean_arabic(text):
    if not text:
        return ""
    text = re.sub(r'[\u0617-\u061A\u064B-\u0652]', '', text)
    text = re.sub(r'[إأآا]', 'ا', text)
    text = re.sub(r'ى', 'ي', text)
    text = re.sub(r'ة', 'ه', text)
    text = re.sub(r'ؤ', 'و', text)
    text = re.sub(r'ئ', 'ي', text)
    text = re.sub(r'[^\u0600-\u06FF\s]', '', text)
    return re.sub(r'\s+', ' ', text).strip()

# ─────────────────────────────────────────────────────────────
# NER PREDICTION
# ─────────────────────────────────────────────────────────────
def _token_char_ranges(tokens):
    ranges, pos = {}, 0
    for i, tok in enumerate(tokens):
        ranges[i] = (pos, pos + len(tok))
        pos += len(tok) + 1
    return ranges

def _token_overlaps_regex(tok_s, tok_e, tok_char, regex_spans):
    if tok_s not in tok_char:
        return False
    cs = tok_char[tok_s][0]
    ce = tok_char.get(tok_e - 1, tok_char[tok_s])[1]
    return any(not (ce <= rs or cs >= re_) for rs, re_ in regex_spans)

CHUNK_SIZE    = 200  # tokens per chunk
CHUNK_OVERLAP = 30   # overlap to catch boundary entities

def _predict_ner(text, tokenizer, model, id2tag):
    tokens = text.split()
    if not tokens: return []

    # Build overlapping chunks
    chunks = []
    start  = 0
    while start < len(tokens):
        end = min(start + CHUNK_SIZE, len(tokens))
        chunks.append((start, tokens[start:end]))
        if end == len(tokens):
            break
        start += CHUNK_SIZE - CHUNK_OVERLAP

    all_entities = []

    for chunk_start, chunk_tokens in chunks:
        inputs = tokenizer(
            chunk_tokens, is_split_into_words=True, return_tensors="pt",
            truncation=True, padding=True, max_length=256,
        )
        with torch.no_grad():
            preds = torch.argmax(model(**inputs).logits, dim=2)[0].tolist()
        word_ids  = inputs.word_ids(0)
        word_pred = {}
        for idx, wid in enumerate(word_ids):
            if wid is not None and wid not in word_pred:
                word_pred[wid] = id2tag.get(preds[idx], "O")

        entities, cur, cur_toks = [], None, []
        for i, tok in enumerate(chunk_tokens):
            tag = word_pred.get(i, "O")
            if tag.startswith("B-"):
                if cur:
                    entities.append({
                        "value": " ".join(cur_toks),
                        "type":  cur,
                        "token_start": chunk_start + i - len(cur_toks),
                        "token_end":   chunk_start + i,
                    })
                cur, cur_toks = tag[2:], [tok]
            elif tag.startswith("I-") and cur == tag[2:]:
                cur_toks.append(tok)
            else:
                if cur:
                    entities.append({
                        "value": " ".join(cur_toks),
                        "type":  cur,
                        "token_start": chunk_start + i - len(cur_toks),
                        "token_end":   chunk_start + i,
                    })
                cur, cur_toks = None, []
        if cur:
            entities.append({
                "value": " ".join(cur_toks),
                "type":  cur,
                "token_start": chunk_start + len(chunk_tokens) - len(cur_toks),
                "token_end":   chunk_start + len(chunk_tokens),
            })
        all_entities.extend(entities)

    # De-duplicate: remove same value+type detected in overlapping chunks
    seen    = set()
    unique  = []
    for e in all_entities:
        key = (e["value"].strip(), e["type"])
        if key not in seen:
            seen.add(key)
            unique.append(e)

    return unique

def _bio_to_spans(tokens, labels):
    spans, cur_label, cur_toks, cur_start = [], None, [], None
    for i, (tok, lbl) in enumerate(zip(tokens, labels)):
        if lbl.startswith('B-'):
            if cur_label:
                spans.append((cur_label, cur_start, i, cur_toks[:]))
            cur_label, cur_start, cur_toks = lbl[2:], i, [tok]
        elif lbl.startswith('I-') and cur_label == lbl[2:]:
            cur_toks.append(tok)
        else:
            if cur_label:
                spans.append((cur_label, cur_start, i, cur_toks[:]))
            cur_label, cur_start, cur_toks = None, None, []
    if cur_label:
        spans.append((cur_label, cur_start, len(tokens), cur_toks[:]))
    return spans

# ─────────────────────────────────────────────────────────────
# HYBRID PII DETECTOR
# ─────────────────────────────────────────────────────────────
def hybrid_detect(text, ar_tok, ar_mdl, ar_id2tag, xl_tok, xl_mdl, xl_id2tag):
    regex_ents  = regex_detect(text)
    regex_spans = [(e['char_start'], e['char_end']) for e in regex_ents]
    all_ents    = list(regex_ents)

    cleaned = clean_arabic(text)
    tokens  = cleaned.split()
    if not tokens:
        return all_ents

    tok_char = _token_char_ranges(tokens)

    if ar_mdl is not None:
        try:
            ar_labels = _predict_ner(cleaned, ar_tok, ar_mdl, ar_id2tag)
            for lbl, ts, te, toks in _bio_to_spans(tokens, ar_labels):
                if lbl not in ARABERT_CATEGORIES:
                    continue
                if _token_overlaps_regex(ts, te, tok_char, regex_spans):
                    continue
                all_ents.append({
                    'value': ' '.join(toks), 'type': lbl,
                    'token_start': ts, 'token_end': te, 'source': 'arabert'
                })
        except Exception as e:
            print("AraBERT inference error:", e)

    if xl_mdl is not None:
        try:
            xl_labels = _predict_ner(cleaned, xl_tok, xl_mdl, xl_id2tag)
            for lbl, ts, te, toks in _bio_to_spans(tokens, xl_labels):
                if lbl not in XLMR_CATEGORIES:
                    continue
                if _token_overlaps_regex(ts, te, tok_char, regex_spans):
                    continue
                all_ents.append({
                    'value': ' '.join(toks), 'type': lbl,
                    'token_start': ts, 'token_end': te, 'source': 'xlmr'
                })
        except Exception as e:
            print("XLM-R inference error:", e)

    return _filter_entities(all_ents)

# ─────────────────────────────────────────────────────────────
# TOXICITY PREDICTION
# ─────────────────────────────────────────────────────────────
def predict_toxicity_with_attention(text, tokenizer, model):
    processed = clean_arabic(text)
    if not processed: return None

    # Split into word chunks of 100 words with 20 word overlap
    words_all = processed.split()
    CHUNK_W   = 100
    OVERLAP_W = 20

    if len(words_all) <= CHUNK_W:
        # Short enough — process as single chunk (original behavior)
        chunks = [processed]
    else:
        chunks = []
        start  = 0
        while start < len(words_all):
            end = min(start + CHUNK_W, len(words_all))
            chunks.append(" ".join(words_all[start:end]))
            if end == len(words_all): break
            start += CHUNK_W - OVERLAP_W

    best_result = None

    for chunk_text in chunks:
        enc  = tokenizer(chunk_text, max_length=128, padding="max_length",
                         truncation=True, return_tensors="pt")
        ids  = enc["input_ids"]
        mask = enc["attention_mask"]
        tids = enc.get("token_type_ids", torch.zeros_like(ids))

        with torch.no_grad():
            out   = model(ids, attention_mask=mask, token_type_ids=tids,
                          output_attentions=True)
            probs = F.softmax(out.logits, dim=1).squeeze().cpu().numpy()

        pred_idx   = int(np.argmax(probs))
        pred_label = TOX_IDX2LABEL[pred_idx]
        confidence = float(probs[pred_idx])

        # Keep the most harmful prediction across all chunks
        SEVERITY = {
            "Normal": 0, "Mild Offense": 1, "Offensive": 2,
            "Privacy Violation": 2, "Obscene": 3,
            "Mental Health": 3, "Dangerous": 4
        }
        if best_result is None or \
           SEVERITY.get(pred_label, 0) > SEVERITY.get(best_result["prediction"], 0) or \
           (pred_label == best_result["prediction"] and confidence > best_result["confidence"]):

            # Extract attention for this chunk
            attn   = torch.stack(out.attentions)[:, 0, :, 0, :].mean(dim=(0,1)).cpu().numpy()
            tokens = tokenizer.convert_ids_to_tokens(ids.squeeze().cpu().numpy())
            actual_len = mask.sum().item()
            tokens, attn = tokens[:actual_len], attn[:actual_len]

            words, scores, cur_w, cur_s = [], [], "", []
            for tok, sc in zip(tokens, attn):
                if tok in ["[CLS]","[SEP]","[PAD]","<s>","</s>","<pad>"]: continue
                if tok.startswith("##"): cur_w += tok[2:]; cur_s.append(sc)
                elif tok.startswith("+"): cur_w += tok.replace("+",""); cur_s.append(sc)
                else:
                    if cur_w: words.append(cur_w); scores.append(float(max(cur_s)))
                    cur_w, cur_s = tok.replace("+",""), [sc]
            if cur_w: words.append(cur_w); scores.append(float(max(cur_s)))

            scores_arr = np.array(scores, dtype=float)
            filtered   = np.array([0.0 if w in ARABIC_STOP_WORDS else s
                                    for w, s in zip(words, scores_arr)])
            is_stop    = [w in ARABIC_STOP_WORDS for w in words]
            if filtered.max() > 0: filtered /= filtered.max()

            best_result = {
                "prediction": pred_label,
                "confidence": confidence,
                "all_probs":  {TOX_IDX2LABEL[i]: float(p) for i, p in enumerate(probs)},
                "words":      words,
                "scores":     filtered.tolist(),
                "is_stop":    is_stop,
            }

    return best_result

# ─────────────────────────────────────────────────────────────
# MASKED TEXT BUILDER
# ─────────────────────────────────────────────────────────────
def build_masked_text(text, entities):
    char_ents = sorted(
        [e for e in entities if "char_start" in e],
        key=lambda x: x["char_start"], reverse=True
    )
    out = text
    for e in char_ents:
        out = out[:e["char_start"]] + f'[{e["type"]}]' + out[e["char_end"]:]
    tok_ents = [e for e in entities if "token_start" in e]
    for e in tok_ents:
        if e["value"] and e["value"] in out:
            out = out.replace(e["value"], f'[{e["type"]}]', 1)
    return out

# ─────────────────────────────────────────────────────────────
# PARALLEL SCAN
# ─────────────────────────────────────────────────────────────
def run_scan(text, ar_tok, ar_mdl, ar_id2tag, xl_tok, xl_mdl, xl_id2tag, tx_tok, tx_mdl):
    results = {}

    def pii_job():
        results["pii"] = hybrid_detect(text, ar_tok, ar_mdl, ar_id2tag,
                                        xl_tok, xl_mdl, xl_id2tag)
    def tox_job():
        if tx_mdl is not None:
            results["tox"] = predict_toxicity_with_attention(text, tx_tok, tx_mdl)
        else:
            results["tox"] = None

    t1 = threading.Thread(target=pii_job)
    t2 = threading.Thread(target=tox_job)
    t1.start(); t2.start()
    t1.join();  t2.join()

    pii_ents    = results.get("pii", [])
    masked_text = build_masked_text(text, pii_ents)
    results["masked_text"] = masked_text
    return results
