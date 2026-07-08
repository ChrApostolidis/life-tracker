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
import type { MoneyEntry, MoneyEntryInput, MoneyEntryPatch } from './types';
import { api, describeError } from './api';
import { addDays, toDateInput } from './date';

// Half-open [from, to) — local 'YYYY-MM-DD' dates, matching the backend contract.
type DateRange = { from: string; to: string };

type MoneyCtx = {
  entries: MoneyEntry[];
  loading: boolean;
  error: string | null;
  setRange: (from: string, to: string) => void;
  addEntry: (input: MoneyEntryInput) => Promise<void>;
  updateEntry: (id: string, patch: MoneyEntryPatch) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
};

const MoneyContext = createContext<MoneyCtx | null>(null);

// Mirrors app-context's optimistic pattern, but mounted from the /money layout
// so money data never loads on the task views.
export function MoneyProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<MoneyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRangeState] = useState<DateRange>(() => {
    const now = new Date();
    return { from: toDateInput(now), to: toDateInput(addDays(now, 1)) };
  });

  // Live snapshot for async handlers that need current state to revert.
  const entriesRef = useRef<MoneyEntry[]>(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await api.listMoney(range.from, range.to));
    } catch (e) {
      setError(describeError(e, 'Could not load money entries'));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    // Reload whenever the window changes; refresh() owns its loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Pages declare the window they need; ignore no-op changes to avoid refetch loops.
  const setRange = useCallback((from: string, to: string) => {
    setRangeState((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  const addEntry = useCallback(async (input: MoneyEntryInput) => {
    const tempId = `temp-money-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: MoneyEntry = {
      id: tempId,
      type: input.type,
      amountCents: input.amountCents,
      label: input.label,
      category: input.category ?? null,
      occurredOn: input.occurredOn,
      deletedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setEntries((prev) => [...prev, optimistic]);
    try {
      const created = await api.createMoney(input);
      setEntries((prev) => prev.map((m) => (m.id === tempId ? created : m)));
    } catch (e) {
      setEntries((prev) => prev.filter((m) => m.id !== tempId));
      setError(describeError(e, 'Could not add entry'));
    }
  }, []);

  const updateEntry = useCallback(async (id: string, patch: MoneyEntryPatch) => {
    const snapshot = entriesRef.current;
    setEntries((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    try {
      const updated = await api.updateMoney(id, patch);
      setEntries((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (e) {
      setEntries(snapshot);
      setError(describeError(e, 'Could not update entry'));
    }
  }, []);

  const deleteEntry = useCallback(async (id: string) => {
    const snapshot = entriesRef.current;
    setEntries((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.removeMoney(id);
    } catch (e) {
      setEntries(snapshot);
      setError(describeError(e, 'Could not delete entry'));
    }
  }, []);

  return (
    <MoneyContext.Provider
      value={{ entries, loading, error, setRange, addEntry, updateEntry, deleteEntry }}
    >
      {children}
    </MoneyContext.Provider>
  );
}

export function useMoney(): MoneyCtx {
  const ctx = useContext(MoneyContext);
  if (!ctx) throw new Error('useMoney must be used inside <MoneyProvider>');
  return ctx;
}
