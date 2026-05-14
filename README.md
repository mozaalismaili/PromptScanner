# PromptScanner Chrome Extension

A Manifest V3 Chrome extension that intercepts Arabic prompts on AI chatbot platforms, detects personal information and harmful content before submission, and gives users full control over what gets sent.

## What It Does

When a user types a prompt and presses Send or Enter on a supported platform, PromptScanner intercepts the text before it reaches the AI. It sends the prompt to the PromptScanner backend for analysis, then opens a popup showing the results. The user then decides whether to send the original prompt, send a masked version with personal data removed, request a safe rewrite, or cancel entirely.

## Supported Platforms

- ChatGPT (chatgpt.com)
- Google Gemini (gemini.google.com)
- Claude (claude.ai)
- Microsoft Copilot (copilot.microsoft.com)
- Perplexity (perplexity.ai)

## File Structure

```
extension/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── popup.css
├── options.html
├── options.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## File Descriptions

### manifest.json
The extension configuration file required by Chrome. It declares the extension name, version, permissions, and which scripts to load. PromptScanner uses Manifest V3, the current Chrome standard. It requests the minimum permissions needed: `activeTab` to read the current tab, `storage` to save user settings, and `scripting` to inject the content script. Host permissions are declared for each of the five supported platforms.

### content.js
This script is injected into every supported platform page. Its job is to intercept the prompt before it is submitted. It uses a `MutationObserver` to watch for DOM changes, since all five supported platforms are Single Page Applications that replace their input elements during navigation. Each platform has its own CSS selector configuration so the script knows which textarea and send button to target. When the user presses Send or Enter, the script captures the text, clears the input field, and sends a message to `background.js` to begin scanning. An `extensionSending` flag prevents the script from intercepting its own re-injection of the final text.

### background.js
This is the service worker, which runs in the background separate from any tab. It receives the prompt text from `content.js`, calls the `/scan` endpoint on the Railway backend over HTTPS, and evaluates the result. If the content is clean and the user has disabled the safe popup setting, it silently re-injects the original text and triggers the send button without any interruption. If PII or harmful content is detected, it stores the scan result in `chrome.storage.session` and opens the popup automatically. An `isScanning` lock prevents race conditions when the user submits rapidly.

### popup.html
The HTML structure of the popup window that appears when a scan result is ready. It defines the layout for all possible states: loading, error, safe content, PII detection, toxic content, and post-rewrite. All text content is populated dynamically by `popup.js` to support both Arabic and English.

### popup.js
The main logic for the popup interface. On load it reads the scan result from session storage and renders the appropriate view. It builds the masked text display by replacing entity placeholders with labelled tags, renders the toxicity card with confidence score and progress bar, and builds the keyword attention highlight where each word is coloured according to its influence score from the AraBERT attention layer. It handles all button actions: sending the masked text, sending the original, requesting a rewrite from the backend, and cancelling. It also manages the settings panel where users can toggle dark mode, switch between Arabic and English, and configure scanning behaviour.

### popup.css
All styles for the popup interface. Implements the PromptScanner brand using the cream, navy, and orange colour palette. Includes full dark mode support, RTL layout for Arabic, and responsive sizing for the fixed-width popup.

### options.html and options.js
A full settings page accessible from the extension management screen. Provides the same settings as the popup panel but in a larger, more accessible format for users who prefer to configure the extension separately from the scanning workflow.

## How the Interception Works

1. The user types a prompt and presses Send or Enter on a supported platform.
2. `content.js` captures the keydown or click event using `capture: true`, which fires before the platform's own event handlers.
3. The prompt text is extracted, the input field is cleared, and the text is sent to `background.js`.
4. `background.js` posts the text to `POST /scan` on the Railway backend.
5. The backend runs PII detection and toxicity classification in parallel and returns results within one to two seconds.
6. If the result is clean and the user has auto-send enabled, the original text is silently re-injected and sent.
7. If issues are found, the result is stored in session storage and the popup opens.
8. The user makes a decision and the chosen text is re-injected into the input field and submitted programmatically.

## Settings

| Setting | Default | Description |
|---|---|---|
| Dark Mode | Off | Switches the popup to a dark colour scheme |
| Language | Arabic | Sets the popup interface language |
| Show popup for safe content | Off | When off, clean prompts are sent automatically without any popup |
| Auto Scan | On | When off, scanning does not activate on submit |

## Backend

The extension communicates with the PromptScanner FastAPI backend deployed on Railway at `https://promptscanner-production.up.railway.app`. All communication is over HTTPS. Only the masked text (never the original) is forwarded to the Groq API during prompt rewriting.

## Installation

The extension is available on the Chrome Web Store. Search for PromptScanner or use the direct link. After installing, pin the extension to the toolbar by clicking the puzzle piece icon and selecting the pin next to PromptScanner.

## Privacy

No prompt text is stored anywhere. Scan results are kept only in `chrome.storage.session`, which is cleared automatically when the browser session ends. The Railway backend processes prompts in memory and does not log or persist any user data.
