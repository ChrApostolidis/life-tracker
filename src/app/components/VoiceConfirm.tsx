'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone } from '@fortawesome/free-solid-svg-icons';
import DateTimeFields from './DateTimeFields';
import { useApp } from '@/lib/app-context';
import { combineDateTime, toDateInput } from '@/lib/date';
import capStyles from './captureModal.module.css';
import styles from './voiceConfirm.module.css';

type Props = {
  transcript: string;
  kind: 'task' | 'note';
  prefillDate: Date | null;
  onRerecord: () => void;
  onSaved: () => void;
};

// The "HEARD YOU" confirm step: shows what was heard, lets the user fix the
// title and (for tasks) pick date/time, then saves with source 'voice'. The
// unedited transcript is kept as rawTranscript — text only, never audio.
export default function VoiceConfirm({ transcript, kind, prefillDate, onRerecord, onSaved }: Props) {
  const { addTask, addNote } = useApp();

  const [title, setTitle] = useState(transcript);
  const [date, setDate] = useState<Date | null>(prefillDate);
  const [time, setTime] = useState('');

  function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;

    if (kind === 'note') {
      void addNote({ body: trimmed, source: 'voice', rawTranscript: transcript });
    } else {
      const scheduledAt = date ? combineDateTime(toDateInput(date), time || '00:00') : null;
      void addTask({ title: trimmed, scheduledAt, source: 'voice', rawTranscript: transcript });
    }
    onSaved();
  }

  return (
    <form
      className={capStyles.form}
      onSubmit={(e) => { e.preventDefault(); handleSave(); }}
    >
      <div className={styles.transcriptCard}>
        <FontAwesomeIcon icon={faMicrophone} className={styles.transcriptIcon} />
        <span className={styles.transcriptText}>{transcript}</span>
      </div>

      <div className={capStyles.field}>
        <div className={styles.titleLabelRow}>
          <label className={capStyles.fieldLabel}>Title</label>
          <span className={styles.parsedChip}>✦ parsed from voice</span>
        </div>
        <input
          className={capStyles.titleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      {kind === 'task' && (
        <DateTimeFields date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
      )}

      <div className={capStyles.footer}>
        <button type="button" className={styles.rerecordBtn} onClick={onRerecord}>
          Re-record
        </button>
        <div className={capStyles.saveGroup}>
          <span className={capStyles.enterChip}>⏎</span>
          <button type="submit" className={capStyles.saveBtn}>Save</button>
        </div>
      </div>
    </form>
  );
}
