'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faNoteSticky, faPen, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/lib/app-context';
import { formatRelativeTime } from '@/lib/date';
import Skeleton, { SkeletonBlock } from '../components/Skeleton';
import styles from './notes.module.css';

const SKELETON_ROWS = 6;

// Reuses .card and .row, so the hairline dividers and 14px/16px row padding
// match the loaded list exactly.
function RowsSkeleton() {
  return (
    <SkeletonBlock className={styles.card} label="Loading notes">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className={styles.row}>
          <Skeleton width={16} height={16} radius={4} />
          <Skeleton height={14} width={`${70 - (i % 3) * 12}%`} radius={4} />
        </div>
      ))}
    </SkeletonBlock>
  );
}

export default function NotesPage() {
  const { notes, loading, error, deleteNote, promoteNote, openEditNote } = useApp();

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

      {loading && notes.length === 0 && !error ? (
        <RowsSkeleton />
      ) : !loading && notes.length === 0 && !error ? (
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
                      className={styles.editBtn}
                      onClick={() => openEditNote(note)}
                      aria-label="Edit note"
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
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
