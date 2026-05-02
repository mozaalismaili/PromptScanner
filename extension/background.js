const API_URL = "https://promptscanner-production.up.railway.app";

let currentTabId = null;
let isScanning   = false;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "SCAN_PROMPT") {
    currentTabId = sender.tab?.id || null;
    handleScan(msg.text, msg.hostname, currentTabId);
  }

  if (msg.type === "REWRITE_PROMPT") {
    handleRewrite(msg.text, msg.masked_text, msg.tox_label, currentTabId);
  }

  if (msg.type === "SEND_DECISION") {
    const tabId = msg.tabId || currentTabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type:          "SEND_DECISION",
        decision:      msg.decision,
        rewrittenText: msg.rewrittenText || "",
        originalText:  msg.originalText  || "",
        maskedText:    msg.maskedText    || "",
      });
    }
  }
});

async function handleScan(text, hostname, tabId) {
  if (isScanning) return;
  isScanning = true;
  try {
    if (tabId) {
      chrome.action.setBadgeText({ text: "...", tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#E8520A", tabId });
    }

    const response = await fetch(`${API_URL}/scan`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const result = await response.json();

    const hasPii   = result.pii && result.pii.length > 0;
    const tox      = result.tox?.prediction;
    const isNormal = !tox || tox === "Normal";
    const isSafe   = !hasPii && isNormal;

    // Get user setting
    const settings = await chrome.storage.sync.get({ showSafe: false });

    if (isSafe && !settings.showSafe) {
      // Safe + user doesn't want popup → send directly
      if (tabId) {
        chrome.action.setBadgeText({ text: "OK", tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#00C9A7", tabId });
        // Clear badge after 2 seconds
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "", tabId });
        }, 2000);
      }
      chrome.tabs.sendMessage(tabId, {
        type:          "SEND_DECISION",
        decision:      "original",
        originalText:  text,
        maskedText:    "",
        rewrittenText: "",
      });
      await chrome.storage.session.remove(["scanResult", "scanError", "originalText", "tabId"]);
      return;
    }

    // Not safe OR user wants popup → store and open popup
    await chrome.storage.session.set({
      scanResult:   result,
      originalText: text,
      tabId:        tabId,
      hostname:     hostname,
      scanError:    null,
    });

    if (tabId) {
      if (hasPii || !isNormal) {
        chrome.action.setBadgeText({ text: "!", tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#D93025", tabId });
      } else {
        chrome.action.setBadgeText({ text: "OK", tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#00C9A7", tabId });
      }
    }

    // Try to open popup automatically
    try {
      await chrome.action.openPopup();
    } catch (e) {
      // openPopup() failed (Chrome restriction) — badge stays, user clicks manually
      console.log("PromptScanner: click the extension icon to see results");
    }

  } catch (err) {
    console.error("PromptScanner scan error:", err);
    if (tabId) {
      chrome.action.setBadgeText({ text: "ERR", tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#D93025", tabId });
    }
    await chrome.storage.session.set({
      scanError:    err.message,
      originalText: text,
      tabId:        tabId,
      scanResult:   null,
    });
    try {
      await chrome.action.openPopup();
    } catch (e) {}
  } finally {
    isScanning = false;
  }
}

async function handleRewrite(text, masked_text, tox_label, tabId) {
  try {
    const response = await fetch(`${API_URL}/rewrite`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text, masked_text, tox_label }),
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