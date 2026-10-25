'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import styles from './addButton.module.css';

// The header "+ Add" button from the day view. On mobile it shrinks to the icon,
// so the label also goes in aria-label to keep a name for screen readers.
export default function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.addBtn} onClick={onClick} aria-label={label}>
      <FontAwesomeIcon icon={faPlus} />
      <span className={styles.label}>{label}</span>
    </button>
  );
}
