import type {
  Book,
  BookInput,
  BookPatch,
  DayNote,
  DayNoteInput,
  EpisodeWatch,
  EpisodeWatchResponse,
  Habit,
  HabitCheck,
  HabitInput,
  HabitPatch,
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
  WatchItem,
  WatchItemInput,
  WatchItemPatch,
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
  // Includes expanded occurrences of recurring templates, merged in.
  listRange: (from: string, to: string) =>
    request<Task[]>(`/api/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // scheduledAt IS NULL AND deletedAt IS NULL
  listInbox: () => request<Task[]>('/api/inbox'),

  // scheduledAt < start of today, not completed, not deleted, not recurring
  // (a missed recurring occurrence recurs again — it doesn't carry over).
  listOverdue: () => request<Task[]>('/api/tasks/overdue'),

  create: (input: TaskInput) => request<Task>('/api/tasks', { method: 'POST', body: input }),

  // Only title/scheduledAt/durationMin/recurrence are applied; null = unchanged.
  update: (id: string, patch: TaskPatch) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),

  remove: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  complete: (id: string) => request<Task>(`/api/tasks/${id}/complete`, { method: 'POST' }),
  uncomplete: (id: string) => request<Task>(`/api/tasks/${id}/uncomplete`, { method: 'POST' }),

  // Recurring-series occurrences: `id` is the template's id, `date` a
  // 'YYYY-MM-DD' that must be a real occurrence date of that series.
  completeOccurrence: (id: string, date: string) =>
    request<Task>(`/api/tasks/${id}/occurrences/${date}/complete`, { method: 'POST' }),
  uncompleteOccurrence: (id: string, date: string) =>
    request<Task>(`/api/tasks/${id}/occurrences/${date}/uncomplete`, { method: 'POST' }),

  // Standalone notes (taskId and bookId both NULL), newest first. Pass a
  // bookId to fetch that book's thought stream instead.
  listNotes: (bookId?: string) =>
    request<Note[]>(`/api/notes${bookId ? `?bookId=${encodeURIComponent(bookId)}` : ''}`),

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

  // Books: all non-deleted, newest first. No range — single user, tiny data.
  listBooks: () => request<Book[]>('/api/books'),

  createBook: (input: BookInput) => request<Book>('/api/books', { method: 'POST', body: input }),

  updateBook: (id: string, patch: BookPatch) =>
    request<Book>(`/api/books/${id}`, { method: 'PATCH', body: patch }),

  removeBook: (id: string) => request<void>(`/api/books/${id}`, { method: 'DELETE' }),

  // Habits: all habits including archived, oldest first. No range — single
  // user, tiny data; the frontend splits active vs archived.
  listHabits: () => request<Habit[]>('/api/habits'),

  createHabit: (input: HabitInput) => request<Habit>('/api/habits', { method: 'POST', body: input }),

  updateHabit: (id: string, patch: HabitPatch) =>
    request<Habit>(`/api/habits/${id}`, { method: 'PATCH', body: patch }),

  archiveHabit: (id: string) => request<void>(`/api/habits/${id}/archive`, { method: 'POST' }),
  unarchiveHabit: (id: string) => request<void>(`/api/habits/${id}/unarchive`, { method: 'POST' }),

  // Habit checks: checkedOn in half-open [from, to), local 'YYYY-MM-DD' dates.
  listHabitChecks: (from: string, to: string) =>
    request<HabitCheck[]>(`/api/habit-checks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // Idempotent: checking an already-checked day just returns the existing row.
  checkHabit: (id: string, date: string) =>
    request<HabitCheck>(`/api/habits/${id}/checks/${date}`, { method: 'POST' }),

  uncheckHabit: (id: string, date: string) =>
    request<void>(`/api/habits/${id}/checks/${date}`, { method: 'DELETE' }),

  // Day journal: one entry per calendar day, addressed by 'YYYY-MM-DD'.
  listDayNotes: (from: string, to: string) =>
    request<DayNote[]>(`/api/day-notes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // 404 = that day has no entry. Callers treat that as empty, not as an error.
  getDayNote: (date: string) => request<DayNote>(`/api/day-notes/${date}`),

  // Upsert. A blank body clears the entry.
  saveDayNote: (date: string, input: DayNoteInput) =>
    request<DayNote>(`/api/day-notes/${date}`, { method: 'POST', body: input }),

  removeDayNote: (date: string) => request<void>(`/api/day-notes/${date}`, { method: 'DELETE' }),

  // Watch items: all non-deleted, newest first. No range — single user, tiny data.
  listWatchItems: () => request<WatchItem[]>('/api/watch-items'),

  createWatchItem: (input: WatchItemInput) =>
    request<WatchItem>('/api/watch-items', { method: 'POST', body: input }),

  updateWatchItem: (id: string, patch: WatchItemPatch) =>
    request<WatchItem>(`/api/watch-items/${id}`, { method: 'PATCH', body: patch }),

  removeWatchItem: (id: string) => request<void>(`/api/watch-items/${id}`, { method: 'DELETE' }),

  // Every episode-watch row across every series — the frontend groups by item.
  listEpisodeWatches: () => request<EpisodeWatch[]>('/api/episode-watches'),

  // Idempotent. May auto-advance the item to 'watched' — see EpisodeWatchResponse.
  watchEpisode: (id: string, season: number, episode: number) =>
    request<EpisodeWatchResponse>(`/api/watch-items/${id}/episodes/${season}/${episode}`, { method: 'POST' }),

  unwatchEpisode: (id: string, season: number, episode: number) =>
    request<void>(`/api/watch-items/${id}/episodes/${season}/${episode}`, { method: 'DELETE' }),
};
