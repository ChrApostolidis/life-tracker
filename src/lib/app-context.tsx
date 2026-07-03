'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Task, TaskInput, TaskPatch } from './types';
import { api, ApiError } from './api';
import { startOfDay, addDays } from './date';

// ── Types ──────────────────────────────────────────────────────────────────

type CaptureState = {
  open: boolean;
  task: Task | null;
  prefillDate: Date | null; // seeds the date field when adding for a specific day
};

type DateRange = { from: string; to: string }; // half-open [from, to) ISO instants

type AppCtx = {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setRange: (from: string, to: string) => void;
  addTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  captureState: CaptureState;
  openCapture: (prefillDate?: Date) => void;
  openEdit: (task: Task) => void;
  closeCapture: () => void;
};

const AppContext = createContext<AppCtx | null>(null);

function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return `${fallback} (HTTP ${e.status})`;
  return fallback;
}

// PATCH treats null as "leave unchanged", so drop null/undefined keys before
// sending — otherwise we'd silently no-op while the UI thinks it changed.
function cleanPatch(patch: TaskPatch): TaskPatch {
  const out: TaskPatch = {};
  (Object.keys(patch) as (keyof TaskPatch)[]).forEach((key) => {
    const value = patch[key];
    if (value !== null && value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = value;
    }
  });
  return out;
}

// ── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>({
    open: false,
    task: null,
    prefillDate: null,
  });

  // The visible window, half-open [from, to). Defaults to today; each screen
  // (Today / Day / Week) declares the window it needs via setRange.
  const [range, setRangeState] = useState<DateRange>(() => {
    const now = new Date();
    return {
      from: startOfDay(now).toISOString(),
      to: startOfDay(addDays(now, 1)).toISOString(),
    };
  });

  // Keep a live snapshot for async handlers that need current state to revert.
  const tasksRef = useRef<Task[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Load the current window's scheduled tasks + the inbox. The range query
  // excludes scheduledAt IS NULL, so the inbox separately feeds the Unscheduled
  // section (shown on the Today view only).
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scheduled, inbox] = await Promise.all([
        api.listRange(range.from, range.to),
        api.listInbox(),
      ]);
      const byId = new Map<string, Task>();
      [...scheduled, ...inbox].forEach((t) => byId.set(t.id, t));
      setTasks([...byId.values()]);
    } catch (e) {
      setError(describeError(e, 'Could not load tasks'));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    // Reload whenever the window changes; refresh() owns its loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const addTask = useCallback(async (input: TaskInput) => {
    const tempId = `temp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: Task = {
      id: tempId,
      title: input.title,
      scheduledAt: input.scheduledAt,
      durationMin: input.durationMin ?? null,
      recurrence: null,
      recurrenceDay: null,
      recurrenceUntil: null,
      completedAt: null,
      deletedAt: null,
      source: input.source ?? 'text',
      rawTranscript: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setTasks((prev) => [...prev, optimistic]);
    try {
      const created = await api.create(input);
      setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
    } catch (e) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      setError(describeError(e, 'Could not add task'));
    }
  }, []);

  const updateTask = useCallback(async (id: string, patch: TaskPatch) => {
    const clean = cleanPatch(patch);
    const snapshot = tasksRef.current;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...clean } : t)));
    try {
      const updated = await api.update(id, clean);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e) {
      setTasks(snapshot);
      setError(describeError(e, 'Could not update task'));
    }
  }, []);

  const toggleComplete = useCallback(async (id: string) => {
    const task = tasksRef.current.find((t) => t.id === id);
    if (!task) return;
    const wasDone = Boolean(task.completedAt);
    const snapshot = tasksRef.current;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, completedAt: wasDone ? null : new Date().toISOString() } : t,
      ),
    );
    try {
      const updated = wasDone ? await api.uncomplete(id) : await api.complete(id);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e) {
      setTasks(snapshot);
      setError(describeError(e, 'Could not update task'));
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    const snapshot = tasksRef.current;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.remove(id);
    } catch (e) {
      setTasks(snapshot);
      setError(describeError(e, 'Could not delete task'));
    }
  }, []);

  // Pages declare the window they need; ignore no-op changes to avoid refetch loops.
  const setRange = useCallback((from: string, to: string) => {
    setRangeState((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  const openCapture = useCallback(
    (prefillDate?: Date) =>
      setCaptureState({ open: true, task: null, prefillDate: prefillDate ?? null }),
    [],
  );
  const openEdit = useCallback(
    (task: Task) => setCaptureState({ open: true, task, prefillDate: null }),
    [],
  );
  const closeCapture = useCallback(
    () => setCaptureState({ open: false, task: null, prefillDate: null }),
    [],
  );

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
      value={{
        tasks,
        loading,
        error,
        refresh,
        setRange,
        addTask,
        updateTask,
        toggleComplete,
        deleteTask,
        captureState,
        openCapture,
        openEdit,
        closeCapture,
      }}
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
