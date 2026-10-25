'use client';

import { useState, type KeyboardEvent } from 'react';
import { useProjectUpdates } from '@/lib/use-project-updates';
import { useDictation } from '@/lib/use-dictation';
import { toDateInput } from '@/lib/date';
import type { ProjectUpdate, ProjectUpdateInput, ProjectUpdatePatch } from '@/lib/types';
import DictationControls from '../../components/DictationControls';
import Skeleton, { SkeletonBlock } from '../../components/Skeleton';
import { formatDay, useTwoTapDelete } from './project-ui';
import styles from './updates.module.css';

const SKELETON_ROWS = 4;

function isSaveShortcut(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === 'Enter' && (e.metaKey || e.ctrlKey);
}

export default function Updates({ projectId }: { projectId: string }) {
  const { updates, loading, error, addUpdate, updateUpdate, deleteUpdate } = useProjectUpdates(projectId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const showSkeleton = loading && updates.length === 0 && !error;

  return (
    <div className={styles.updates}>
      <Composer onSave={addUpdate} />

      {error && <p className={styles.error}>{error}</p>}

      {showSkeleton ? (
        <SkeletonBlock className={styles.list} label="Loading updates">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div key={i} className={styles.row}>
              <Skeleton height={12} width={120} radius={4} />
              <Skeleton height={14} width={`${80 - (i % 3) * 15}%`} radius={4} />
            </div>
          ))}
        </SkeletonBlock>
      ) : updates.length === 0 ? (
        !loading && !error && <p className={styles.empty}>No updates yet. Note what moved.</p>
      ) : (
        <div className={styles.list}>
          {updates.map((update) => (
            <UpdateRow
              key={update.id}
              update={update}
              expanded={expandedId === update.id}
              onOpen={() => setExpandedId(update.id)}
              onClose={() => setExpandedId(null)}
              onSave={(patch) => updateUpdate(update.id, patch)}
              onDelete={() => void deleteUpdate(update.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composer — the Journal composer's voice behaviour ──

function Composer({ onSave }: { onSave: (input: ProjectUpdateInput) => Promise<boolean> }) {
  const [body, setBody] = useState('');
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [saving, setSaving] = useState(false);

  const dictation = useDictation(body, setBody);

  async function handleSave() {
    if (dictation.listening || saving) return; // saving mid-dictation would drop the tail
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    const ok = await onSave({
      body: text,
      entryDate: date,
      source: dictation.transcript ? 'voice' : 'text',
      rawTranscript: dictation.transcript,
    });
    setSaving(false);
    // A failed save keeps the text; the hook's error says what went wrong.
    if (!ok) return;
    setBody('');
    setDate(toDateInput(new Date()));
    dictation.clear();
  }

  return (
    <div className={styles.composer}>
      <textarea
        className={styles.textarea}
        placeholder={dictation.listening ? 'Listening…' : 'What moved on this project?'}
        aria-label="Update"
        value={dictation.liveText}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (isSaveShortcut(e)) {
            e.preventDefault();
            void handleSave();
          }
        }}
        readOnly={dictation.listening || saving}
        rows={3}
      />
      {dictation.error && <p className={styles.voiceError}>{dictation.error}</p>}

      <div className={styles.actions}>
        <DictationControls dictation={dictation} hint="Dictate into this update" />
        <input
          type="date"
          className={styles.date}
          aria-label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className={styles.spacer} />
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void handleSave()}
          disabled={!body.trim() || !date || dictation.listening || saving}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── One update ──

function UpdateRow({
  update,
  expanded,
  onOpen,
  onClose,
  onSave,
  onDelete,
}: {
  update: ProjectUpdate;
  expanded: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (patch: ProjectUpdatePatch) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [body, setBody] = useState(update.body);
  const [date, setDate] = useState(update.entryDate);
  const [saving, setSaving] = useState(false);
  const deleteTap = useTwoTapDelete();
  // An optimistic row has no server id yet, so there's nothing to edit.
  const pending = update.id.startsWith('temp-');

  function open() {
    setBody(update.body);
    setDate(update.entryDate);
    onOpen();
  }

  async function save() {
    const text = body.trim();
    if (!text || !date) return;
    const patch: ProjectUpdatePatch = {};
    if (text !== update.body) patch.body = text;
    if (date !== update.entryDate) patch.entryDate = date;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    const ok = await onSave(patch);
    setSaving(false);
    if (ok) onClose();
  }

  if (!expanded) {
    return (
      <button type="button" className={styles.row} onClick={open} disabled={pending}>
        <span className={styles.rowDate}>{formatDay(update.entryDate)}</span>
        <span className={styles.rowBody}>{update.body}</span>
      </button>
    );
  }

  return (
    <div className={`${styles.row} ${styles.rowOpen}`}>
      <span className={styles.rowDate}>{formatDay(update.entryDate)}</span>
      <textarea
        className={styles.textarea}
        aria-label="Update"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (isSaveShortcut(e)) {
            e.preventDefault();
            void save();
          }
        }}
        rows={4}
        autoFocus
      />
      <div className={styles.actions}>
        <input
          type="date"
          className={styles.date}
          aria-label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          type="button"
          className={[styles.deleteBtn, deleteTap.armed ? styles.deleteBtnArmed : ''].filter(Boolean).join(' ')}
          onClick={() => {
            if (deleteTap.confirm()) onDelete();
          }}
        >
          {deleteTap.armed ? 'Tap again to delete' : 'Delete'}
        </button>
        <div className={styles.spacer} />
        <button type="button" className={styles.ghostBtn} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void save()}
          disabled={!body.trim() || !date || saving}
        >
          Save
        </button>
      </div>
    </div>
  );
}
