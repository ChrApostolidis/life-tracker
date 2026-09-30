// Screens never fetch: every call goes through the service worker, so the
// backend is only ever reached from one place.

// Pages load fresh from disk on every open, but the service worker keeps running
// the code it started with until the extension is reloaded. A page newer than its
// worker sends messages the worker has no handler for, which arrive unanswered.
const RELOAD = 'The extension was updated. Reload it in chrome://extensions';

export async function send(type, payload = {}) {
  try {
    const response = await chrome.runtime.sendMessage({ type, ...payload });
    return response ?? { ok: false, error: RELOAD };
  } catch {
    // No worker to receive it at all, e.g. it failed to start after an update.
    return { ok: false, error: RELOAD };
  }
}
