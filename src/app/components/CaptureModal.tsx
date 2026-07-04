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
import type { Task } from '@/lib/types';
import styles from './captureModal.module.css';

type CaptureKind = 'task' | 'note';
type VoiceLang = 'el-GR' | 'en-US';

const VOICE_LANG_KEY = 'lt-voice-lang';

export default function CaptureModal() {
  const { captureState, closeCapture } = useApp();
  const { open, task, prefillDate } = captureState;

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
  const eyebrow = confirming ? 'Heard you' : task ? 'Edit Task' : 'Quick Capture';

  return (
    <Modal open={open} eyebrow={eyebrow} onClose={handleClose} width={confirming ? 520 : 480}>
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
          key={task?.id ?? 'new'}
          task={task}
          prefillDate={prefillDate}
          kind={kind}
          onKindChange={setKind}
          onVoiceCaptured={setVoiceTranscript}
          onSaved={handleClose}
        />
      )}
    </Modal>
  );
}

function CaptureForm({
  task,
  prefillDate,
  kind,
  onKindChange,
  onVoiceCaptured,
  onSaved,
}: {
  task: Task | null;
  prefillDate: Date | null;
  kind: CaptureKind;
  onKindChange: (kind: CaptureKind) => void;
  onVoiceCaptured: (transcript: string) => void;
  onSaved: () => void;
}) {
  const { addTask, updateTask, deleteTask, addNote } = useApp();
  const isEdit = task !== null;

  const [title, setTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState<Date | null>(
    task?.scheduledAt ? new Date(task.scheduledAt) : prefillDate,
  );
  const [time, setTime] = useState(task?.scheduledAt ? splitDateTime(task.scheduledAt).time : '');

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
    if (!task) return;
    void deleteTask(task.id);
    onSaved();
  }

  function handleSave() {
    if (speech.listening) return; // Enter mid-recording would save stale text
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    if (kind === 'note' && !isEdit) {
      void addNote({ body: trimmedTitle });
      onSaved();
      return;
    }

    // A date alone schedules the task; the time is optional and defaults to the
    // start of the day. Without a date the task stays unscheduled (inbox).
    const scheduledAt = date ? combineDateTime(toDateInput(date), time || '00:00') : null;

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
      {!isEdit && (
        <div className={styles.kindToggle} role="radiogroup" aria-label="Capture as">
          <button
            type="button"
            role="radio"
            aria-checked={kind === 'task'}
            className={[styles.kindOption, kind === 'task' ? styles.kindOptionActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onKindChange('task')}
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
            onClick={() => onKindChange('note')}
          >
            Note
          </button>
        </div>
      )}

      <input
        className={styles.titleInput}
        placeholder={
          speech.listening
            ? 'Listening…'
            : kind === 'note' && !isEdit
              ? 'Capture a thought'
              : "What's on your mind?"
        }
        value={speech.listening ? liveText : title}
        onChange={(e) => setTitle(e.target.value)}
        readOnly={speech.listening}
        autoFocus
      />

      {(isEdit || kind === 'task') && (
        <DateTimeFields date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
      )}

      {speech.error && <div className={styles.voiceError}>{speech.error}</div>}

      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          {!isEdit && (
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
          {isEdit && (
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={handleDelete}
              aria-label="Delete task"
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
