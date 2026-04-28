const STRINGS = {
  ar: {
    tagline:        "فحص الخصوصية والسلامة",
    scanning:       "جارٍ الفحص…",
    rewriting:      "جارٍ إعادة الصياغة ...",
    scannedIn:      "تم الفحص في",
    noPii:          "✓ لا توجد معلومات شخصية",
    toxUnavailable: "نموذج السمية غير متاح",
    confidence:     "درجة الثقة",
    lMasked: "◆ النص بدون معلومات خاصة",
    lTox:           "◆ تحليل السمية",
    lKeywords:      "◆ الكلمات المؤثرة",
    lRewritten:     "◆ النص المُعاد كتابته",
    btnRewrite:     "✦ إعادة الصياغة",
    btnCancel:      "✕ إلغاء",
    btnSendOrig:    "⟶ إرسال الأصلي",
    btnSendMasked:  "⟶ إرسال الأمر بدون معلومات خاصة",
    btnSendNew:     "⟶ إرسال المُعاد كتابته",
    btnSendAnyway:  "⟶ إرسال على أي حال",
    btnSend:        "⟶ إرسال",
    btnSave:        "✓ حفظ الإعدادات",
    saved:          "تم الحفظ بنجاح",
    rewriteFail:    "فشل في إعادة الصياغة. حاول مرة أخرى.",
    errorConn:      "حدث خطأ في الاتصال بالخادم.",
    sTitleAppear:   "◆ المظهر",
    sTitleBehavior: "◆ السلوك",
    sLabelDark:     "الوضع الداكن",
    sDescDark:      "تفعيل المظهر الداكن",
    sLabelLang:     "اللغة",
    sDescLang:      "لغة واجهة الإضافة",
    sLabelShowSafe: "عرض النافذة للمحتوى الآمن",
    sDescShowSafe:  "إذا كان المحتوى آمناً، اعرض النافذة. وإلا أرسل تلقائياً",
    sLabelAutoScan: "الفحص التلقائي",
    sDescAutoScan:  "فحص المحتوى عند الضغط على إرسال أو Enter",
    toxLabels: {
      "Normal":            "عادي",
      "Mild Offense":      "مسيء بشكل خفيف",
      "Offensive":         "مسيء",
      "Privacy Violation": "انتهاك الخصوصية",
      "Obscene":           "محتوى فاضح",
      "Dangerous":         "خطير",
     "Mental Health": "محتوى نفسي",
    },
    toxBadges: {
      "Normal":            { text: "آمن",    cls: "badge-safe" },
      "Mild Offense":      { text: "تحذير",  cls: "badge-warn" },
      "Offensive":         { text: "تحذير",  cls: "badge-warn" },
      "Privacy Violation": { text: "تحذير",  cls: "badge-warn" },
      "Obscene":           { text: "مُبلَّغ", cls: "badge-flag" },
      "Dangerous":         { text: "مُبلَّغ", cls: "badge-flag" },
      "Mental Health":     { text: "خطر",    cls: "badge-crit" },
    },
    piiLabels: {
      "PERS": "شخص", "ORG": "مؤسسة", "ADDRESS": "عنوان",
      "DATETIME": "تاريخ", "ID": "هوية", "CREDENTIAL": "بيانات دخول",
      "PHONE": "هاتف", "EMAIL": "بريد إلكتروني", "IP": "عنوان IP",
      "MAC": "عنوان MAC", "URL": "رابط", "FINANCIAL_INFO": "معلومات مالية",
    },
  },
  en: {
    tagline:        "Privacy & Safety Scanner",
    scanning:       "Scanning…",
    rewriting:      "Rewriting Prompt…",
    scannedIn:      "Scanned in",
    noPii:          "✓ No personal information found",
    toxUnavailable: "Toxicity model unavailable",
    confidence:     "Confidence",
    lMasked:        "◆ Masked Text",
    lTox:           "◆ Toxicity Analysis",
    lKeywords:      "◆ Key Attention Words",
    lRewritten:     "◆ Rewritten Prompt",
    btnRewrite:     "✦ Rewrite",
    btnCancel:      "✕ Cancel",
    btnSendOrig:    "⟶ Send Original",
    btnSendMasked:  "⟶ Send Masked",
    btnSendNew:     "⟶ Send Rewritten",
    btnSendAnyway:  "⟶ Send Anyway",
    btnSend:        "⟶ Send",
    btnSave:        "✓ Save Settings",
    saved:          "Settings saved!",
    rewriteFail:    "Rewrite failed. Please try again.",
    errorConn:      "Failed to connect to server.",
    sTitleAppear:   "◆ Appearance",
    sTitleBehavior: "◆ Behavior",
    sLabelDark:     "Dark Mode",
    sDescDark:      "Enable dark theme",
    sLabelLang:     "Language",
    sDescLang:      "Extension UI language",
    sLabelShowSafe: "Show popup for safe content",
    sDescShowSafe:  "If content is safe, show popup. Otherwise send automatically",
    sLabelAutoScan: "Auto Scan",
    sDescAutoScan:  "Scan content when Send or Enter is pressed",
    toxLabels: {
      "Normal":            "Normal",
      "Mild Offense":      "Mild Offense",
      "Offensive":         "Offensive",
      "Privacy Violation": "Privacy Violation",
      "Obscene":           "Obscene",
      "Dangerous":         "Dangerous",
      "Mental Health":     "Mental Health",
    },
    toxBadges: {
      "Normal":            { text: "Safe",     cls: "badge-safe" },
      "Mild Offense":      { text: "Warning",  cls: "badge-warn" },
      "Offensive":         { text: "Warning",  cls: "badge-warn" },
      "Privacy Violation": { text: "Warning",  cls: "badge-warn" },
      "Obscene":           { text: "Flagged",  cls: "badge-flag" },
      "Dangerous":         { text: "Flagged",  cls: "badge-flag" },
      "Mental Health":     { text: "Critical", cls: "badge-crit" },
    },
    piiLabels: {
      "PERS": "Person", "ORG": "Organization", "ADDRESS": "Address",
      "DATETIME": "Date/Time", "ID": "ID", "CREDENTIAL": "Credential",
      "PHONE": "Phone", "EMAIL": "Email", "IP": "IP Address",
      "MAC": "MAC Address", "URL": "URL", "FINANCIAL_INFO": "Financial Info",
    },
  },
};

