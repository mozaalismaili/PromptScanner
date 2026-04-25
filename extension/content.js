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
  let extensionSending = false; // flag: we triggered this send, skip scan
  let lastText         = "";
  let attachedTA       = null;
  let attachedBtn      = null;

  // ── TEXTAREA HELPERS ──────────────────────────────────

  function getTextareaText(el) {
    if (!el) return "";
    return (el.innerText || el.value || el.textContent || "").trim();
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
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("delete", false, null);
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
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
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    }
  }

  function triggerSend(ta) {
    extensionSending = true; // mark as extension-triggered
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
    // Reset flag after send completes
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

    chrome.storage.sync.get({ autoScan: true }, (settings) => {
      if (!settings.autoScan) return;

      interceptActive = true;
      lastText        = text;
      clearTextarea(ta);

      chrome.runtime.sendMessage({
        type:     "SCAN_PROMPT",
        text:     text,
        hostname: hostname,
      });
    });
  }

  // ── EVENT HANDLERS ────────────────────────────────────

  function handleKeydown(e) {
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
    attachListeners();
    if (interceptActive && !extensionSending) {
      setTimeout(() => { if (interceptActive) resetInterceptor(); }, 5000);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  attachListeners();

  // ── MESSAGE LISTENER ──────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "SEND_DECISION") return;

    const ta = document.querySelector(config.textarea);

    if (msg.decision === "cancel") {
      // Restore text so user can edit it
      if (lastText && ta) setTextareaText(ta, lastText);
      resetInterceptor();
      return;
    }

    const textToSend = msg.decision === "rewritten"
      ? msg.rewrittenText
      : msg.decision === "masked"
      ? msg.maskedText
      : msg.originalText || lastText;

    resetInterceptor();

    if (!textToSend || !ta) return;

    // Step 1: set text
    setTextareaText(ta, textToSend);

    // Step 2: wait for framework to register, then send
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

})();