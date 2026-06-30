'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/lib/app-context';
import styles from './fab.module.css';

export default function Fab() {
  const { openCapture } = useApp();
  return (
    <button className={styles.fab} onClick={() => openCapture()} aria-label="Quick capture (Ctrl+K)">
      <FontAwesomeIcon icon={faPlus} />
    </button>
  );
}
