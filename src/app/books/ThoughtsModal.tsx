'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import Modal from '../components/Modal';
import { api, describeError } from '@/lib/api';
import { formatRelativeTime } from '@/lib/date';
import type { Book, Note } from '@/lib/types';
import styles from './thoughtsModal.module.css';

export default function ThoughtsModal({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    // This effect owns its own loading/error state (load-on-open).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    api.listNotes(book.id)
      .then((found) => { if (!cancelled) setNotes(found); })
      .catch((e) => { if (!cancelled) setError(describeError(e, 'Could not load thoughts')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [book]);

  function handleClose() {
    setDraft('');
    onClose();
  }

  async function handleAdd() {
    if (!book) return;
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      const created = await api.createNote({ body, bookId: book.id });
      setNotes((prev) => [created, ...prev]);
    } catch (e) {
      setError(describeError(e, 'Could not save thought'));
    }
  }

  async function handleDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.removeNote(id);
    } catch {
      if (book) setNotes(await api.listNotes(book.id));
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleAdd();
    }
  }

  return (
    <Modal open={book !== null} eyebrow="Thoughts" onClose={handleClose} width={480} height={560}>
      {book && (
        <div className={styles.body}>
          <div className={styles.bookTitle}>{book.title}</div>

          <div className={styles.list}>
            {error && <div className={styles.message}>{error}</div>}
            {!error && loading && notes.length === 0 && <div className={styles.message}>Loading…</div>}
            {!loading && !error && notes.length === 0 && (
              <div className={styles.message}>No thoughts yet — add the first one below.</div>
            )}
            {notes.map((note) => (
              <div key={note.id} className={styles.entry}>
                <div className={styles.entryHeader}>
                  <span className={styles.entryDate}>{formatRelativeTime(note.createdAt)}</span>
                  <button
                    type="button"
                    className={styles.entryDelete}
                    onClick={() => void handleDelete(note.id)}
                    aria-label="Delete thought"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
                <div className={styles.entryBody}>{note.body}</div>
              </div>
            ))}
          </div>

          <div className={styles.composer}>
            <textarea
              className={styles.composerInput}
              placeholder="Add a thought"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <button type="button" className={styles.composerSave} onClick={() => void handleAdd()}>
              Add
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
