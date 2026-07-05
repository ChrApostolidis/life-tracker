'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faNoteSticky, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/lib/app-context';
import { formatRelativeTime } from '@/lib/date';
import styles from './notes.module.css';

export default function NotesPage() {
  const { notes, loading, error, deleteNote, promoteNote } = useApp();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Notes</div>
        <h1 className={styles.title}>Captured thoughts</h1>
        <div className={styles.meta}>
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </div>
      </header>

      {error && <div className={styles.message}>{error}</div>}
      {!error && loading && notes.length === 0 && <div className={styles.message}>Loading…</div>}

      {!loading && notes.length === 0 && !error ? (
        <div className={styles.empty}>
          <FontAwesomeIcon icon={faNoteSticky} className={styles.emptyIcon} />
          <p>Nothing captured yet. Catch a thought.</p>
        </div>
      ) : (
        notes.length > 0 && (
          <div className={styles.card}>
            {notes.map((note) => (
              <div key={note.id} className={styles.row}>
                <FontAwesomeIcon icon={faNoteSticky} className={styles.rowIcon} />
                <span className={styles.body}>{note.body}</span>
                <div className={styles.meta}>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.promoteBtn}
                      onClick={() => promoteNote(note.id)}
                    >
                      Promote
                    </button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => deleteNote(note.id)}
                      aria-label="Delete note"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                  <span className={styles.timestamp}>{formatRelativeTime(note.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
