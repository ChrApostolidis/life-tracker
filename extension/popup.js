import { captureTask, savedMessage, showQueue } from './lib/capture.js';
import { setStatus, wireChoiceChips } from './lib/ui.js';
import { attachDictation, initVoiceControls } from './lib/voice.js';

const form = document.getElementById('capture');
const input = document.getElementById('title');
const micButton = document.getElementById('mic');
const statusLine = document.getElementById('status');
const queueLine = document.getElementById('queue');

const report = (message, kind, optionsLink) => setStatus(statusLine, message, kind, optionsLink);
const when = wireChoiceChips(document.getElementById('when'), () => input.focus());

let dictation = null;
let windowId = null;

// sidePanel.open() must run straight from the click, before any await, or
// Chrome no longer counts it as a user gesture. So the window id is fetched early.
document.getElementById('open-panel').addEventListener('click', () => {
  // Unpacked extensions read the popup from disk on every open but the manifest
  // only on reload, so a new popup can run against an old manifest without sidePanel.
  if (!chrome.sidePanel) {
    report('Reload the extension in chrome://extensions to finish updating it', 'error');
    return;
  }
  if (windowId === null) return;
  chrome.sidePanel
    .open({ windowId })
    // Close only once it has opened: closing first can cut the call short.
    .then(() => window.close())
    .catch((e) => report(`Could not open the side panel: ${e.message}`, 'error'));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (dictation?.listening) {
    report('Stop dictating before saving', 'error');
    return;
  }
  const title = input.value.trim();
  if (!title) return;

  input.disabled = true;
  report('Saving');
  const result = await captureTask(title, when.value, dictation?.rawTranscript ?? null);
  input.disabled = false;
  input.focus();

  if (result.ok) {
    // The popup stays open so several things can be captured in one go.
    input.value = '';
    if (dictation) dictation.rawTranscript = null;
    report(...savedMessage(result, when.value));
    showQueue(queueLine);
  } else {
    // A failed capture must never lose what was typed.
    report(result.error, 'error', result.error.includes('options'));
  }
});

async function init() {
  chrome.windows.getCurrent().then((w) => (windowId = w.id));
  input.focus();

  const { apiUrl } = await chrome.storage.local.get('apiUrl');
  if (!apiUrl) {
    input.disabled = true;
    report('Set your API URL first.', 'error', true);
    return;
  }

  const getLang = await initVoiceControls([micButton], [document.getElementById('lang')]);
  if (getLang) dictation = attachDictation({ field: input, button: micButton, getLang, report });
  showQueue(queueLine);
}

init();
