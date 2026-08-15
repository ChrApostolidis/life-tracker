export type Recurrence = 'daily' | 'weekly' | 'monthly';
export type Task = {
  id: string;
  title: string;
  scheduledAt: string | null;       // null = inbox / unscheduled
  durationMin: number | null;
  recurrence: Recurrence | null;    // non-null = this row is a series template
  recurrenceDay: number | null;     // 0 (Sun) – 6 (Sat) for weekly
  recurrenceUntil: string | null;
  completedAt: string | null;       // null = not done. Always null on a raw template.
  deletedAt: string | null;         // non-null = soft-deleted
  source: 'text' | 'voice';
  rawTranscript: string | null;
  createdAt: string;
  updatedAt: string;
  occurrenceDate: string | null;
};

// Payload for POST /api/tasks. Server sets id/createdAt/updatedAt. Recurring
// tasks (recurrence set) require scheduledAt — it anchors the whole series.
export type TaskInput = {
  title: string;
  scheduledAt: string | null;
  durationMin?: number | null;
  recurrence?: Recurrence | null;
  recurrenceDay?: number | null;
  recurrenceUntil?: string | null;
  source?: 'text' | 'voice';
  rawTranscript?: string | null; // original speech-to-text, kept after edits
};

// Payload for PATCH /api/tasks/{id}. Only these fields are applied server-side,
// and null means "leave unchanged" — you cannot clear a field via PATCH. On a
// recurring template this edits the whole series — no per-occurrence edits.
export type TaskPatch = Partial<
  Pick<Task, 'title' | 'scheduledAt' | 'durationMin' | 'recurrence' | 'recurrenceDay' | 'recurrenceUntil'>
>;

