'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar, faXmark } from '@fortawesome/free-solid-svg-icons';
import DatePicker from 'react-date-picker';
// Shared with CaptureModal/VoiceConfirm — the date-picker overrides live there.
import styles from './captureModal.module.css';

type Props = {
  date: Date | null;
  time: string;
  onDateChange: (date: Date | null) => void;
  onTimeChange: (time: string) => void;
};

export default function DateTimeFields({ date, time, onDateChange, onTimeChange }: Props) {
  return (
    <div className={styles.dateTimeGrid}>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Date</label>
        <div className={styles.datePicker}>
          <DatePicker
            value={date}
            onChange={(value) => onDateChange(value as Date | null)}
            format="y-MM-dd"
            locale="en-US"
            dayPlaceholder="dd"
            monthPlaceholder="mm"
            yearPlaceholder="yyyy"
            calendarIcon={<FontAwesomeIcon icon={faCalendar} />}
            clearIcon={date ? <FontAwesomeIcon icon={faXmark} /> : null}
            calendarProps={{ prev2Label: null, next2Label: null }}
          />
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Time</label>
        <input
          type="time"
          className={styles.timeInput}
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
        />
      </div>
    </div>
  );
}
