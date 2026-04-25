const DEFAULTS = {
  darkMode: false,
  showSafe: false,
  autoScan: true,
};

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULTS);

  document.getElementById('darkMode').checked = settings.darkMode;
  document.getElementById('showSafe').checked  = settings.showSafe;
  document.getElementById('autoScan').checked  = settings.autoScan;

  applyDarkMode(settings.darkMode);

  document.getElementById('darkMode').addEventListener('change', (e) => {
    applyDarkMode(e.target.checked);
  });
}

function applyDarkMode(enabled) {
  document.body.classList.toggle('dark', enabled);
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const settings = {
    darkMode: document.getElementById('darkMode').checked,
    showSafe: document.getElementById('showSafe').checked,
    autoScan: document.getElementById('autoScan').checked,
  };

  await chrome.storage.sync.set(settings);

  const msg = document.getElementById('savedMsg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
});

document.addEventListener('DOMContentLoaded', loadSettings);