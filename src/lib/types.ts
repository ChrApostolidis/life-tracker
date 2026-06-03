export type Note = {
  id: string;
  body: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  notes: Note[];
  scheduledAt: string | null; // ISO8601; null = unscheduled
  completedAt: string | null;
  source: 'text' | 'voice';
  createdAt: string;
};
