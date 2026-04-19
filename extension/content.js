(() => {
  const SITE_CONFIGS = {

    "chat.openai.com":        { textarea: "#prompt-textarea",          sendBtn: '[data-testid="send-button"]' },
    "chatgpt.com":            { textarea: "#prompt-textarea",          sendBtn: '[data-testid="send-button"]' },
    "gemini.google.com":      { textarea: ".ql-editor",               sendBtn: '[aria-label="Send message"]' },
    "claude.ai":              { textarea: ".ProseMirror",              sendBtn: '[aria-label="Send Message"]' },
    "copilot.microsoft.com":  { textarea: "#userInput",               sendBtn: '[aria-label="Submit"]' },
    "www.perplexity.ai":      { textarea: "textarea",                 sendBtn: '[aria-label="Submit"]' },
  };

  const hostname = window.location.hostname;
  const config   = SITE_CONFIGS[hostname];
  if (!config) return;

  let interceptActive = false;
  let pendingResolve  = null;

  function getTextareaText(el) {
    if (!el) return "";
    return el.innerText || el.value || el.textContent || "";
  }

  function clearTextarea(el) {
    if (!el) return;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      el.innerText = "";
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }

  function setTextareaText(el, text) {
    if (!el) return;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.innerText = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }

  function clickSendButton() {
    const btn = document.querySelector(config.sendBtn);
    if (btn && !btn.disabled) {
      btn.click();
    } else {
      const ta = document.querySelector(config.textarea);
      if (ta) {
        ta.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13,
          bubbles: true, cancelable: true
        }));
      }
    }
  }

  function handleSendDecision(decision, rewrittenText, originalText) {
    const ta = document.querySelector(config.textarea);
    if (decision === "cancel") {
      interceptActive = false;
      return;
    }
    const textToSend = decision === "rewritten" ? rewrittenText : originalText;
    setTextareaText(ta, textToSend);
    interceptActive = false;
    setTimeout(() => clickSendButton(), 100);
  }

  function interceptKeydown(e) {
    if (e.key !== "Enter" || e.shiftKey || interceptActive) return;
    const ta = document.querySelector(config.textarea);
    if (!ta) return;
    const text = getTextareaText(ta).trim();
    if (!text) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    interceptActive = true;

    chrome.runtime.sendMessage({
      type:     "SCAN_PROMPT",
      text:     text,
      hostname: hostname,
    });
  }

  function attachListener() {
    const ta = document.querySelector(config.textarea);
    if (ta && !ta.dataset.psAttached) {
      ta.addEventListener("keydown", interceptKeydown, true);
      ta.dataset.psAttached = "true";

      const sendBtn = document.querySelector(config.sendBtn);
      if (sendBtn && !sendBtn.dataset.psAttached) {
        sendBtn.addEventListener("click", (e) => {
          if (interceptActive) return;
          const currentTa = document.querySelector(config.textarea);
          const text = getTextareaText(currentTa).trim();
          if (!text) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          interceptActive = true;
          chrome.runtime.sendMessage({
            type:     "SCAN_PROMPT",
            text:     text,
            hostname: hostname,
          });
        }, true);
        sendBtn.dataset.psAttached = "true";
      }
    }
  }

  const observer = new MutationObserver(() => attachListener());
  observer.observe(document.body, { childList: true, subtree: true });
  attachListener();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SEND_DECISION") {
      handleSendDecision(msg.decision, msg.rewrittenText, msg.originalText);
    }
  });
})();