const DEFAULTS = {
  darkMode: false,
  showSafe: false,
  autoScan: true,
  language: "ar",
};

let currentResult   = null;
let currentOriginal = null;
let currentMasked   = null;
let currentTabId    = null;
let rewrittenText   = null;
let userSettings    = { ...DEFAULTS };
let settingsOpen    = false;
let S               = STRINGS.ar;

function show(id) { document.getElementById(id)?.classList.remove("hidden"); }
function hide(id) { document.getElementById(id)?.classList.add("hidden"); }
function el(id)   { return document.getElementById(id); }
function setText(id, text) { const e = el(id); if (e) e.textContent = text; }

// ── SCENARIO ──────────────────────────────────────────────
function getScenario(result) {
  const hasPii = result.pii && result.pii.length > 0;
  const tox    = result.tox?.prediction;
  const isTox  = tox && tox !== "Normal";
  if (isTox)  return "toxic";
  if (hasPii) return "pii";
  return "safe";
}

// ── SEND ──────────────────────────────────────────────────
function sendDecision(decision) {
  chrome.runtime.sendMessage({
    type:          "SEND_DECISION",
    decision:      decision,
    tabId:         currentTabId,
    originalText:  currentOriginal,
    maskedText:    currentMasked  || "",
    rewrittenText: rewrittenText  || "",
  });
  window.close();
}

