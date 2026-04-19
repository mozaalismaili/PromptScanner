const API_URL = "https://promptscanner-production.up.railway.app";

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "SCAN_PROMPT") {
    handleScan(msg.text, msg.hostname, sender.tab.id);
  }

  if (msg.type === "REWRITE_PROMPT") {
    handleRewrite(msg.text, msg.tox_label, sender.tab.id);
  }

  if (msg.type === "SEND_DECISION") {
    chrome.tabs.sendMessage(msg.tabId, {
      type:         "SEND_DECISION",
      decision:     msg.decision,
      rewrittenText: msg.rewrittenText || "",
      originalText:  msg.originalText  || "",
    });
  }
});

async function handleScan(text, hostname, tabId) {
  try {
    chrome.action.setBadgeText({ text: "...", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#f5a623", tabId });

    const response = await fetch(`${API_URL}/scan`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const result = await response.json();

    await chrome.storage.session.set({
      scanResult:   result,
      originalText: text,
      tabId:        tabId,
      hostname:     hostname,
    });

    const hasPii = result.pii && result.pii.length > 0;
    const tox    = result.tox?.prediction;
    const isNormal = tox === "Normal" || tox === null || tox === undefined;

    if (hasPii || !isNormal) {
      chrome.action.setBadgeText({ text: "!", tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#ff4d6d", tabId });
    } else {
      chrome.action.setBadgeText({ text: "OK", tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#00c9a7", tabId });
    }

    await chrome.action.openPopup();

  } catch (err) {
    console.error("PromptScanner scan error:", err);
    chrome.action.setBadgeText({ text: "ERR", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#ff4d6d", tabId });

    await chrome.storage.session.set({
      scanError:    err.message,
      originalText: text,
      tabId:        tabId,
    });

    await chrome.action.openPopup();
  }
}

async function handleRewrite(text, tox_label, tabId) {
  try {
    const response = await fetch(`${API_URL}/rewrite`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text, tox_label }),
    });

    if (!response.ok) throw new Error(`Rewrite API error: ${response.status}`);
    const result = await response.json();

    chrome.runtime.sendMessage({
      type:      "REWRITE_RESULT",
      rewritten: result.rewritten,
    });

  } catch (err) {
    chrome.runtime.sendMessage({
      type:  "REWRITE_ERROR",
      error: err.message,
    });
  }
}