'use client';

import { useEffect, useRef, type Ref } from 'react';
import styles from './timePicker.module.css';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTE_STEP = 5;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
const DAY_MINUTES = 24 * 60;

// Values are 'HH:MM' in 24-hour time — the shape formatTimeLabel and
// combineDateTime already speak, so the picker drops in where <input type="time"> was.
function parseTime(value: string): [number, number] {
  const [h, m] = value.split(':').map(Number);
  return [h || 0, m || 0];
}

function formatTime(totalMinutes: number): string {
  const wrapped = ((totalMinutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// The field itself: shows the time and toggles the panel. Arrow keys nudge it
// by the grid's step, wrapping past midnight.
export function TimeTrigger({
  label,
  value,
  open,
  panelId,
  buttonRef,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  open: boolean;
  panelId: string;
  buttonRef: Ref<HTMLButtonElement>;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const [h, m] = parseTime(value);
    onChange(formatTime(h * 60 + m + (e.key === 'ArrowUp' ? MINUTE_STEP : -MINUTE_STEP)));
  }

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className={[styles.trigger, open ? styles.triggerOpen : ''].filter(Boolean).join(' ')}
        aria-label={`${label} ${value}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
      >
        {value}
      </button>
    </div>
  );
}

// The floating panel. It positions against its nearest positioned ancestor and
// spans that box's width, so put it inside the row of fields it belongs to —
// then it can't spill off a phone screen. Picking a minute finishes the choice.
export default function TimePicker({
  id,
  label,
  value,
  onChange,
  onDone,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
}) {
  const [hour, minute] = parseTime(value);
  const selectedHourRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the panel on open, so the keyboard lands where the choice is.
  useEffect(() => {
    selectedHourRef.current?.focus();
  }, []);

  return (
    <div
      id={id}
      className={styles.panel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <div className={styles.groupLabel}>Hour</div>
      <div className={styles.hourGrid} role="group" aria-label={`${label} hour`}>
        {HOURS.map((h) => (
          <button
            key={h}
            ref={h === hour ? selectedHourRef : undefined}
            type="button"
            className={h === hour ? styles.optionSelected : styles.option}
            aria-pressed={h === hour}
            onClick={() => onChange(formatTime(h * 60 + minute))}
          >
            {pad(h)}
          </button>
        ))}
      </div>

      <div className={styles.groupLabel}>Minute</div>
      <div className={styles.minuteGrid} role="group" aria-label={`${label} minute`}>
        {MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            className={m === minute ? styles.optionSelected : styles.option}
            aria-pressed={m === minute}
            onClick={() => {
              onChange(formatTime(hour * 60 + m));
              onDone();
            }}
          >
            {pad(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
