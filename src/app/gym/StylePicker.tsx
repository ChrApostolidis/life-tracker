'use client';

import type { TrainingStyle } from '@/lib/types';
import { STYLE_OPTIONS } from '@/lib/gym';
import styles from './stylePicker.module.css';

type Props = {
  current: TrainingStyle | null;
  onChoose: (style: TrainingStyle) => void;
  // Absent on first visit: there's nothing to go back to until a style exists.
  onCancel?: () => void;
};

export default function StylePicker({ current, onChoose, onCancel }: Props) {
  return (
    <section className={styles.picker} aria-labelledby="style-picker-title">
      <div className={styles.head}>
        <h2 id="style-picker-title" className={styles.title}>
          How do you like to train?
        </h2>
        <p className={styles.sub}>
          This sets the rep range each suggestion aims for. Isolation work stays in higher reps either way.
          You can change it any time, or pin a range on a single exercise.
        </p>
      </div>

      <div className={styles.options}>
        {STYLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={[styles.option, option.value === current ? styles.optionCurrent : ''].filter(Boolean).join(' ')}
            onClick={() => onChoose(option.value)}
            aria-pressed={option.value === current}
          >
            <span className={styles.optionLabel}>{option.label}</span>
            <span className={styles.optionBlurb}>{option.blurb}</span>
            <span className={styles.ranges}>
              <span className={styles.rangeLabel}>Compound</span>
              <span className={styles.rangeValue}>{option.compound}</span>
              <span className={styles.rangeLabel}>Isolation</span>
              <span className={styles.rangeValue}>{option.isolation}</span>
            </span>
          </button>
        ))}
      </div>

      {onCancel && (
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Keep current style
        </button>
      )}
    </section>
  );
}
