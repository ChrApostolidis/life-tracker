'use client';

import { useState, type KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { parseTags, serializeTags } from '@/lib/types';
import styles from './chipInput.module.css';

type Props = {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  max: number;
  placeholder: string;
  // On an elevated surface (a modal) the field sits one step down, like the inputs beside it.
  inset?: boolean;
};

// Enter or comma commits a chip, Backspace on an empty input removes the last one.
// A half-typed chip is committed on blur rather than dropped.
export default function ChipInput({ id, values, onChange, max, placeholder, inset = false }: Props) {
  const [draft, setDraft] = useState('');

  function commit() {
    const value = draft.trim();
    // At the cap the text stays put rather than vanishing unsaved.
    if (!value || values.length >= max) return;
    onChange(parseTags(serializeTags([...values, value], max)));
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className={[styles.field, inset ? styles.fieldInset : ''].filter(Boolean).join(' ')}>
      {values.map((value) => (
        <span key={value} className={styles.chip}>
          {value}
          <button
            type="button"
            className={styles.remove}
            onClick={() => onChange(values.filter((v) => v !== value))}
            aria-label={`Remove ${value}`}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </span>
      ))}
      <input
        id={id}
        className={styles.input}
        placeholder={values.length === 0 ? placeholder : values.length >= max ? `${max} max` : ''}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
    </div>
  );
}
