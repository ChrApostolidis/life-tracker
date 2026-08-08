'use client';

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '@/lib/api';
import { toDateInput } from '@/lib/date';
import styles from './dayJournal.module.css';

// No context provider here on purpose — Money/Habits share state across
// multiple surfaces, but the journal has exactly one (this component), so a
// provider would be pure ceremony. State lives locally, scoped to one date.
export default function DayJournal({ date }: { date: Date }) {
  const dateKey = toDateInput(date);

  const [body, setBody] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Latest draft + what's actually persisted, read by the unmount-save effect
  // so navigating away without blurring first doesn't lose the edit. ratingRef
  // mirrors the rating state for the same reason — the unmount cleanup below
  // is created once on mount, so it can only see current values via refs.
  const draftRef = useRef('');
  const savedRef = useRef('');
  const ratingRef = useRef<number | null>(null);
  const dateKeyRef = useRef(dateKey);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Load-on-mount/date-change; this effect owns loading/status for its own fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setStatus('idle');

    api
      .getDayNote(dateKey)
      .then((note) => {
        if (cancelled) return;
        setBody(note.body);
        setRating(note.rating);
        draftRef.current = note.body;
        savedRef.current = note.body;
        ratingRef.current = note.rating;
      })
      .catch((e) => {
        if (cancelled) return;
        // 404 = no entry yet for this day — that's the normal empty state,
        // not an error.
        if (e instanceof ApiError && e.status === 404) {
          setBody('');
          setRating(null);
          draftRef.current = '';
          savedRef.current = '';
          ratingRef.current = null;
        } else {
          setStatus('error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    dateKeyRef.current = dateKey;
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  function flashStatus(next: 'saved' | 'error') {
    setStatus(next);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus('idle'), 3000);
  }

  function save(nextBody: string, nextRating: number | null) {
    const key = dateKeyRef.current;
    void api
      .saveDayNote(key, { body: nextBody, rating: nextRating })
      .then(() => {
        savedRef.current = nextBody;
        flashStatus('saved');
      })
      .catch(() => flashStatus('error'));
  }

  function handleBlur() {
    if (draftRef.current === savedRef.current) return;
    save(draftRef.current, ratingRef.current);
  }

  // Saves a pending edit on unmount (e.g. navigating to another day without
  // blurring the textarea first) — reads refs, not state, since this closure
  // is created once on mount and would otherwise see stale values.
  useEffect(() => {
    return () => {
      if (draftRef.current !== savedRef.current) {
        void api.saveDayNote(dateKeyRef.current, { body: draftRef.current, rating: ratingRef.current });
      }
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  function handleRate(n: number) {
    setRating(n);
    ratingRef.current = n;
    save(draftRef.current, n);
  }

  if (loading) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionLabel}>Journal</div>
      <div className={styles.card}>
        <textarea
          className={styles.textarea}
          placeholder="How did the day go?"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            draftRef.current = e.target.value;
          }}
          onBlur={handleBlur}
          rows={4}
        />
        <div className={styles.footer}>
          <div className={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={styles.starBtn}
                onClick={() => handleRate(n)}
                aria-label={`Rate the day ${n} star${n === 1 ? '' : 's'}`}
              >
                <FontAwesomeIcon
                  icon={faStar}
                  className={rating && n <= rating ? styles.starFilled : styles.starEmpty}
                />
              </button>
            ))}
          </div>
          {status !== 'idle' && (
            <span className={status === 'error' ? styles.statusError : styles.statusSaved}>
              {status === 'error' ? 'Could not save' : 'Saved'}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
