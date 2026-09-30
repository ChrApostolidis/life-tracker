// Every network call goes through here, via lib/api.js. A host permission lifts
// Chrome's CORS check for the service worker; the backend still checks Origin
// itself, which is why this extension's ID is pinned in the manifest and listed
// in app.cors.allowed-origins.
import { api, describeError } from './lib/api.js';
import { addDays, isSameDay, startOfDay, toDateInput } from './lib/dates.js';
import { flushQueue, queueStatus, sendOrQueue } from './lib/queue.js';

const FLUSH_ALARM = 'flush-queue';
const BADGE_ALARM = 'refresh-badge';
const BADGE = { accent: '#6b9bd1', warning: '#fbbf24', text: '#0e0f12' };

// The same three lists the web app's Today view combines.
async function loadToday() {
  const now = new Date();
  const from = startOfDay(now);
  const [scheduled, inbox, overdue] = await Promise.all([
    api.listRange(from.toISOString(), addDays(from, 1).toISOString()),
    api.listInbox(),
    api.listOverdue(),
  ]);
  return {
    scheduled,
    // Mirrors DayView: open inbox items, plus ones finished today.
    inbox: inbox.filter((t) => !t.completedAt || isSameDay(t.completedAt, now)),
    overdue,
  };
}

// Counts what is due: overdue plus today's open scheduled tasks. The inbox is
// left out on purpose, since it holds unsorted thoughts rather than deadlines
// and would keep the number permanently high.
async function refreshBadge(today) {
  try {
    const { scheduled, overdue } = today ?? (await loadToday());
    const open = overdue.length + scheduled.filter((t) => !t.completedAt).length;
    await chrome.action.setBadgeText({ text: open > 0 ? String(open) : '' });
    await chrome.action.setBadgeBackgroundColor({
      color: overdue.length > 0 ? BADGE.warning : BADGE.accent,
    });
    await chrome.action.setBadgeTextColor({ color: BADGE.text });
  } catch {
    // A stale count is worse than none, so clear it until the server answers.
    await chrome.action.setBadgeText({ text: '' });
  }
}

async function flushAndRefresh() {
  if ((await flushQueue()) > 0) await refreshBadge();
}

const handlers = {
  async createTask({ title, scheduledAt, source, rawTranscript }) {
    const result = await sendOrQueue('task', { title, scheduledAt, source, rawTranscript });
    if (result.ok && !result.queued) refreshBadge();
    return result;
  },

  createJournal: ({ title, body, tags, source, rawTranscript }) =>
    sendOrQueue('journal', { title, body, tags, source, rawTranscript }),

  async getToday() {
    const today = await loadToday();
    refreshBadge(today);
    return { ok: true, ...today };
  },

  async setDone({ task, done }) {
    await api.setDone(task, done);
    refreshBadge();
    return { ok: true };
  },

  // Not queued, like ticking: an edit replayed later could overwrite a newer
  // change made in the web app.
  async updateTask({ id, patch, toInbox }) {
    if (Object.keys(patch).length > 0) await api.updateTask(id, patch);
    if (toInbox) await api.unschedule(id);
    refreshBadge();
    return { ok: true };
  },

  async getJournalToday() {
    const today = startOfDay(new Date());
    const entries = await api.listJournalEntries(toDateInput(today), toDateInput(addDays(today, 1)));
    return { ok: true, entries };
  },

  async queueStatus() {
    return { ok: true, ...(await queueStatus()) };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message.type];
  if (!handler) return false;
  handler(message)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: describeError(e) }));
  return true; // keeps the channel open for the async reply
});

// Alarms can be cleared on a browser restart, so they are recreated on startup
// as well as on install.
function start() {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 5 });
  flushAndRefresh();
  refreshBadge();
}
chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);

chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === FLUSH_ALARM) flushAndRefresh();
  if (name === BADGE_ALARM) refreshBadge();
});

// A new backend address is the moment a queued backlog can finally go out.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.apiUrl) start();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-side-panel' || !tab) return;
  // No screen to report to from a shortcut, so the reason goes to the
  // extension's error list in chrome://extensions.
  chrome.sidePanel
    .open({ windowId: tab.windowId })
    .catch((e) => console.error(`Could not open the side panel: ${e.message}`));
});
