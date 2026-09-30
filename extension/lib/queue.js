// Captures that could not be sent yet. Kept in chrome.storage so they survive
// the popup closing, a browser restart, and the home server being down.
import { api, describeError, isTransient } from './api.js';

const KEY = 'queue';

const senders = {
  task: (payload) => api.createTask(payload),
  journal: (payload) => api.createJournalEntry(payload),
};

async function load() {
  const { [KEY]: queue = [] } = await chrome.storage.local.get(KEY);
  return queue;
}

// Every mutation re-reads storage and runs one at a time. Writing back a stale
// snapshot would silently drop anything queued while a flush was sending.
let chain = Promise.resolve();
function mutate(fn) {
  const run = chain.then(async () => {
    await chrome.storage.local.set({ [KEY]: fn(await load()) });
  });
  chain = run.catch(() => {});
  return run;
}

// Sends now if possible, otherwise queues. Only transient failures are queued:
// a 4xx means the request itself is wrong, and retrying it would never help.
export async function sendOrQueue(kind, payload) {
  try {
    await senders[kind](payload);
    return { ok: true };
  } catch (e) {
    if (!isTransient(e)) return { ok: false, error: describeError(e) };
    const item = { id: crypto.randomUUID(), kind, payload, queuedAt: new Date().toISOString() };
    await mutate((queue) => [...queue, item]);
    return { ok: true, queued: true };
  }
}

let flushing = false;

// Sends queued items oldest first and returns how many went through. Stops at
// the first transient failure, since the server is evidently still down. A
// rejected item keeps its error and stays queued rather than being dropped.
export async function flushQueue() {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of await load()) {
      try {
        await senders[item.kind](item.payload);
        await mutate((queue) => queue.filter((i) => i.id !== item.id));
        sent++;
      } catch (e) {
        const lastError = describeError(e);
        await mutate((queue) => queue.map((i) => (i.id === item.id ? { ...i, lastError } : i)));
        if (isTransient(e)) break;
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export async function queueStatus() {
  const queue = await load();
  return { count: queue.length, error: queue.find((i) => i.lastError)?.lastError ?? null };
}
