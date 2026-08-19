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
import type { Note, NoteInput, NotePatch, Task, TaskInput, TaskPatch } from './types';
import { api, describeError } from './api';
import { startOfDay, addDays } from './date';
import { taskKey } from './helpers';

// ── Types ──────────────────────────────────────────────────────────────────

type CaptureState = {
  open: boolean;
  task: Task | null; // non-null = editing this task
  note: Note | null; // non-null = editing this note
  prefillDate: Date | null; // seeds the date field when adding for a specific day
};

type DateRange = { from: string; to: string }; // half-open [from, to) ISO instants

type AppCtx = {
  tasks: Task[];
  notes: Note[];
  overdueTasks: Task[];
  loading: boolean;
  error: string | null;
  taskRevision: number;
  refresh: () => Promise<void>;
  setRange: (from: string, to: string) => void;
  addTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;
  unscheduleTask: (id: string) => Promise<void>;
  toggleComplete: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addNote: (input: NoteInput) => Promise<void>;
  updateNote: (id: string, patch: NotePatch) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  promoteNote: (id: string) => Promise<void>;
  captureState: CaptureState;
  openCapture: (prefillDate?: Date) => void;
  openEdit: (task: Task) => void;
  openEditNote: (note: Note) => void;
  closeCapture: () => void;
};

