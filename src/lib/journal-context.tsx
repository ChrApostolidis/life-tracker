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
import type { DayNote, JournalEntry, JournalEntryInput, JournalEntryPatch } from './types';
import { addDays, toDateInput } from './date';
import { api, describeError } from './api';

type JournalCtx = {
  entries: JournalEntry[];
  dayNotes: DayNote[];
  loading: boolean;
  error: string | null;
  addEntry: (input: JournalEntryInput) => Promise<void>;
  updateEntry: (id: string, patch: JournalEntryPatch) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
};

const JournalContext = createContext<JournalCtx | null>(null);

// The journal reads its whole history — it's a browsing surface, and paging it
// would defeat the month jumper. Same full-history start as useGameData.
const HISTORY_START = new Date(2020, 0, 1);

// Route-scoped, like Money/Books/Watch rather than root-mounted like Habits:
// only /journal reads this, so a root provider would cost every other page a
// fetch it never uses.
export function JournalProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [dayNotes, setDayNotes] = useState<DayNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live snapshot for async handlers that need current state to revert.
  const entriesRef = useRef<JournalEntry[]>(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const to = toDateInput(addDays(new Date(), 1));
      const [entryResult, dayNoteResult] = await Promise.all([
        api.listJournalEntries(),
        api.listDayNotes(toDateInput(HISTORY_START), to),
      ]);
      setEntries(entryResult);
      setDayNotes(dayNoteResult);
    } catch (e) {
      setError(describeError(e, 'Could not load journal'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load once on mount; refresh() owns its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const addEntry = useCallback(async (input: JournalEntryInput) => {
    const tempId = `temp-journal-entry-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: JournalEntry = {
      id: tempId,
      title: input.title ?? null,
      body: input.body,
      tags: input.tags ?? null,
      source: input.source ?? 'text',
      rawTranscript: input.rawTranscript ?? null,
      // Mirrors the server default so the row lands in the right month
      // immediately rather than jumping once the response arrives.
      entryDate: input.entryDate ?? toDateInput(new Date()),
      deletedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setEntries((prev) => sortEntries([optimistic, ...prev]));
    try {
      const created = await api.createJournalEntry(input);
      setEntries((prev) => sortEntries(prev.map((e) => (e.id === tempId ? created : e))));
    } catch (e) {
      setEntries((prev) => prev.filter((e) => e.id !== tempId));
      setError(describeError(e, 'Could not save entry'));
    }
  }, []);

  const updateEntry = useCallback(async (id: string, patch: JournalEntryPatch) => {
    const snapshot = entriesRef.current;
    setEntries((prev) => sortEntries(prev.map((e) => (e.id === id ? { ...e, ...patch } : e))));
    try {
      const updated = await api.updateJournalEntry(id, patch);
      setEntries((prev) => sortEntries(prev.map((e) => (e.id === id ? updated : e))));
    } catch (e) {
      setEntries(snapshot);
      setError(describeError(e, 'Could not update entry'));
    }
  }, []);

  const deleteEntry = useCallback(async (id: string) => {
    const snapshot = entriesRef.current;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await api.removeJournalEntry(id);
    } catch (e) {
      setEntries(snapshot);
      setError(describeError(e, 'Could not delete entry'));
    }
  }, []);

  return (
    <JournalContext.Provider
      value={{ entries, dayNotes, loading, error, addEntry, updateEntry, deleteEntry }}
    >
      {children}
    </JournalContext.Provider>
  );
}

// Newest day first, then newest written first — matching the backend's order,
// so an optimistic insert or a date edit lands where the refetch would put it.
function sortEntries(list: JournalEntry[]): JournalEntry[] {
  return [...list].sort((a, b) => {
    if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function useJournal(): JournalCtx {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal must be used inside <JournalProvider>');
  return ctx;
}
