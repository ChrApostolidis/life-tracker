const form = document.getElementById('settings');
const input = document.getElementById('api-url');
const status = document.getElementById('status');
const micButton = document.getElementById('mic-grant');
const micStatus = document.getElementById('mic-status');

function setStatus(node, message, kind = '') {
  node.className = `status ${kind}`;
  node.textContent = message;
}

chrome.storage.local.get('apiUrl').then(({ apiUrl }) => {
  if (apiUrl) input.value = apiUrl;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Keep only scheme, host and port: lib/api.js appends /api/... itself, so a
  // pasted "http://host:8080/api" would otherwise post to /api/api/tasks and 404.
  let origin;
  try {
    origin = new URL(input.value.trim()).origin;
  } catch {
    setStatus(status, 'That is not a valid URL', 'error');
    return;
  }

  // Asked for at runtime rather than declared in the manifest, so the
  // extension never holds access to hosts it has no business calling, and the
  // home server's address stays out of the repo.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    setStatus(status, 'Chrome denied access to that host', 'error');
    return;
  }

  await chrome.storage.local.set({ apiUrl: origin });
  input.value = origin; // show what was actually saved
  setStatus(status, 'Saved', 'ok');
});

// ── Microphone ──────────────────────────────────────────────────────────────

async function showMicState() {
  try {
    const { state } = await navigator.permissions.query({ name: 'microphone' });
    if (state === 'granted') setStatus(micStatus, 'Allowed. Voice works in the popup and side panel', 'ok');
    if (state === 'denied') setStatus(micStatus, 'Blocked. Allow it from the icon at the left of the address bar', 'error');
  } catch {
    // Older Chrome cannot query this permission; the button still works.
  }
}

micButton.addEventListener('click', async () => {
  try {
    // Asking for the stream is what triggers the prompt. It is closed at once:
    // nothing is recorded here.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // Handled below: the permission state says whether it was denied or dismissed.
  }
  await showMicState();
  if (!micStatus.textContent) setStatus(micStatus, 'No answer to the prompt. Try again', 'warning');
});

showMicState();
