const TOX_LABELS_AR = {
  "Normal":            "عادي",
  "Mild Offense":      "مسيء بشكل خفيف",
  "Offensive":         "مسيء",
  "Privacy Violation": "انتهاك الخصوصية",
  "Obscene":           "محتوى فاضح",
  "Dangerous":         "خطير",
  "Mental Health":     "صحة نفسية",
};

const TOX_BADGES_AR = {
  "Normal":            { text: "آمن",    cls: "badge-safe" },
  "Mild Offense":      { text: "تحذير",  cls: "badge-warn" },
  "Offensive":         { text: "تحذير",  cls: "badge-warn" },
  "Privacy Violation": { text: "تحذير",  cls: "badge-warn" },
  "Obscene":           { text: "مُبلَّغ", cls: "badge-flag" },
  "Dangerous":         { text: "مُبلَّغ", cls: "badge-flag" },
  "Mental Health":     { text: "خطر",    cls: "badge-crit" },
};

const PII_LABELS_AR = {
  "PERS":           "شخص",
  "ORG":            "مؤسسة",
  "ADDRESS":        "عنوان",
  "DATETIME":       "تاريخ",
  "ID":             "هوية",
  "CREDENTIAL":     "بيانات دخول",
  "PHONE":          "هاتف",
  "EMAIL":          "بريد إلكتروني",
  "IP":             "عنوان IP",
  "MAC":            "عنوان MAC",
  "URL":            "رابط",
  "FINANCIAL_INFO": "معلومات مالية",
};

const DEFAULTS = {
  darkMode: false,
  showSafe: false,
  autoScan: true,
};

let currentResult   = null;
let currentOriginal = null;
let currentTabId    = null;
let rewrittenText   = null;
let userSettings    = { ...DEFAULTS };

function show(id) { document.getElementById(id)?.classList.remove("hidden"); }
function hide(id) { document.getElementById(id)?.classList.add("hidden"); }
function el(id)   { return document.getElementById(id); }

async function loadSettings() {
  userSettings = await chrome.storage.sync.get(DEFAULTS);
  if (userSettings.darkMode) document.body.classList.add("dark");
}

function buildMaskedHtml(maskedText) {
  return maskedText.replace(/\[(.*?)\]/g, (match, type) => {
    const arLabel = PII_LABELS_AR[type] || type;
    return `<span class="tag-pii">[${arLabel}]</span>`;
  });
}

function buildHighlightHtml(words, scores, isStop, colorHex) {
  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    return `${parseInt(hex.slice(0,2),16)},${parseInt(hex.slice(2,4),16)},${parseInt(hex.slice(4,6),16)}`;
  }
  const rgb = hexToRgb(colorHex);
  return words.map((word, i) => {
    const score = scores[i];
    const stop  = isStop[i];
    if (stop) {
      return `<span class="hl-word hl-stop">${word}</span>`;
    } else if (score > 0.7) {
      const a = (0.15 + score * 0.75).toFixed(2);
      return `<span class="hl-word hl-high" style="background:rgba(${rgb},${a});" title="${score.toFixed(2)}">${word}</span>`;
    } else if (score > 0.4) {
      const a = (0.1 + score * 0.65).toFixed(2);
      return `<span class="hl-word hl-med" style="background:rgba(${rgb},${a});color:${colorHex};">${word}</span>`;
    } else if (score > 0.1) {
      const a = (0.05 + score * 0.4).toFixed(2);
      return `<span class="hl-word hl-low" style="background:rgba(${rgb},${a});">${word}</span>`;
    } else {
      return `<span class="hl-word hl-dim">${word}</span>`;
    }
  }).join(" ");
}

function isSafe(result) {
  const hasPii   = result.pii && result.pii.length > 0;
  const tox      = result.tox?.prediction;
  const isNormal = !tox || tox === "Normal";
  return !hasPii && isNormal;
}

