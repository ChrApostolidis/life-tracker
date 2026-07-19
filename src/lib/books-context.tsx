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
import type { Book, BookInput, BookPatch } from './types';
import { api, describeError } from './api';

type BooksCtx = {
  books: Book[];
  loading: boolean;
  error: string | null;
  addBook: (input: BookInput) => Promise<void>;
  updateBook: (id: string, patch: BookPatch) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
};

const BooksContext = createContext<BooksCtx | null>(null);

// Mirrors money-context's optimistic pattern. No date range — the whole
// shelf loads once; single user, tiny data, no reason to page it.
export function BooksProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live snapshot for async handlers that need current state to revert.
  const booksRef = useRef<Book[]>(books);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBooks(await api.listBooks());
    } catch (e) {
      setError(describeError(e, 'Could not load books'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load once on mount; refresh() owns its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const addBook = useCallback(async (input: BookInput) => {
    const tempId = `temp-book-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: Book = {
      id: tempId,
      title: input.title,
      author: input.author ?? null,
      status: input.status,
      startedOn: null,
      finishedOn: null,
      rating: null,
      coverUrl: input.coverUrl ?? null,
      notes: null,
      deletedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    // Newest first, matching the backend's ordering.
    setBooks((prev) => [optimistic, ...prev]);
    try {
      const created = await api.createBook(input);
      setBooks((prev) => prev.map((b) => (b.id === tempId ? created : b)));
    } catch (e) {
      setBooks((prev) => prev.filter((b) => b.id !== tempId));
      setError(describeError(e, 'Could not add book'));
    }
  }, []);

  const updateBook = useCallback(async (id: string, patch: BookPatch) => {
    const snapshot = booksRef.current;
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    try {
      const updated = await api.updateBook(id, patch);
      setBooks((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch (e) {
      setBooks(snapshot);
      setError(describeError(e, 'Could not update book'));
    }
  }, []);

  const deleteBook = useCallback(async (id: string) => {
    const snapshot = booksRef.current;
    setBooks((prev) => prev.filter((b) => b.id !== id));
    try {
      await api.removeBook(id);
    } catch (e) {
      setBooks(snapshot);
      setError(describeError(e, 'Could not delete book'));
    }
  }, []);

  return (
    <BooksContext.Provider value={{ books, loading, error, addBook, updateBook, deleteBook }}>
      {children}
    </BooksContext.Provider>
  );
}

export function useBooks(): BooksCtx {
  const ctx = useContext(BooksContext);
  if (!ctx) throw new Error('useBooks must be used inside <BooksProvider>');
  return ctx;
}
