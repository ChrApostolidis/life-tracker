const form = document.getElementById('settings');
const input = document.getElementById('api-url');
const status = document.getElementById('status');

function setStatus(message, kind) {
  status.textContent = message;
  status.className = kind || '';
}

chrome.storage.local.get('apiUrl').then(({ apiUrl }) => {
  if (apiUrl) input.value = apiUrl;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Keep only scheme, host and port: background.js appends /api/tasks itself, so
  // a pasted "http://host:8080/api" would otherwise post to /api/api/tasks and 404.
  let origin;
  try {
    origin = new URL(input.value.trim()).origin;
  } catch {
    setStatus('That is not a valid URL', 'error');
    return;
  }

  // Asked for at runtime rather than declared in the manifest, so the
  // extension never holds access to hosts it has no business calling, and the
  // home server's address stays out of the repo.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    setStatus('Chrome denied access to that host', 'error');
    return;
  }

  await chrome.storage.local.set({ apiUrl: origin });
  input.value = origin; // show what was actually saved
  setStatus('Saved', 'ok');
});