function renderResult(result) {
  hide("loading-view");
  hide("error-view");
  show("result-view");

  el("elapsed-text").textContent = `تم الفحص في ${result.elapsed}s`;

  // Masked text
  const maskedBox = el("masked-text");
  if (result.pii && result.pii.length > 0) {
    maskedBox.innerHTML = buildMaskedHtml(result.masked_text);
  } else {
    maskedBox.innerHTML = `<span class="no-pii">✓ لا توجد معلومات شخصية</span>`;
  }

  // Toxicity
  const tox = result.tox;
  if (tox) {
    const arLabel = TOX_LABELS_AR[tox.prediction] || tox.prediction;
    const badge   = TOX_BADGES_AR[tox.prediction] || { text: "غير معروف", cls: "badge-warn" };
    const color   = tox.color || "#00C9A7";
    const conf    = (tox.confidence * 100).toFixed(1);

    el("tox-card").style.borderRightColor = color;
    el("tox-label").textContent           = arLabel;
    el("tox-label").style.color           = color;
    el("tox-badge").textContent           = badge.text;
    el("tox-badge").className             = `tox-badge ${badge.cls}`;
    el("tox-conf").textContent            = `درجة الثقة: ${conf}%`;
    el("pbar-fill").style.width           = `${conf}%`;
    el("pbar-fill").style.background      = color;

    // Keywords
    if (tox.words && tox.words.length > 0 && tox.prediction !== "Normal") {
      el("hl-words").innerHTML = buildHighlightHtml(
        tox.words, tox.scores, tox.is_stop, color
      );
      show("hl-section");
    }

    // Show rewrite button only if flagged
    if (tox.prediction !== "Normal") {
      show("btn-rewrite");
    }
  } else {
    el("tox-card").innerHTML = `<div class="no-pii">نموذج السمية غير متاح</div>`;
  }
}

function renderError(msg) {
  hide("loading-view");
  hide("result-view");
  show("error-view");
  el("error-msg").textContent = msg || "حدث خطأ غير متوقع.";
}

function sendDecision(decision) {
  chrome.runtime.sendMessage({
    type:          "SEND_DECISION",
    decision:      decision,
    tabId:         currentTabId,
    originalText:  currentOriginal,
    rewrittenText: rewrittenText || "",
  });
  window.close();
}

async function init() {
  await loadSettings();

  const data = await chrome.storage.session.get([
    "scanResult", "scanError", "originalText", "tabId"
  ]);

  currentOriginal = data.originalText || "";
  currentTabId    = data.tabId;

  if (data.scanError) {
    renderError(data.scanError);
    return;
  }

  if (data.scanResult) {
    currentResult = data.scanResult;

    // Auto-send if safe and user disabled showSafe
    if (isSafe(currentResult) && !userSettings.showSafe) {
      sendDecision("original");
      return;
    }

    renderResult(currentResult);
  } else {
    show("loading-view");
  }
}

// Settings button
el("btn-settings")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Rewrite
el("btn-rewrite")?.addEventListener("click", () => {
  if (!currentResult || !currentOriginal) return;
  const tox_label = currentResult.tox?.prediction || "Offensive";
  hide("btn-rewrite");
  show("rewrite-loading");
  chrome.runtime.sendMessage({
    type:        "REWRITE_PROMPT",
    text:        currentOriginal,
    masked_text: currentResult.masked_text || "",
    tox_label:   tox_label,
  });
});

// Cancel
el("btn-cancel")?.addEventListener("click", () => sendDecision("cancel"));
el("btn-cancel-error")?.addEventListener("click", () => sendDecision("cancel"));

// Send original
el("btn-send-orig")?.addEventListener("click", () => sendDecision("original"));
el("btn-send-anyway")?.addEventListener("click", () => sendDecision("original"));

// Send rewritten
el("btn-send-new")?.addEventListener("click", () => {
  if (!rewrittenText) return;
  sendDecision("rewritten");
});

// Rewrite result listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "REWRITE_RESULT") {
    hide("rewrite-loading");
    rewrittenText = msg.rewritten;
    el("rewrite-box").textContent = msg.rewritten;
    show("rewrite-section");
    show("btn-send-new");
  }
  if (msg.type === "REWRITE_ERROR") {
    hide("rewrite-loading");
    show("btn-rewrite");
    el("rewrite-box").textContent = "فشل في إعادة الصياغة. حاول مرة أخرى.";
    show("rewrite-section");
  }
});

document.addEventListener("DOMContentLoaded", init);