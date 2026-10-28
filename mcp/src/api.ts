// The only module that talks to the backend. The Bearer token is added in
// request() and nowhere else.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { apiHost, apiOrigin, dataDir } from './config.ts';
import type {
  DayNote,
  DayNoteInput,
  Exercise,
  ExerciseSession,
  Habit,
  HabitCheck,
  JournalEntry,
  JournalEntryInput,
  MoneyEntry,
  MoneyEntryInput,
  Note,
  NoteInput,
  Project,
  ProjectItem,
  ProjectItemInput,
  ProjectStage,
  ProjectSummary,
  ProjectUpdate,
  ProjectUpdateInput,
  ProgressionSuggestion,
  SleepLog,
  Task,
  TaskInput,
  TaskPatch,
  WorkoutSummary,
} from './types.ts';

export class ApiError extends Error {
  status: number;
  // Seconds the server asked us to wait, e.g. after too many login attempts.
  retryAfter: number | null;

  constructor(status: number, retryAfter: number | null) {
    super(`${apiHost} said ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends Error {}

const TOKENS_FILE = join(dataDir, 'tokens.json');
const TIMEOUT_MS = 15_000;

// Keyed by API origin, so a dev token is never sent to production.
async function readTokens(): Promise<Record<string, string>> {
  let text: string;
  try {
    text = await readFile(TOKENS_FILE, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    throw new Error(`${TOKENS_FILE} is not valid JSON. Delete it and log in again.`);
  }
}

export async function getToken(): Promise<string | null> {
  return (await readTokens())[apiOrigin] ?? null;
}

export async function setToken(token: string | null): Promise<void> {
  const tokens = await readTokens();
  if (token) tokens[apiOrigin] = token;
  else delete tokens[apiOrigin];
  await mkdir(dataDir, { recursive: true });
  await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };

async function request<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const token = await getToken();
  // No token, no header: that works while the backend is not enforcing auth.
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${apiOrigin}${path}`, init);
  } catch {
    throw new NetworkError(`Could not reach ${apiHost}`);
  }
  // The token expired or was revoked. A wrong password on login is a 401 too,
  // and must not count.
  if (res.status === 401 && token && !path.startsWith('/api/auth/')) {
    await setToken(null);
  }
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After')) || null;
    throw new ApiError(res.status, retryAfter);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// For lookups where a 404 is the normal "nothing there" answer.
async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

const q = encodeURIComponent;

export const api = {
  // Answers { token } for every client but 'web', which gets a cookie instead.
  login: (password: string) =>
    request<{ token?: string } | undefined>('/api/auth/login', {
      method: 'POST',
      body: { password, client: 'mcp' },
    }),
  // Revokes the session the Bearer header names.
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  // 204 when signed in, and always 204 while the backend is not enforcing auth.
  me: () => request<void>('/api/auth/me'),

  // Half-open [from, to) ISO instants; recurring occurrences come expanded.
  listTasks: (fromIso: string, toIso: string) =>
    request<Task[]>(`/api/tasks?from=${q(fromIso)}&to=${q(toIso)}`),
  listInbox: () => request<Task[]>('/api/inbox'),
  // Never contains recurring tasks: a missed occurrence simply recurs.
  listOverdue: () => request<Task[]>('/api/tasks/overdue'),
  // A recurring task comes back as its template (occurrenceDate null).
  getTask: (id: string) => request<Task>(`/api/tasks/${q(id)}`),
  createTask: (input: TaskInput) => request<Task>('/api/tasks', { method: 'POST', body: input }),
  patchTask: (id: string, patch: TaskPatch) => request<Task>(`/api/tasks/${q(id)}`, { method: 'PATCH', body: patch }),
  // Clears scheduledAt and any recurrence, which PATCH cannot.
  unscheduleTask: (id: string) => request<Task>(`/api/tasks/${q(id)}/unschedule`, { method: 'POST' }),
  // The plain endpoint for a one-off task, the occurrence one for a day of a series.
  setTaskDone: (id: string, done: boolean, occurrenceDate?: string) => {
    const verb = done ? 'complete' : 'uncomplete';
    const path = occurrenceDate
      ? `/api/tasks/${q(id)}/occurrences/${q(occurrenceDate)}/${verb}`
      : `/api/tasks/${q(id)}/${verb}`;
    return request<Task>(path, { method: 'POST' });
  },

  // All habits, archived included.
  listHabits: () => request<Habit[]>('/api/habits'),
  // Half-open ['YYYY-MM-DD', 'YYYY-MM-DD'), like every date-range call below.
  listHabitChecks: (from: string, to: string) =>
    request<HabitCheck[]>(`/api/habit-checks?from=${from}&to=${to}`),
  // Idempotent both ways; unchecking hard-deletes the row.
  checkHabit: (id: string, date: string) =>
    request<HabitCheck>(`/api/habits/${q(id)}/checks/${q(date)}`, { method: 'POST' }),
  uncheckHabit: (id: string, date: string) =>
    request<void>(`/api/habits/${q(id)}/checks/${q(date)}`, { method: 'DELETE' }),

  getDayNote: (date: string) => orNull(request<DayNote>(`/api/day-notes/${q(date)}`)),
  listDayNotes: (from: string, to: string) =>
    request<DayNote[]>(`/api/day-notes?from=${from}&to=${to}`),
  // Upsert by date; a blank body clears the entry.
  saveDayNote: (date: string, input: DayNoteInput) =>
    request<DayNote>(`/api/day-notes/${q(date)}`, { method: 'POST', body: input }),
  // Both dates or neither; neither returns every entry. Newest first.
  listJournalEntries: (from?: string, to?: string) =>
    request<JournalEntry[]>(
      from && to ? `/api/journal-entries?from=${from}&to=${to}` : '/api/journal-entries',
    ),
  createJournalEntry: (input: JournalEntryInput) =>
    request<JournalEntry>('/api/journal-entries', { method: 'POST', body: input }),

  createNote: (input: NoteInput) => request<Note>('/api/notes', { method: 'POST', body: input }),

  listSleepLogs: (from: string, to: string) =>
    request<SleepLog[]>(`/api/sleep-logs?from=${from}&to=${to}`),
  // Upsert by the morning woken.
  saveSleepLog: (date: string, input: { bedAt: string; wokeAt: string }) =>
    request<SleepLog>(`/api/sleep-logs/${q(date)}`, { method: 'POST', body: input }),

  listMoney: (from: string, to: string) =>
    request<MoneyEntry[]>(`/api/money?from=${from}&to=${to}`),
  createMoney: (input: MoneyEntryInput) => request<MoneyEntry>('/api/money', { method: 'POST', body: input }),

  listProjects: () => request<ProjectSummary[]>('/api/projects'),
  getProject: (id: string) => request<Project>(`/api/projects/${q(id)}`),
  listProjectItems: (id: string) => request<ProjectItem[]>(`/api/projects/${q(id)}/items`),
  listProjectUpdates: (id: string) => request<ProjectUpdate[]>(`/api/projects/${q(id)}/updates`),
  // Appended to the end of its stage.
  createProjectItem: (projectId: string, input: ProjectItemInput) =>
    request<ProjectItem>(`/api/projects/${q(projectId)}/items`, { method: 'POST', body: input }),
  // index counts among the target stage's other items. Answers with the whole board.
  moveProjectItem: (id: string, stage: ProjectStage, index: number) =>
    request<ProjectItem[]>(`/api/project-items/${q(id)}/move`, { method: 'POST', body: { stage, index } }),
  createProjectUpdate: (projectId: string, input: ProjectUpdateInput) =>
    request<ProjectUpdate>(`/api/projects/${q(projectId)}/updates`, { method: 'POST', body: input }),

  // Archived exercises included, so history keeps its names.
  listExercises: () => request<Exercise[]>('/api/exercises'),
  listWorkouts: () => request<WorkoutSummary[]>('/api/workouts'),
  getExerciseHistory: (id: string, limit: number) =>
    request<ExerciseSession[]>(`/api/exercises/${q(id)}/history?limit=${limit}`),
  getExerciseSuggestion: (id: string) =>
    request<ProgressionSuggestion>(`/api/exercises/${q(id)}/suggestion`),
};

// Worth retrying later: the server never answered, or said it is unavailable
// (Cloudflare's 530 when the tunnel is down, a 502-504 mid-deploy).
export function isTransient(e: unknown): boolean {
  return e instanceof NetworkError || (e instanceof ApiError && e.status >= 500);
}

export function describeError(e: unknown): string {
  if (e instanceof NetworkError) return `Life Tracker server is unreachable (${apiHost})`;
  if (e instanceof ApiError && e.status === 401) return 'Not logged in. Run: node mcp/dist/cli.js login';
  if (e instanceof ApiError && e.status >= 500) {
    return `Life Tracker server is unavailable (${apiHost} said ${e.status})`;
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

// Separate because a wrong password is also a 401, and must not say "log in".
export function describeLoginError(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) return 'Wrong password';
  if (e instanceof ApiError && e.status === 429) {
    const minutes = e.retryAfter ? Math.ceil(e.retryAfter / 60) : null;
    return minutes ? `Too many tries. Try again in ${minutes} min` : 'Too many tries. Try again later';
  }
  if (e instanceof ApiError && e.status === 400) {
    return `${apiHost} rejected the login request (400). It may not accept the 'mcp' client yet.`;
  }
  return describeError(e);
}
