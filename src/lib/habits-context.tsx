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
import type { Habit, HabitCheck } from './types';
import { api, describeError } from './api';
import { addDays, toDateInput } from './date';

const CHECK_WINDOW_DAYS = 90;

/**
 * HabitsContext provides a centralized state management for habit tracking within the application.
 * It maintains the list of habits and their corresponding check-ins, allowing components to access
 * and manipulate this data seamlessly. The context includes methods for checking/unchecking habits,
 * adding new habits, renaming, archiving, and unarchiving habits. It also handles loading states and
 * error management, ensuring that the UI reflects the current state of habit data accurately.
 * Components wrapped in the HabitsProvider can utilize the useHabits hook to interact with this context.
 */

type HabitsCtx = {
  habits: Habit[]; // all, including archived — consumers filter
  checks: HabitCheck[]; // rolling 90-day window
  loading: boolean;
  error: string | null;
  isChecked: (habitId: string, dateKey: string) => boolean;
  toggleCheck: (habitId: string, dateKey: string) => Promise<void>;
  addHabit: (name: string) => Promise<void>;
  renameHabit: (id: string, name: string) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  unarchiveHabit: (id: string) => Promise<void>;
};

const HabitsContext = createContext<HabitsCtx | null>(null);

export function HabitsProvider({ children }: { children: ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live snapshots for async handlers that need current state to revert.
  const habitsRef = useRef<Habit[]>(habits);
  const checksRef = useRef<HabitCheck[]>(checks);
  useEffect(() => {
    habitsRef.current = habits;
  }, [habits]);
  useEffect(() => {
    checksRef.current = checks;
  }, [checks]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const from = toDateInput(addDays(now, -(CHECK_WINDOW_DAYS - 1)));
      const to = toDateInput(addDays(now, 1));
      const [habitsResult, checksResult] = await Promise.all([
        api.listHabits(),
        api.listHabitChecks(from, to),
      ]);
      setHabits(habitsResult);
      setChecks(checksResult);
    } catch (e) {
      setError(describeError(e, 'Could not load habits'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load once on mount; refresh() owns its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const isChecked = useCallback(
    (habitId: string, dateKey: string) =>
      checksRef.current.some((c) => c.habitId === habitId && c.checkedOn === dateKey),
    [],
  );

  const toggleCheck = useCallback(async (habitId: string, dateKey: string) => {
    const snapshot = checksRef.current;
    const already = snapshot.find((c) => c.habitId === habitId && c.checkedOn === dateKey);

    if (already) {
      setChecks((prev) => prev.filter((c) => c !== already));
      try {
        await api.uncheckHabit(habitId, dateKey);
      } catch (e) {
        setChecks(snapshot);
        setError(describeError(e, 'Could not update habit'));
      }
      return;
    }

    const tempId = `temp-check-${Date.now()}`;
    const optimistic: HabitCheck = {
      id: tempId,
      habitId,
      checkedOn: dateKey,
      createdAt: new Date().toISOString(),
    };
    setChecks((prev) => [...prev, optimistic]);
    try {
      const created = await api.checkHabit(habitId, dateKey);
      setChecks((prev) => prev.map((c) => (c.id === tempId ? created : c)));
    } catch (e) {
      setChecks((prev) => prev.filter((c) => c.id !== tempId));
      setError(describeError(e, 'Could not update habit'));
    }
  }, []);

  const addHabit = useCallback(async (name: string) => {
    const tempId = `temp-habit-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: Habit = { id: tempId, name, archivedAt: null, createdAt: nowIso, updatedAt: nowIso };
    setHabits((prev) => [...prev, optimistic]);
    try {
      const created = await api.createHabit({ name });
      setHabits((prev) => prev.map((h) => (h.id === tempId ? created : h)));
    } catch (e) {
      setHabits((prev) => prev.filter((h) => h.id !== tempId));
      setError(describeError(e, 'Could not add habit'));
    }
  }, []);

  const renameHabit = useCallback(async (id: string, name: string) => {
    const snapshot = habitsRef.current;
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, name } : h)));
    try {
      const updated = await api.updateHabit(id, { name });
      setHabits((prev) => prev.map((h) => (h.id === id ? updated : h)));
    } catch (e) {
      setHabits(snapshot);
      setError(describeError(e, 'Could not rename habit'));
    }
  }, []);

  const archiveHabit = useCallback(async (id: string) => {
    const snapshot = habitsRef.current;
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, archivedAt: new Date().toISOString() } : h)));
    try {
      await api.archiveHabit(id);
    } catch (e) {
      setHabits(snapshot);
      setError(describeError(e, 'Could not archive habit'));
    }
  }, []);

  const unarchiveHabit = useCallback(async (id: string) => {
    const snapshot = habitsRef.current;
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, archivedAt: null } : h)));
    try {
      await api.unarchiveHabit(id);
    } catch (e) {
      setHabits(snapshot);
      setError(describeError(e, 'Could not unarchive habit'));
    }
  }, []);

  return (
    <HabitsContext.Provider
      value={{
        habits,
        checks,
        loading,
        error,
        isChecked,
        toggleCheck,
        addHabit,
        renameHabit,
        archiveHabit,
        unarchiveHabit,
      }}
    >
      {children}
    </HabitsContext.Provider>
  );
}

export function useHabits(): HabitsCtx {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used inside <HabitsProvider>');
  return ctx;
}
