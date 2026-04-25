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

  let interceptActive  = false;
  let extensionSending = false;
  let lastText         = "";
  let attachedTA       = null;
  let attachedBtn      = null;

  // ── CHECK EXTENSION CONTEXT ───────────────────────────
  function isExtensionValid() {
    try {
      return !!chrome.runtime?.id;
    } catch (e) {
      return false;
    }
  }

  // ── TEXTAREA HELPERS ──────────────────────────────────

  function getTextareaText(el) {
    if (!el) return "";
    return (el.innerText || el.value || el.textContent || "").trim();
  }

  function clearTextarea(el) {
    if (!el) return;
    try {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, "value"
        )?.set;
        if (nativeSetter) nativeSetter.call(el, "");
        else el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        el.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("delete", false, null);
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
    } catch (e) {}
  }

  function setTextareaText(el, text) {
    if (!el) return;
    try {
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
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertText", false, text);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      }
    } catch (e) {}
  }

  function triggerSend(ta) {
    extensionSending = true;
    try {
      const btn = document.querySelector(config.sendBtn);
      if (btn && !btn.disabled) {
        btn.click();
      } else if (ta) {
        ta.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13,
          bubbles: true, cancelable: true, composed: true,
          shiftKey: false,
        }));
      }
    } catch (e) {}
    setTimeout(() => { extensionSending = false; }, 1000);
  }

  // ── RESET ─────────────────────────────────────────────

  function resetInterceptor() {
    interceptActive  = false;
    extensionSending = false;
    lastText         = "";
  }

  // ── INTERCEPT ─────────────────────────────────────────

  function interceptPrompt(text, ta) {
    if (interceptActive || extensionSending || !text) return;
    if (!isExtensionValid()) return;

    try {
      chrome.storage.sync.get({ autoScan: true }, (settings) => {
        if (chrome.runtime.lastError) return;
        if (!settings.autoScan) return;

        interceptActive = true;
        lastText        = text;
        clearTextarea(ta);

        try {
          chrome.runtime.sendMessage({
            type:     "SCAN_PROMPT",
            text:     text,
            hostname: hostname,
          });
        } catch (e) {
          // Extension context lost — restore text
          resetInterceptor();
          if (ta) setTextareaText(ta, text);
        }
      });
    } catch (e) {
      // Extension context invalidated
      resetInterceptor();
    }
  }

  // ── EVENT HANDLERS ────────────────────────────────────

  function handleKeydown(e) {
    if (!isExtensionValid()) return;
    if (extensionSending) return;
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
    if (!isExtensionValid()) return;
    if (extensionSending) return;
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

  function attachListeners() {
    const ta  = document.querySelector(config.textarea);
    const btn = document.querySelector(config.sendBtn);

    if (attachedTA && attachedTA !== ta) {
      attachedTA.removeEventListener("keydown", handleKeydown, true);
      delete attachedTA.dataset.psAttached;
      attachedTA = null;
    }
    if (attachedBtn && attachedBtn !== btn) {
      attachedBtn.removeEventListener("click", handleSendClick, true);
      delete attachedBtn.dataset.psAttached;
      attachedBtn = null;
    }
    if (ta && !ta.dataset.psAttached) {
      ta.addEventListener("keydown", handleKeydown, true);
      ta.dataset.psAttached = "true";
      attachedTA = ta;
    }
    if (btn && !btn.dataset.psAttached) {
      btn.addEventListener("click", handleSendClick, true);
      btn.dataset.psAttached = "true";
      attachedBtn = btn;
    }
  }

  // ── MUTATION OBSERVER ─────────────────────────────────

  const observer = new MutationObserver(() => {
    if (!isExtensionValid()) {
      observer.disconnect();
      return;
    }
    attachListeners();
    if (interceptActive && !extensionSending) {
      setTimeout(() => { if (interceptActive) resetInterceptor(); }, 5000);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  attachListeners();

  // ── MESSAGE LISTENER ──────────────────────────────────

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type !== "SEND_DECISION") return;

      const ta = document.querySelector(config.textarea);

      if (msg.decision === "cancel") {
        if (lastText && ta) setTextareaText(ta, lastText);
        resetInterceptor();
        return;
      }

      const textToSend =
        msg.decision === "rewritten" ? msg.rewrittenText :
        msg.decision === "masked"    ? msg.maskedText    :
        msg.originalText || lastText;

      resetInterceptor();

      if (!textToSend || !ta) return;

      setTextareaText(ta, textToSend);

      setTimeout(() => {
        const current = getTextareaText(ta);
        if (current) {
          triggerSend(ta);
        } else {
          setTextareaText(ta, textToSend);
          setTimeout(() => triggerSend(ta), 300);
        }
        setTimeout(() => attachListeners(), 800);
      }, 400);
    });
  } catch (e) {}

})();