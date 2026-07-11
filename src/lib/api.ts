import type {
  MoneyBalance,
  MoneyEntry,
  MoneyEntryInput,
  MoneyEntryPatch,
  Note,
  NoteInput,
  NotePatch,
  Task,
  TaskInput,
  TaskPatch,
} from './types';

// Base URL for the Spring backend. Override with NEXT_PUBLIC_API_URL.
// `||` (not `??`) so an empty build-time value still falls back instead of
// silently producing relative same-origin URLs.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Thrown on any non-2xx response. Spring hides the message body by default, so
// callers branch on `status`, not on text.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `Request failed (HTTP ${status})`);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Human-readable message for optimistic-mutation rollbacks.
export function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return `${fallback} (HTTP ${e.status})`;
  return fallback;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

async function request<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) throw new ApiError(res.status);
  if (res.status === 204) return undefined as T; // no content
  return (await res.json()) as T;
}

export const api = {
  // Range views: scheduledAt in half-open [from, to), excludes inbox, includes
  // completed, sorted by scheduledAt asc. `from`/`to` are ISO instants.
  listRange: (from: string, to: string) =>
    request<Task[]>(`/api/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // scheduledAt IS NULL AND deletedAt IS NULL
  listInbox: () => request<Task[]>('/api/inbox'),

  create: (input: TaskInput) => request<Task>('/api/tasks', { method: 'POST', body: input }),

  // Only title/scheduledAt/durationMin/recurrence are applied; null = unchanged.
  update: (id: string, patch: TaskPatch) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),

  remove: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  complete: (id: string) => request<Task>(`/api/tasks/${id}/complete`, { method: 'POST' }),
  uncomplete: (id: string) => request<Task>(`/api/tasks/${id}/uncomplete`, { method: 'POST' }),

  // Standalone notes (taskId IS NULL), newest first.
  listNotes: () => request<Note[]>('/api/notes'),

  createNote: (input: NoteInput) => request<Note>('/api/notes', { method: 'POST', body: input }),

  updateNote: (id: string, patch: NotePatch) =>
    request<Note>(`/api/notes/${id}`, { method: 'PATCH', body: patch }),

  removeNote: (id: string) => request<void>(`/api/notes/${id}`, { method: 'DELETE' }),

  // Creates an inbox task from the note and soft-deletes the note; returns the task.
  promoteNote: (id: string) => request<Task>(`/api/notes/${id}/promote`, { method: 'POST' }),

  // Money entries: occurredOn in half-open [from, to), local 'YYYY-MM-DD' dates.
  listMoney: (from: string, to: string) =>
    request<MoneyEntry[]>(`/api/money?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  createMoney: (input: MoneyEntryInput) =>
    request<MoneyEntry>('/api/money', { method: 'POST', body: input }),

  updateMoney: (id: string, patch: MoneyEntryPatch) =>
    request<MoneyEntry>(`/api/money/${id}`, { method: 'PATCH', body: patch }),

  removeMoney: (id: string) => request<void>(`/api/money/${id}`, { method: 'DELETE' }),

  // All-time { earnedCents, spentCents } — the piggy bank balance.
  moneyBalance: () => request<MoneyBalance>('/api/money/balance'),
};
