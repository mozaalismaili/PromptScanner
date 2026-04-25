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
  let lastText        = "";
  let attachedTA      = null;
  let attachedBtn     = null;

  // ── TEXTAREA HELPERS ───────────────────────────────────
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

  // ── RESET ─────────────────────────────────────────────
  function resetInterceptor() {
    interceptActive = false;
    lastText        = "";
  }

  // ── INTERCEPT ─────────────────────────────────────────
  async function interceptPrompt(text, ta) {
    if (interceptActive || !text) return;

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

  // ── EVENT HANDLERS ────────────────────────────────────
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

  // ── ATTACH LISTENERS ──────────────────────────────────
  // Always detach from old elements and re-attach to current ones
  function attachListeners() {
    const ta  = document.querySelector(config.textarea);
    const btn = document.querySelector(config.sendBtn);

    // Detach from old textarea if it changed
    if (attachedTA && attachedTA !== ta) {
      attachedTA.removeEventListener("keydown", handleKeydown, true);
      attachedTA.dataset.psAttached = "";
      attachedTA = null;
    }

    // Detach from old button if it changed
    if (attachedBtn && attachedBtn !== btn) {
      attachedBtn.removeEventListener("click", handleSendClick, true);
      attachedBtn.dataset.psAttached = "";
      attachedBtn = null;
    }

    // Attach to new textarea
    if (ta && !ta.dataset.psAttached) {
      ta.addEventListener("keydown", handleKeydown, true);
      ta.dataset.psAttached = "true";
      attachedTA = ta;
    }

    // Attach to new button
    if (btn && !btn.dataset.psAttached) {
      btn.addEventListener("click", handleSendClick, true);
      btn.dataset.psAttached = "true";
      attachedBtn = btn;
    }
  }

  // ── MUTATION OBSERVER ─────────────────────────────────
  // Watch for DOM changes (SPA navigation, new chat, etc.)
  const observer = new MutationObserver(() => {
    attachListeners();

    // If interceptActive but textarea is now empty and has new content
    // it means the LLM responded and chat moved on — reset
    if (interceptActive) {
      const ta = document.querySelector(config.textarea);
      if (ta && getTextareaText(ta) === "" && lastText) {
        // Check if response appeared (chat updated) — reset after delay
        setTimeout(() => {
          if (interceptActive) resetInterceptor();
        }, 3000);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  attachListeners();

  // ── MESSAGE LISTENER ──────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "SEND_DECISION") return;

    const ta = document.querySelector(config.textarea);

    if (msg.decision === "cancel") {
      resetInterceptor();
      return;
    }

    const textToSend = msg.decision === "rewritten" ? msg.rewrittenText : lastText;

    resetInterceptor();

    if (!textToSend) return;

    setTextareaText(ta, textToSend);
    setTimeout(() => {
      triggerSend();
      // Re-attach listeners after send in case DOM updates
      setTimeout(() => attachListeners(), 500);
    }, 300);
  });

})();