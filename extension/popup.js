const form = document.getElementById('capture');
const input = document.getElementById('title');
const status = document.getElementById('status');

function setStatus(message, kind) {
  status.textContent = message;
  status.className = kind || '';
}

// The popup opens fresh every time, so tell the user up front when there is
// nowhere to save to rather than letting the first capture fail.
chrome.storage.local.get('apiUrl').then(({ apiUrl }) => {
  if (!apiUrl) {
    input.disabled = true;
    status.innerHTML = 'Set your API URL in <a href="#" id="open-options">options</a>.';
    status.className = 'error';
    document.getElementById('open-options').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
});

input.focus();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const title = input.value.trim();
  if (!title) return;

  input.disabled = true;
  setStatus('Saving');

  const result = await chrome.runtime.sendMessage({ type: 'createTask', title });

  input.disabled = false;
  input.focus();

  if (result && result.ok) {
    // Keep the popup open so several things can be captured in one go.
    input.value = '';
    setStatus('Saved to Inbox', 'ok');
  } else {
    // Leave the text in place: a failed capture must not lose what was typed.
    setStatus((result && result.error) || 'Could not save', 'error');
  }
});
