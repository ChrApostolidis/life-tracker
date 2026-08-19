'use client';

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faTrash } from '@fortawesome/free-solid-svg-icons';
import Modal from './Modal';
import DateTimeFields from './DateTimeFields';
import VoiceConfirm from './VoiceConfirm';
import { useApp } from '@/lib/app-context';
import { combineDateTime, splitDateTime, toDateInput } from '@/lib/date';
import { useSpeechRecognition } from '@/lib/use-speech-recognition';
import type { Note, Recurrence, Task } from '@/lib/types';
import styles from './captureModal.module.css';

type CaptureKind = 'task' | 'note';
type VoiceLang = 'el-GR' | 'en-US';

const VOICE_LANG_KEY = 'lt-voice-lang';

export default function CaptureModal() {
  const { captureState, closeCapture } = useApp();
  const { open, task, note, prefillDate } = captureState;

  // Lifted here (not in CaptureForm) because the voice-confirm view needs them
  // and it replaces the form inside the same modal.
  const [kind, setKind] = useState<CaptureKind>('task');
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);

  // This component stays mounted while the modal is closed — every close path
  // funnels through here so the next session starts fresh.
  function handleClose() {
    setKind('task');
    setVoiceTranscript(null);
    closeCapture();
  }

  const confirming = voiceTranscript !== null;
  const isNewCapture = !task && !note && !confirming;
  const eyebrow = confirming
    ? 'Heard you'
    : task
      ? 'Edit Task'
      : note
        ? 'Edit Note'
        : 'Quick Capture';

  const kindToggle = isNewCapture && (
    <div className={styles.kindToggle} role="radiogroup" aria-label="Capture as">
      <button
        type="button"
        role="radio"
        aria-checked={kind === 'task'}
        className={[styles.kindOption, kind === 'task' ? styles.kindOptionActive : '']
          .filter(Boolean)
          .join(' ')}
        onClick={() => setKind('task')}
      >
        Task
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={kind === 'note'}
        className={[styles.kindOption, kind === 'note' ? styles.kindOptionActive : '']
          .filter(Boolean)
          .join(' ')}
        onClick={() => setKind('note')}
      >
        Note
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      eyebrow={eyebrow}
      eyebrowExtra={kindToggle}
      onClose={handleClose}
      width={560}
      height={640}
    >
      {confirming ? (
        <VoiceConfirm
          transcript={voiceTranscript}
          kind={kind}
          prefillDate={prefillDate}
          onRerecord={() => setVoiceTranscript(null)}
          onSaved={handleClose}
        />
      ) : (
        <CaptureForm
          key={task?.id ?? note?.id ?? 'new'}
          task={task}
          note={note}
          prefillDate={prefillDate}
          kind={kind}
          onVoiceCaptured={setVoiceTranscript}
          onSaved={handleClose}
        />
      )}
    </Modal>
  );
}

