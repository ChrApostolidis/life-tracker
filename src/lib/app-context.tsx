'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Note, Task } from './types';

function todayPrefix(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function sched(time: string): string {
  return new Date(`${todayPrefix()}T${time}:00`).toISOString();
}

function note(body: string): Note {
  return { id: `n-${Math.random().toString(36).slice(2)}`, body, createdAt: new Date().toISOString() };
}

const SEED: Task[] = [
  {
    id: 'u1', title: 'Pick up dry cleaning', notes: [],
    scheduledAt: null, completedAt: null, source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 'u2', title: 'Read 30 pages of Tomas Transtromer',
    notes: [note('Start from chapter 3 — the Baltic Sea poems.')],
    scheduledAt: null, completedAt: null, source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 's1', title: 'Morning pages', notes: [],
    scheduledAt: sched('07:30'), completedAt: new Date().toISOString(), source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 's2', title: 'Standup',
    notes: [note('Discussed sprint planning and blockers. Team is aligned on the new auth flow.')],
    scheduledAt: sched('09:00'), completedAt: new Date().toISOString(), source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 's3', title: 'Design review — life tracker',
    notes: [note('Timeline and modal designs approved. FAB sizing still needs a quick pass.')],
    scheduledAt: sched('10:30'), completedAt: null, source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 's4', title: 'Lunch with Hana', notes: [],
    scheduledAt: sched('12:30'), completedAt: null, source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 's5', title: 'Therapy',
    notes: [note('Talk about the transition period and what comes next.')],
    scheduledAt: sched('14:00'), completedAt: null, source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 's6', title: 'Run · 5k along the canal', notes: [],
    scheduledAt: sched('16:00'), completedAt: null, source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 's7', title: 'Call mom', notes: [],
    scheduledAt: sched('19:30'), completedAt: null, source: 'text', createdAt: new Date().toISOString(),
  },
  {
    id: 's8', title: 'Read before bed', notes: [],
    scheduledAt: sched('21:00'), completedAt: null, source: 'text', createdAt: new Date().toISOString(),
  },
];

// ── Types ──────────────────────────────────────────────────────────────────

export type TaskInput = {
  title: string;
  notes: Note[];
  scheduledAt: string | null;
  source?: 'text' | 'voice';
};

type CaptureState = {
  open: boolean;
  task: Task | null;
};

type AppCtx = {
  tasks: Task[];
  addTask: (input: TaskInput) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleComplete: (id: string) => void;
  deleteTask: (id: string) => void;
  captureState: CaptureState;
  openCapture: () => void;
  openEdit: (task: Task) => void;
  closeCapture: () => void;
};

const AppContext = createContext<AppCtx | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(SEED);
  const [captureState, setCaptureState] = useState<CaptureState>({ open: false, task: null });

  const addTask = useCallback((input: TaskInput) => {
    const task: Task = {
      id: `t-${Date.now()}`,
      title: input.title,
      notes: input.notes,
      scheduledAt: input.scheduledAt,
      completedAt: null,
      source: input.source ?? 'text',
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, task]);
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const toggleComplete = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, completedAt: t.completedAt ? null : new Date().toISOString() }
          : t,
      ),
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openCapture = useCallback(() => setCaptureState({ open: true, task: null }), []);
  const openEdit = useCallback((task: Task) => setCaptureState({ open: true, task }), []);
  const closeCapture = useCallback(() => setCaptureState({ open: false, task: null }), []);

  // Global Cmd/Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openCapture();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCapture]);

  return (
    <AppContext.Provider
      value={{ tasks, addTask, updateTask, toggleComplete, deleteTask, captureState, openCapture, openEdit, closeCapture }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