const AppContext = createContext<AppCtx | null>(null);

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
  const [notes, setNotes] = useState<Note[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskRevision, setTaskRevision] = useState(0);
  const bumpTasks = useCallback(() => setTaskRevision((n) => n + 1), []);
  const [captureState, setCaptureState] = useState<CaptureState>({
    open: false,
    task: null,
    note: null,
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

  // Keep live snapshots for async handlers that need current state to revert.
  const tasksRef = useRef<Task[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  const notesRef = useRef<Note[]>(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  const overdueTasksRef = useRef<Task[]>(overdueTasks);
  useEffect(() => {
    overdueTasksRef.current = overdueTasks;
  }, [overdueTasks]);


  // Refresh the full visible window (tasks + notes + overdue) from the server.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scheduled, inbox, standaloneNotes, overdue] = await Promise.all([
        api.listRange(range.from, range.to),
        api.listInbox(),
        api.listNotes(),
        api.listOverdue(),
      ]);
      const byKey = new Map<string, Task>();
      [...scheduled, ...inbox].forEach((t) => byKey.set(taskKey(t), t));
      setTasks([...byKey.values()]);
      setNotes(standaloneNotes);
      setOverdueTasks(overdue);
    } catch (e) {
      setError(describeError(e, 'Could not load tasks'));
    } finally {
      setLoading(false);
    }
  }, [range]);

  // Lighter-weight than refresh() — re-fetches just the overdue list after an
  // edit that might change a task's overdue status (e.g. rescheduling it).
  const refreshOverdue = useCallback(async () => {
    try {
      setOverdueTasks(await api.listOverdue());
    } catch {
      console.error('Could not refresh overdue tasks');
    }
  }, []);

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
      recurrence: input.recurrence ?? null,
      recurrenceDay: input.recurrenceDay ?? null,
      recurrenceUntil: input.recurrenceUntil ?? null,
      completedAt: null,
      deletedAt: null,
      source: input.source ?? 'text',
      rawTranscript: input.rawTranscript ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
      occurrenceDate: null,
    };
    setTasks((prev) => [...prev, optimistic]);
    try {
      const created = await api.create(input);
      if (input.recurrence) {
        // A new series needs the whole visible window re-expanded — swapping
        // in just the template row would only show its first occurrence.
        await refresh();
      } else {
        setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
      }
      bumpTasks();
    } catch (e) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      setError(describeError(e, 'Could not add task'));
    }
  }, [bumpTasks, refresh]);

  const updateTask = useCallback(async (id: string, patch: TaskPatch) => {
    const clean = cleanPatch(patch);
    const snapshot = tasksRef.current;
    const isRecurringEdit = tasksRef.current.some((t) => t.id === id && t.recurrence);
    if (!isRecurringEdit) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...clean } : t)));
    }
    try {
      const updated = await api.update(id, clean);
      if (isRecurringEdit) {
        await refresh();
      } else {
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        void refreshOverdue(); // scheduledAt may have moved the task off (or onto) the overdue list
      }
      bumpTasks();
    } catch (e) {
      setTasks(snapshot);
      setError(describeError(e, 'Could not update task'));
    }
  }, [bumpTasks, refresh, refreshOverdue]);



  // Takes the full task (not just an id): completing an occurrence of a recurring series needs its occurrenceDate to route to the right endpoint.
  const toggleComplete = useCallback(async (task: Task) => {
    const key = taskKey(task);
    const wasDone = Boolean(task.completedAt);
    const tasksSnapshot = tasksRef.current;
    const overdueSnapshot = overdueTasksRef.current;
    const nowIso = new Date().toISOString();

    setTasks((prev) =>
      prev.map((t) => (taskKey(t) === key ? { ...t, completedAt: wasDone ? null : nowIso } : t)),
    );
 
    if (!wasDone) 
    {
      setOverdueTasks((prev) => prev.filter((t) => taskKey(t) !== key));
    }

    try {
      const updated = task.occurrenceDate
        ? wasDone
          ? await api.uncompleteOccurrence(task.id, task.occurrenceDate)
          : await api.completeOccurrence(task.id, task.occurrenceDate)
        : wasDone
          ? await api.uncomplete(task.id)
          : await api.complete(task.id);
      setTasks((prev) => prev.map((t) => (taskKey(t) === key ? updated : t)));
      bumpTasks();
    } catch (e) {
      setTasks(tasksSnapshot);
      setOverdueTasks(overdueSnapshot);
      setError(describeError(e, 'Could not update task'));
    }
  }, [bumpTasks]);


  // Delete a task. If it's a recurring series, the backend will delete all occurrences in the visible window.
  // Moving a task back to the inbox. Separate from updateTask because PATCH
  // treats null as "leave unchanged", so clearing the date needs its own call.
  const unscheduleTask = useCallback(async (id: string) => {
    const snapshot = tasksRef.current;
    setTasks((prev) => prev.filter((t) => t.id !== id)); // leaves the current date window
    try {
      await api.unschedule(id);
      await refresh();
      void refreshOverdue();
      bumpTasks();
    } catch (e) {
      setTasks(snapshot);
      setError(describeError(e, 'Could not move task to the inbox'));
    }
  }, [bumpTasks, refresh, refreshOverdue]);

  const deleteTask = useCallback(async (id: string) => {
    const snapshot = tasksRef.current;
    const overdueSnapshot = overdueTasksRef.current;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setOverdueTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.remove(id);
      bumpTasks();
    } catch (e) {
      setTasks(snapshot);
      setOverdueTasks(overdueSnapshot);
      setError(describeError(e, 'Could not delete task'));
    }
  }, [bumpTasks]);

  // Add a new note.
  const addNote = useCallback(async (input: NoteInput) => {
    const tempId = `temp-note-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: Note = {
      id: tempId,
      taskId: null,
      bookId: input.bookId ?? null,
      body: input.body,
      source: input.source ?? 'text',
      rawTranscript: input.rawTranscript ?? null,
      deletedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    // Newest first, matching the backend's ordering.
    setNotes((prev) => [optimistic, ...prev]);
    try {
      const created = await api.createNote(input);
      setNotes((prev) => prev.map((n) => (n.id === tempId ? created : n)));
    } catch (e) {
      setNotes((prev) => prev.filter((n) => n.id !== tempId));
      setError(describeError(e, 'Could not add note'));
    }
  }, []);

  const updateNote = useCallback(async (id: string, patch: NotePatch) => {
    const snapshot = notesRef.current;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    try {
      const updated = await api.updateNote(id, patch);
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    } catch (e) {
      setNotes(snapshot);
      setError(describeError(e, 'Could not update note'));
    }
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    const snapshot = notesRef.current;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.removeNote(id);
    } catch (e) {
      setNotes(snapshot);
      setError(describeError(e, 'Could not delete note'));
    }
  }, []);

  // Promote a note to a task. The backend will delete the note and return the new task.
  const promoteNote = useCallback(async (id: string) => {
    const noteSnapshot = notesRef.current;
    const taskSnapshot = tasksRef.current;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      const task = await api.promoteNote(id);
      setTasks((prev) => [...prev, task]);
    } catch (e) {
      setNotes(noteSnapshot);
      setTasks(taskSnapshot);
      setError(describeError(e, 'Could not promote note'));
    }
  }, []);

  // Pages declare the window they need; ignore no-op changes to avoid refetch loops.
  const setRange = useCallback((from: string, to: string) => {
    setRangeState((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  const openCapture = useCallback(
    (prefillDate?: Date) =>
      setCaptureState({ open: true, task: null, note: null, prefillDate: prefillDate ?? null }),
    [],
  );
  const openEdit = useCallback(
    (task: Task) => setCaptureState({ open: true, task, note: null, prefillDate: null }),
    [],
  );
  const openEditNote = useCallback(
    (note: Note) => setCaptureState({ open: true, task: null, note, prefillDate: null }),
    [],
  );
  const closeCapture = useCallback(
    () => setCaptureState({ open: false, task: null, note: null, prefillDate: null }),
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
        notes,
        overdueTasks,
        loading,
        error,
        taskRevision,
        refresh,
        setRange,
        addTask,
        updateTask,
        unscheduleTask,
        toggleComplete,
        deleteTask,
        addNote,
        updateNote,
        deleteNote,
        promoteNote,
        captureState,
        openCapture,
        openEdit,
        openEditNote,
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
