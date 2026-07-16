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
// (the /notes library); non-null is reserved for task-attached notes.
export type Note = {
  id: string;
  taskId: string | null;
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
