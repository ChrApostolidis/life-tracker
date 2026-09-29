// Every network call lives here: a host permission lifts Chrome's CORS check for
// the service worker. The backend still checks Origin itself, which is why this
// extension's ID is pinned in the manifest and listed in app.cors.allowed-origins.

async function createTask(title) {
  const { apiUrl } = await chrome.storage.local.get('apiUrl');
  if (!apiUrl) {
    return { ok: false, error: 'No API URL set' };
  }

  const res = await fetch(`${apiUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // scheduledAt null puts it in the Inbox, the same as an undated capture
    // in the web app.
    body: JSON.stringify({ title, scheduledAt: null, source: 'text' }),
  });

  if (!res.ok) {
    // Name the host: the web app and the API live on similar hostnames, and a
    // 404 from the wrong one is otherwise indistinguishable from a broken API.
    return { ok: false, error: `${new URL(apiUrl).host} said ${res.status}` };
  }

  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'createTask') return;

  createTask(message.title)
    .then(sendResponse)
    .catch(() => {
      // A rejected fetch here is almost always the server being unreachable
      // rather than a bad response, which is the normal case on a home server.
      sendResponse({ ok: false, error: 'Could not reach the API' });
    });

  return true; // keeps the message channel open for the async reply
});