// ── LANGUAGE ─────────────────────────────────────────────
function applyLanguage(lang) {
  S = STRINGS[lang] || STRINGS.ar;
  const isRtl = lang === "ar";
  document.documentElement.lang = lang;
  document.documentElement.dir  = isRtl ? "rtl" : "ltr";
  document.body.style.direction  = isRtl ? "rtl" : "ltr";

  setText("h-tagline",           S.tagline);
  setText("t-scanning",          S.scanning);
  setText("t-rewriting",         S.rewriting);
  setText("l-masked",            S.lMasked);
  setText("l-tox",               S.lTox);
  setText("l-keywords",          S.lKeywords);
  setText("l-rewritten",         S.lRewritten);
  setText("btn-rewrite",         S.btnRewrite);
  setText("btn-cancel-pii",      S.btnCancel);
  setText("btn-cancel-tox",      S.btnCancel);
  setText("btn-cancel-safe",     S.btnCancel);
  setText("btn-cancel-error",    S.btnCancel);
  setText("btn-send-masked",     S.btnSendMasked);
  setText("btn-send-orig-pii",   S.btnSendOrig);
  setText("btn-send-orig-tox",   S.btnSendOrig);
  setText("btn-send-rewritten",  S.btnSendNew);
  setText("btn-send-safe",       S.btnSend);
  setText("btn-send-anyway",     S.btnSendAnyway);
  setText("btn-save-settings",   S.btnSave);
  setText("saved-msg",           S.saved);
  setText("s-title-appearance",  S.sTitleAppear);
  setText("s-title-behavior",    S.sTitleBehavior);
  setText("s-label-dark",        S.sLabelDark);
  setText("s-desc-dark",         S.sDescDark);
  setText("s-label-lang",        S.sLabelLang);
  setText("s-desc-lang",         S.sDescLang);
  setText("s-label-showSafe",    S.sLabelShowSafe);
  setText("s-desc-showSafe",     S.sDescShowSafe);
  setText("s-label-autoScan",    S.sLabelAutoScan);
  setText("s-desc-autoScan",     S.sDescAutoScan);

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  if (currentResult && !settingsOpen) renderResult(currentResult);
}

function applyDarkMode(enabled) {
  document.body.classList.toggle("dark", enabled);
}

// ── SETTINGS ─────────────────────────────────────────────
async function loadSettings() {
  userSettings = await chrome.storage.sync.get(DEFAULTS);
  applyDarkMode(userSettings.darkMode);
  applyLanguage(userSettings.language);
  el("s-darkMode").checked = userSettings.darkMode;
  el("s-showSafe").checked  = userSettings.showSafe;
  el("s-autoScan").checked  = userSettings.autoScan;
  el("s-darkMode").addEventListener("change", (e) => applyDarkMode(e.target.checked));
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => applyLanguage(btn.dataset.lang));
  });
}

function toggleSettings() {
  settingsOpen = !settingsOpen;
  const gearBtn = el("btn-settings-toggle");
  if (settingsOpen) {
    hide("loading-view"); hide("result-view"); hide("error-view");
    show("settings-view");
    gearBtn.classList.add("active");
    gearBtn.textContent = "✕";
  } else {
    hide("settings-view");
    gearBtn.classList.remove("active");
    gearBtn.textContent = "⚙";
    if (currentResult) show("result-view");
    else show("loading-view");
  }
}

el("btn-settings-toggle")?.addEventListener("click", toggleSettings);

el("btn-save-settings")?.addEventListener("click", async () => {
  const activeLang = document.querySelector(".lang-btn.active")?.dataset.lang || userSettings.language;
  const newSettings = {
    darkMode: el("s-darkMode").checked,
    showSafe: el("s-showSafe").checked,
    autoScan: el("s-autoScan").checked,
    language: activeLang,
  };
  await chrome.storage.sync.set(newSettings);
  userSettings = newSettings;
  applyDarkMode(newSettings.darkMode);
  applyLanguage(newSettings.language);
  show("saved-msg");
  setTimeout(() => hide("saved-msg"), 2000);
});

// ── HELPERS ──────────────────────────────────────────────
function buildMaskedHtml(maskedText) {
  return maskedText.replace(/\[(.*?)\]/g, (_, type) => {
    const label = S.piiLabels[type] || type;
    return `<span class="tag-pii">[${label}]</span>`;
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
    if (isStop[i]) return `<span class="hl-word hl-stop">${word}</span>`;
    if (score > 0.7) return `<span class="hl-word hl-high" style="background:rgba(${rgb},${(0.15+score*0.75).toFixed(2)});">${word}</span>`;
    if (score > 0.4) return `<span class="hl-word hl-med"  style="background:rgba(${rgb},${(0.1+score*0.65).toFixed(2)});color:${colorHex};">${word}</span>`;
    if (score > 0.1) return `<span class="hl-word hl-low"  style="background:rgba(${rgb},${(0.05+score*0.4).toFixed(2)});">${word}</span>`;
    return `<span class="hl-word hl-dim">${word}</span>`;
  }).join(" ");
}

