// Copied from the web app's src/lib/types.ts (only what this server uses); the
// backend contract is the source of truth for both.

export type Recurrence = 'daily' | 'weekly' | 'monthly';

export type Task = {
  id: string;
  title: string;
  scheduledAt: string | null; // null = inbox
  durationMin: number | null;
  recurrence: Recurrence | null;
  recurrenceDay: number | null;
  recurrenceUntil: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  source: 'text' | 'voice';
  rawTranscript: string | null;
  createdAt: string;
  updatedAt: string;
  // Set only on an expanded occurrence: its identity is (id, occurrenceDate).
  occurrenceDate: string | null;
};

// null scheduledAt = Inbox. PATCH reads null as "unchanged", so a patch only
// carries what changed and moving to the Inbox is its own unschedule call.
export type TaskInput = {
  title: string;
  scheduledAt: string | null;
  durationMin?: number;
  recurrence?: Recurrence;
  recurrenceDay?: number;
  source: 'text' | 'voice';
};

export type TaskPatch = { title?: string; scheduledAt?: string };

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

export type NoteInput = { body: string; source: 'text' | 'voice' };

export type MoneyEntryType = 'expense' | 'income';

export type MoneyEntryInput = {
  type: MoneyEntryType;
  amountCents: number;
  label: string;
  category: string | null;
  occurredOn: string;
};

export type MoneyEntry = {
  id: string;
  type: MoneyEntryType;
  amountCents: number; // always positive; type carries the direction
  label: string;
  category: string | null;
  occurredOn: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Habit = {
  id: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HabitCheck = {
  id: string;
  habitId: string;
  checkedOn: string;
  createdAt: string;
};

export type DayNote = {
  id: string;
  entryDate: string;
  body: string;
  rating: number | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Missing rating is saved as null, so a save that keeps the rating must resend it.
export type DayNoteInput = { body: string; rating: number | null };

export type SleepLog = {
  id: string;
  sleepDate: string; // the morning you woke
  bedAt: string;
  wokeAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JournalEntry = {
  id: string;
  title: string | null;
  body: string;
  tags: string | null; // comma-separated
  source: 'text' | 'voice';
  rawTranscript: string | null;
  entryDate: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JournalEntryInput = {
  title?: string;
  body: string;
  tags: string | null;
  entryDate: string;
  source: 'text' | 'voice';
};

export type Exercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  kind: 'compound' | 'isolation';
  repMin: number;
  repMax: number;
  repMinOverride: number | null;
  repMaxOverride: number | null;
  weightStepGrams: number; // 0 = bodyweight
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Workout = {
  id: string;
  performedOn: string;
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutSet = {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: number;
  weightGrams: number;
  reps: number;
  warmup: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutSummary = {
  workout: Workout;
  exerciseIds: string[];
  workingSetCount: number;
  volumeGrams: number;
};

export type ExerciseSession = { workoutId: string; performedOn: string; sets: WorkoutSet[] };

export type ProgressionSuggestion = {
  action: 'start' | 'increase' | 'repeat' | 'deload' | 'extend';
  weightGrams: number | null; // null only for 'start'
  targetReps: number;
  setCount: number | null;
  basedOn: ExerciseSession | null;
};

export type ProjectStatus = 'idea' | 'ongoing' | 'finished';

export type Project = {
  id: string;
  name: string;
  pitch: string | null;
  description: string | null;
  status: ProjectStatus;
  repoUrl: string | null;
  liveUrl: string | null;
  techStack: string | null; // comma-separated
  tags: string | null; // comma-separated
  startedOn: string | null;
  finishedOn: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStage = 'todo' | 'doing' | 'done' | 'blocked';
export type ProjectPriority = 'low' | 'normal' | 'urgent';

export type ProjectSummary = {
  project: Project;
  counts: Record<ProjectStage, number>;
  lastActivityAt: string;
};

export type ProjectItem = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  stage: ProjectStage;
  priority: ProjectPriority;
  dueOn: string | null;
  position: number;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectItemInput = {
  title: string;
  description?: string;
  stage?: ProjectStage;
  priority?: ProjectPriority;
  dueOn?: string;
};

export type ProjectUpdate = {
  id: string;
  projectId: string;
  body: string;
  entryDate: string;
  source: 'text' | 'voice';
  rawTranscript: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectUpdateInput = { body: string; entryDate: string; source: 'text' | 'voice' };

export function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags.split(',').map((t) => t.trim()).filter(Boolean);
}
