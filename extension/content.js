(() => {
  const SITE_CONFIGS = {
    "chat.openai.com":       { textarea: "#prompt-textarea",  sendBtn: '[data-testid="send-button"]' },
    "chatgpt.com":           { textarea: "#prompt-textarea",  sendBtn: '[data-testid="send-button"]' },
    "gemini.google.com":     { textarea: ".ql-editor",        sendBtn: '[aria-label="Send message"]' },
    "claude.ai":             { textarea: ".ProseMirror",       sendBtn: '[aria-label="Send Message"]' },
    "copilot.microsoft.com": { textarea: "#userInput",        sendBtn: '[aria-label="Submit"]' },
    "www.perplexity.ai":     { textarea: "textarea",          sendBtn: '[aria-label="Submit"]' },
  };

  const hostname = window.location.hostname;
  const config   = SITE_CONFIGS[hostname];
  if (!config) return;

  let interceptActive = false;
  let lastText = "";

  function getTextareaText(el) {
    if (!el) return "";
    return (el.innerText || el.value || el.textContent || "").trim();
  }

  function setTextareaText(el, text) {
    if (!el) return;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set;
      if (nativeSetter) nativeSetter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    }
  }

  function clearTextarea(el) {
    if (!el) return;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set;
      if (nativeSetter) nativeSetter.call(el, "");
      else el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
    }
  }

  function triggerSend() {
    const btn = document.querySelector(config.sendBtn);
    if (btn && !btn.disabled) {
      btn.click();
      return;
    }
    const ta = document.querySelector(config.textarea);
    if (ta) {
      ta.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13,
        bubbles: true, cancelable: true, composed: true
      }));
    }
  }

  async function interceptPrompt(text, ta) {
    if (interceptActive || !text) return;

    // Check autoScan setting
    const settings = await chrome.storage.sync.get({ autoScan: true });
    if (!settings.autoScan) return;

    interceptActive = true;
    lastText = text;
    clearTextarea(ta);

    chrome.runtime.sendMessage({
      type:     "SCAN_PROMPT",
      text:     text,
      hostname: hostname,
    });
  }

  function handleKeydown(e) {
    if (e.key !== "Enter" || e.shiftKey || interceptActive) return;
    const ta = document.querySelector(config.textarea);
    if (!ta) return;
    const text = getTextareaText(ta);
    if (!text) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    interceptPrompt(text, ta);
  }

  function handleSendClick(e) {
    if (interceptActive) return;
    const ta = document.querySelector(config.textarea);
    if (!ta) return;
    const text = getTextareaText(ta);
    if (!text) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    interceptPrompt(text, ta);
  }

  function attachListeners() {
    const ta = document.querySelector(config.textarea);
    if (ta && !ta.dataset.psAttached) {
      ta.addEventListener("keydown", handleKeydown, true);
      ta.dataset.psAttached = "true";
    }
    const btn = document.querySelector(config.sendBtn);
    if (btn && !btn.dataset.psAttached) {
      btn.addEventListener("click", handleSendClick, true);
      btn.dataset.psAttached = "true";
    }
  }

  const observer = new MutationObserver(() => attachListeners());
  observer.observe(document.body, { childList: true, subtree: true });
  attachListeners();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "SEND_DECISION") return;
    const ta = document.querySelector(config.textarea);
    interceptActive = false;
    if (msg.decision === "cancel") return;
    const textToSend = msg.decision === "rewritten" ? msg.rewrittenText : lastText;
    if (!textToSend) return;
    setTextareaText(ta, textToSend);
    setTimeout(() => triggerSend(), 300);
  });
})();