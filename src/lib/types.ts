export type Recurrence = 'daily' | 'weekly' | 'monthly';
export type Task = {
  id: string;
  title: string;
  scheduledAt: string | null;       // null = inbox / unscheduled
  durationMin: number | null;
  recurrence: Recurrence | null;
  recurrenceDay: number | null;     // 0–6 for weekly
  recurrenceUntil: string | null;
  completedAt: string | null;       // null = not done
  deletedAt: string | null;         // non-null = soft-deleted
  source: 'text' | 'voice';
  rawTranscript: string | null;
  createdAt: string;
  updatedAt: string;
};

// Payload for POST /api/tasks. Server sets id/createdAt/updatedAt.
export type TaskInput = {
  title: string;
  scheduledAt: string | null;
  durationMin?: number | null;
  source?: 'text' | 'voice';
};

// Payload for PATCH /api/tasks/{id}. Only these fields are applied server-side,
// and null means "leave unchanged" — you cannot clear a field via PATCH.
export type TaskPatch = Partial<
  Pick<Task, 'title' | 'scheduledAt' | 'durationMin' | 'recurrence'>
>;