// Mirrors the backend notes entity. taskId is null for standalone notes
// (the /notes library); non-null is reserved for task-attached notes. bookId
// is non-null for one entry in a book's thought stream (see Book below) —
// mutually exclusive with taskId in practice, though nothing enforces that.
export type Note = {
  id: string;
  taskId: string | null;
  bookId: string | null;
  body: string;
  source: 'text' | 'voice';
  rawTranscript: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Payload for PATCH /api/notes/{id} — only the body is editable.
export type NotePatch = Pick<Note, 'body'>;

// Payload for POST /api/notes. Server sets id/createdAt/updatedAt.
export type NoteInput = {
  body: string;
  source?: 'text' | 'voice';
  rawTranscript?: string | null; // original speech-to-text, kept after edits
  bookId?: string | null;
};

export type MoneyEntryType = 'expense' | 'income';

// Mirrors the backend money_entries entity. amountCents is always positive —
// type carries the direction. occurredOn is a local 'YYYY-MM-DD' calendar day
// (not an instant), so entries never shift across UTC midnight.
export type MoneyEntry = {
  id: string;
  type: MoneyEntryType;
  amountCents: number;
  label: string;
  category: string | null;
  occurredOn: string;
  deletedAt: string | null;         // non-null = soft-deleted
  createdAt: string;
  updatedAt: string;
};

// Payload for POST /api/money. Server sets id/createdAt/updatedAt.
export type MoneyEntryInput = {
  type: MoneyEntryType;
  amountCents: number;
  label: string;
  category?: string | null;
  occurredOn: string;
};

// Payload for PATCH /api/money/{id} — null/absent = leave unchanged; type is
// not editable.
export type MoneyEntryPatch = Partial<
  Pick<MoneyEntry, 'amountCents' | 'label' | 'category' | 'occurredOn'>
>;

// GET /api/money/balance — all-time sums; piggy bank = earned − spent.
export type MoneyBalance = {
  earnedCents: number;
  spentCents: number;
};

// Pipeline: wishlist (want to buy) -> owned (bought) -> reading -> finished.
export type BookStatus = 'wishlist' | 'owned' | 'reading' | 'finished';

// Mirrors the backend books entity. startedOn/finishedOn are local
// 'YYYY-MM-DD' calendar days, auto-stamped by the backend when status moves
// to reading/finished and the field is still empty.
export type Book = {
  id: string;
  title: string;
  author: string | null;
  status: BookStatus;
  startedOn: string | null;
  finishedOn: string | null;
  rating: number | null; // 1–5, only meaningful once status is 'finished'
  coverUrl: string | null;
  notes: string | null; // legacy single-field notes; superseded by the per-book Note[] "thoughts" stream (Note.bookId)
  deletedAt: string | null; // non-null = soft-deleted
  createdAt: string;
  updatedAt: string;
};

// Payload for POST /api/books. Server sets id/createdAt/updatedAt — a freshly
// added book has no dates/rating/notes yet.
export type BookInput = {
  title: string;
  author?: string | null;
  status: BookStatus;
  coverUrl?: string | null;
};

// Payload for PATCH /api/books/{id} — null/absent = leave unchanged (same
// convention as tasks/money). Status auto-stamps dates server-side; send
// startedOn/finishedOn explicitly in the same patch to override that.
export type BookPatch = Partial<
  Pick<Book, 'title' | 'author' | 'status' | 'startedOn' | 'finishedOn' | 'rating' | 'notes' | 'coverUrl'>
>;

// Habits are binary and daily: no time, no schedule, no target. archivedAt
// hides a habit from the checklists without touching its check history.
export type Habit = {
  id: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HabitInput = { name: string };

// PATCH payload — renaming is the only editable field.
export type HabitPatch = { name: string };

// One row = "this habit was done on this day". checkedOn is a local
// 'YYYY-MM-DD' calendar day. Unchecking deletes the row outright (see the
// backend's HabitService for why this is the one hard-delete in the app).
export type HabitCheck = {
  id: string;
  habitId: string;
  checkedOn: string;
  createdAt: string;
};

// One free-form journal entry per calendar day. entryDate is a local
// 'YYYY-MM-DD'. A blank body is not stored — saving one clears the entry (see
// the backend's DayNoteService), so every DayNote the frontend sees has real
// text. A day with no entry yet returns 404, not an empty DayNote.
export type DayNote = {
  id: string;
  entryDate: string;
  body: string;
  rating: number | null; // 1–5, purely descriptive — deliberately not fed into XP
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DayNoteInput = { body: string; rating?: number | null };

export type MediaType = 'movie' | 'series';
// 'watchlist' -> 'watched'. A series can also sit at 'watching' in between; a
// movie can't — there's no part-way state worth recording for one, and the
// backend rejects it. Use statusesFor() rather than listing these by hand.
export type WatchStatus = 'watchlist' | 'watching' | 'watched';

export function statusesFor(mediaType: MediaType): WatchStatus[] {
  return mediaType === 'series'
    ? ['watchlist', 'watching', 'watched']
    : ['watchlist', 'watched'];
}

// Mirrors the backend watch_items entity. startedOn/finishedOn are local
// 'YYYY-MM-DD' strings auto-stamped when status moves to watching/watched.
// totalSeasons/totalEpisodes are a snapshot taken from TMDB at add time and
// are null for movies (and for series where TMDB didn't report them).
export type WatchItem = {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
  posterUrl: string | null;
  // Comma-separated TMDB genre names ('Comedy, Drama'), snapshotted at add time.
  genres: string | null;
  status: WatchStatus;
  rating: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  totalSeasons: number | null;
  totalEpisodes: number | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WatchItemInput = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: string | null;
  posterUrl?: string | null;
  genres?: string | null;
  status: WatchStatus;
  totalSeasons?: number | null;
  totalEpisodes?: number | null;
};

// Payload for PATCH /api/watch-items/{id} — null/absent = leave unchanged.
// Status auto-stamps dates server-side; send startedOn/finishedOn explicitly
// to override the auto-stamp.
export type WatchItemPatch = Partial<
  Pick<WatchItem, 'title' | 'status' | 'startedOn' | 'finishedOn' | 'rating' | 'notes' | 'posterUrl' | 'genres'>
>;

// One row = "this episode was watched". Un-watching deletes the row outright
// (see the backend's WatchItemService for why — same reasoning as HabitCheck).
export type EpisodeWatch = {
  id: string;
  watchItemId: string;
  seasonNumber: number;
  episodeNumber: number;
  createdAt: string;
};

// Returned by the watch-episode endpoint: the item may have been auto-advanced
// to 'watched' server-side (finishing the last episode), so its current state
// comes back in the same response instead of requiring a separate refetch.
export type EpisodeWatchResponse = {
  episodeWatch: EpisodeWatch;
  watchItem: WatchItem;
};
