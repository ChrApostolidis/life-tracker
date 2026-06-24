'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faCalendar, faXmark } from '@fortawesome/free-solid-svg-icons';
import DatePicker from 'react-date-picker';
import Modal from './Modal';
import { useApp } from '@/lib/app-context';
import { combineDateTime, splitDateTime, toDateInput } from '@/lib/date';
import type { Task } from '@/lib/types';
import styles from './captureModal.module.css';

export default function CaptureModal() {
  const { captureState, closeCapture } = useApp();
  const { open, task } = captureState;

  // CaptureForm only mounts while the modal is open (Modal renders null when
  // closed), so its state initializes fresh from `task` each session. The key
  // also resets it if the edited task changes while the modal stays open.
  return (
    <Modal
      open={open}
      eyebrow={task ? 'Edit Task' : 'Quick Capture'}
      onClose={closeCapture}
      width={480}
    >
      <CaptureForm key={task?.id ?? 'new'} task={task} onSaved={closeCapture} />
    </Modal>
  );
}

function CaptureForm({ task, onSaved }: { task: Task | null; onSaved: () => void }) {
  const { addTask, updateTask } = useApp();
  const isEdit = task !== null;

  const [title, setTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState<Date | null>(
    task?.scheduledAt ? new Date(task.scheduledAt) : null,
  );
  const [time, setTime] = useState(task?.scheduledAt ? splitDateTime(task.scheduledAt).time : '');

  function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const scheduledAt = date && time ? combineDateTime(toDateInput(date), time) : null;

    if (isEdit && task) {
      // Note: PATCH can't clear scheduledAt, so blanking the date here leaves
      // the task scheduled server-side; un-scheduling needs a backend change.
      void updateTask(task.id, { title: trimmedTitle, scheduledAt });
    } else {
      void addTask({ title: trimmedTitle, scheduledAt });
    }
    onSaved();
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => { e.preventDefault(); handleSave(); }}
    >
      <input
        className={styles.titleInput}
        placeholder="What's on your mind?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <div className={styles.dateTimeGrid}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Date</label>
          <div className={styles.datePicker}>
            <DatePicker
              value={date}
              onChange={(value) => setDate(value as Date | null)}
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
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.micBtn} aria-label="Record voice">
          <FontAwesomeIcon icon={faMicrophone} />
        </button>
        <div className={styles.saveGroup}>
          <span className={styles.enterChip}>⏎</span>
          <button type="submit" className={styles.saveBtn}>Save</button>
        </div>
      </div>
    </form>
  );
}