// ── RENDER ──────────────────────────────────────────────
function renderResult(result) {
  hide("loading-view"); hide("error-view"); hide("settings-view");
  hide("actions-pii");  hide("actions-tox"); hide("actions-safe");
  hide("hl-section");   hide("rewrite-section"); hide("rewrite-loading");
  show("result-view");

  el("elapsed-text").textContent = `${S.scannedIn} ${result.elapsed}s`;

  // Masked text
  const maskedBox = el("masked-text");
  if (result.pii && result.pii.length > 0) {
    maskedBox.innerHTML = buildMaskedHtml(result.masked_text);
  } else {
    maskedBox.innerHTML = `<span class="no-pii">${S.noPii}</span>`;
  }

  // Toxicity
  const tox = result.tox;
  if (tox) {
    const label = S.toxLabels[tox.prediction] || tox.prediction;
    const badge = S.toxBadges[tox.prediction] || { text: "?", cls: "badge-warn" };
    const color = tox.color || "#00C9A7";
    const conf  = (tox.confidence * 100).toFixed(1);
    el("tox-card").style.borderRightColor = color;
    el("tox-label").textContent           = label;
    el("tox-label").style.color           = color;
    el("tox-badge").textContent           = badge.text;
    el("tox-badge").className             = `tox-badge ${badge.cls}`;
    el("tox-conf").textContent            = `${S.confidence}: ${conf}%`;
    el("pbar-fill").style.width           = `${conf}%`;
    el("pbar-fill").style.background      = color;

    if (tox.words?.length > 0 && tox.prediction !== "Normal") {
      el("hl-words").innerHTML = buildHighlightHtml(tox.words, tox.scores, tox.is_stop, color);
      show("hl-section");
    }
  } else {
    el("tox-card").innerHTML = `<div class="no-pii">${S.toxUnavailable}</div>`;
  }

  // Show correct buttons
  const scenario = getScenario(result);
  if      (scenario === "pii")   show("actions-pii");
  else if (scenario === "toxic") show("actions-tox");
  else                           show("actions-safe");
}

function renderError(msg) {
  hide("loading-view"); hide("result-view");
  show("error-view");
  el("error-msg").textContent = msg || S.errorConn;
}

// ── INIT ──────────────────────────────────────────────────
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
    currentMasked = data.scanResult.masked_text || "";
    // Always render — never auto-send from popup
    renderResult(currentResult);
  } else {
    show("loading-view");
  }
}

// ── BUTTON LISTENERS ──────────────────────────────────────
// PII scenario
el("btn-send-masked")?.addEventListener("click",   () => sendDecision("masked"));
el("btn-send-orig-pii")?.addEventListener("click", () => sendDecision("original"));
el("btn-cancel-pii")?.addEventListener("click",    () => sendDecision("cancel"));

// Toxic scenario
el("btn-rewrite")?.addEventListener("click", () => {
  if (!currentResult || !currentOriginal) return;
  const tox_label = currentResult.tox?.prediction || "Offensive";
  hide("btn-rewrite");
  show("rewrite-loading");
  chrome.runtime.sendMessage({
    type:        "REWRITE_PROMPT",
    text:        currentOriginal,
    masked_text: currentMasked || "",
    tox_label:   tox_label,
  });
});
el("btn-send-rewritten")?.addEventListener("click", () => {
  if (!rewrittenText) return;
  sendDecision("rewritten");
});
el("btn-send-orig-tox")?.addEventListener("click", () => sendDecision("original"));
el("btn-cancel-tox")?.addEventListener("click",    () => sendDecision("cancel"));

// Safe scenario
el("btn-send-safe")?.addEventListener("click",   () => sendDecision("original"));
el("btn-cancel-safe")?.addEventListener("click", () => sendDecision("cancel"));

// Error
el("btn-send-anyway")?.addEventListener("click",  () => sendDecision("original"));
el("btn-cancel-error")?.addEventListener("click", () => sendDecision("cancel"));

// Rewrite result
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "REWRITE_RESULT") {
    hide("rewrite-loading");
    rewrittenText = msg.rewritten;
    el("rewrite-box").textContent = msg.rewritten;
    show("rewrite-section");
    show("btn-send-rewritten");
  }
  if (msg.type === "REWRITE_ERROR") {
    hide("rewrite-loading");
    show("btn-rewrite");
    el("rewrite-box").textContent = S.rewriteFail;
    show("rewrite-section");
  }
});

document.addEventListener("DOMContentLoaded", init);