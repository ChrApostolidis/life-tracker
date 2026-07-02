'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import styles from './periodNav.module.css';

type Props = {
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
};

// prev / today / next header controls shared by the Week and Month views.
export default function PeriodNav({ onPrev, onToday, onNext }: Props) {
  return (
    <div className={styles.nav}>
      <button type="button" className={styles.btn} onClick={onPrev} aria-label="Previous">
        <FontAwesomeIcon icon={faChevronLeft} />
      </button>
      <button type="button" className={styles.btn} onClick={onToday}>
        Today
      </button>
      <button type="button" className={styles.btn} onClick={onNext} aria-label="Next">
        <FontAwesomeIcon icon={faChevronRight} />
      </button>
    </div>
  );
}
