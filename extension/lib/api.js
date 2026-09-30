// The only module that talks to the backend, and it only runs in the service
// worker. When auth arrives, it is added in request() and nowhere else.

export class ApiError extends Error {
  constructor(status, host) {
    super(`${host} said ${status}`);
    this.status = status;
  }
}
export class NetworkError extends Error {}
export class ConfigError extends Error {}

async function request(path, { method = 'GET', body } = {}) {
  const { apiUrl } = await chrome.storage.local.get('apiUrl');
  if (!apiUrl) throw new ConfigError();

  const init = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, init);
  } catch {
    throw new NetworkError();
  }
  // Name the host: the web app and the API live on similar hostnames, and a
  // 404 from the wrong one is otherwise indistinguishable from a broken API.
  if (!res.ok) throw new ApiError(res.status, new URL(apiUrl).host);
  if (res.status === 204) return undefined;
  return res.json();
}

export const api = {
  // Half-open [from, to), recurring occurrences already expanded server-side.
  listRange: (from, to) =>
    request(`/api/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  listInbox: () => request('/api/inbox'),
  // Never contains recurring tasks: a missed occurrence simply recurs.
  listOverdue: () => request('/api/tasks/overdue'),
  createTask: (input) => request('/api/tasks', { method: 'POST', body: input }),
  // null means "leave unchanged", so moving a task back to the Inbox is unschedule().
  // On a recurring task the id is the series template, so this edits every day.
  updateTask: (id, patch) => request(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),
  unschedule: (id) => request(`/api/tasks/${id}/unschedule`, { method: 'POST' }),

  // Half-open ['YYYY-MM-DD', 'YYYY-MM-DD'), newest first.
  listJournalEntries: (from, to) =>
    request(`/api/journal-entries?from=${from}&to=${to}`),
  createJournalEntry: (input) => request('/api/journal-entries', { method: 'POST', body: input }),

  // Occurrences of a recurring series share the template's id, so they are
  // addressed by date; the plain endpoint would act on the whole series.
  setDone(task, done) {
    const verb = done ? 'complete' : 'uncomplete';
    const path = task.occurrenceDate
      ? `/api/tasks/${task.id}/occurrences/${task.occurrenceDate}/${verb}`
      : `/api/tasks/${task.id}/${verb}`;
    return request(path, { method: 'POST' });
  },
};

// Worth retrying later: the server never answered, or said it is unavailable
// (Cloudflare's 530 when the tunnel is down, a 502-504 mid-deploy).
export function isTransient(e) {
  return e instanceof NetworkError || (e instanceof ApiError && e.status >= 500);
}

export function describeError(e) {
  if (e instanceof ConfigError) return 'Set your API URL in options';
  if (e instanceof NetworkError) return 'Could not reach the API';
  if (e instanceof ApiError) return e.message;
  return 'Something went wrong';
}