function CaptureForm({
  task,
  note,
  prefillDate,
  kind,
  onVoiceCaptured,
  onSaved,
}: {
  task: Task | null;
  note: Note | null;
  prefillDate: Date | null;
  kind: CaptureKind;
  onVoiceCaptured: (transcript: string) => void;
  onSaved: () => void;
}) {
  const { addTask, updateTask, unscheduleTask, deleteTask, addNote, updateNote, deleteNote } = useApp();
  const isTaskEdit = task !== null;
  const isNoteEdit = note !== null;
  // Note mode (new capture or edit): multi-line body, no date fields.
  const noteMode = isNoteEdit || (!isTaskEdit && kind === 'note');

  const [title, setTitle] = useState(task?.title ?? note?.body ?? '');
  const [date, setDate] = useState<Date | null>(
    task?.scheduledAt ? new Date(task.scheduledAt) : prefillDate,
  );
  const [time, setTime] = useState(task?.scheduledAt ? splitDateTime(task.scheduledAt).time : '');
  const [recurrence, setRecurrence] = useState<Recurrence | null>(task?.recurrence ?? null);
  const [dateError, setDateError] = useState<string | null>(null);
 
  const isExistingRecurring = isTaskEdit && task?.recurrence != null;

  // ── Voice capture (speech-to-text only; no audio is recorded or stored) ──
  const speech = useSpeechRecognition();
  // Lazy read is safe: this form only mounts client-side, inside the open modal.
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem(VOICE_LANG_KEY) === 'en-US'
      ? 'en-US'
      : 'el-GR',
  );
  // Distinguishes "recognition ended after our capture" from unrelated renders.
  const capturingRef = useRef(false);

  function toggleVoiceLang() {
    const next: VoiceLang = voiceLang === 'el-GR' ? 'en-US' : 'el-GR';
    setVoiceLang(next);
    window.localStorage.setItem(VOICE_LANG_KEY, next);
  }

  function handleMicClick() {
    if (speech.listening) {
      speech.stop();
    } else {
      capturingRef.current = true;
      speech.reset();
      speech.start(voiceLang);
    }
  }

  // Recognition ended (mic tapped again, or auto-end on silence): hand the
  // final transcript to the HEARD YOU confirm view.
  useEffect(() => {
    if (!speech.listening && capturingRef.current) {
      capturingRef.current = false;
      const transcript = speech.transcript.trim();
      if (transcript) onVoiceCaptured(transcript);
    }
  }, [speech.listening, speech.transcript, onVoiceCaptured]);

  const liveText = [speech.transcript, speech.interimTranscript].filter(Boolean).join(' ');

  function handleDelete() {
    if (task) void deleteTask(task.id);
    else if (note) void deleteNote(note.id);
    onSaved();
  }

  function handleSave() {
    if (speech.listening) return; // Enter mid-recording would save stale text
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    if (isNoteEdit && note) {
      void updateNote(note.id, { body: trimmedTitle });
      onSaved();
      return;
    }

    if (kind === 'note' && !isTaskEdit) {
      void addNote({ body: trimmedTitle });
      onSaved();
      return;
    }

    // Clearing the date on an existing scheduled task means "back to the inbox",
    // which PATCH can't express (null = unchanged) — it needs its own endpoint.
    if (isTaskEdit && task && !date && task.scheduledAt) {
      if (trimmedTitle !== task.title) void updateTask(task.id, { title: trimmedTitle });
      void unscheduleTask(task.id);
      onSaved();
      return;
    }

    // A date alone schedules the task. Blanking the time on a task that already
    // had one keeps its original time-of-day: there's no all-day flag in the
    // model, so defaulting to 00:00 would silently reschedule it to midnight.
    // A brand-new task with no time starts at the top of the day.
    const fallbackTime =
      isTaskEdit && task?.scheduledAt ? splitDateTime(task.scheduledAt).time : '00:00';
    const scheduledAt = date ? combineDateTime(toDateInput(date), time || fallbackTime) : null;
    if (date && scheduledAt === null) {
      setDateError('That date and time did not parse. Check the fields and try again.');
      return;
    }
    setDateError(null);
    // Weekly derives its weekday from the picked date — 0 (Sun)–6 (Sat), same
    // convention the backend expects, no separate day picker needed.
    const recurrenceDay = recurrence === 'weekly' && date ? date.getDay() : null;

    if (isTaskEdit && task) {
      void updateTask(task.id, { title: trimmedTitle, scheduledAt, recurrence, recurrenceDay });
    } else {
      void addTask({ title: trimmedTitle, scheduledAt, recurrence, recurrenceDay });
    }
    onSaved();
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => { e.preventDefault(); handleSave(); }}
    >
      <textarea
        className={noteMode ? `${styles.titleInput} ${styles.noteInput}` : styles.titleInput}
        placeholder={
          speech.listening ? 'Listening…' : noteMode ? 'Capture a thought' : "What's on your mind?"
        }
        value={speech.listening ? liveText : title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          // Enter saves (textareas don't submit the form); Shift+Enter makes a newline
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          }
        }}
        readOnly={speech.listening}
        rows={5}
        autoFocus
      />

      {!noteMode && (
        <DateTimeFields date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
      )}

      {!noteMode && date && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Repeat</label>
          <select
            className={styles.timeInput}
            value={recurrence ?? ''}
            onChange={(e) => setRecurrence((e.target.value || null) as Recurrence | null)}
          >
            {!isExistingRecurring && <option value="">None</option>}
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          {isExistingRecurring && (
            <span className={styles.recurHint}>Changes apply to the whole series</span>
          )}
        </div>
      )}

      {dateError && <div className={styles.voiceError}>{dateError}</div>}
      {speech.error && <div className={styles.voiceError}>{speech.error}</div>}

      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          {!isTaskEdit && !isNoteEdit && (
            <>
              <button
                type="button"
                className={[styles.micBtn, speech.listening ? styles.micBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={handleMicClick}
                disabled={!speech.supported}
                title={
                  speech.supported
                    ? speech.listening
                      ? 'Stop recording'
                      : 'Capture by voice'
                    : 'Voice capture is not supported in this browser'
                }
                aria-label={speech.listening ? 'Stop recording' : 'Record voice'}
              >
                <FontAwesomeIcon icon={faMicrophone} />
              </button>
              <button
                type="button"
                className={styles.langChip}
                onClick={toggleVoiceLang}
                disabled={speech.listening}
                title="Voice language"
              >
                {voiceLang === 'el-GR' ? 'EL' : 'EN'}
              </button>
            </>
          )}
          {(isTaskEdit || isNoteEdit) && (
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={handleDelete}
              aria-label={isTaskEdit ? 'Delete task' : 'Delete note'}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          )}
        </div>
        <div className={styles.saveGroup}>
          <span className={styles.enterChip}>⏎</span>
          <button type="submit" className={styles.saveBtn}>Save</button>
        </div>
      </div>
    </form>
  );
}
