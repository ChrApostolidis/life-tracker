'use client';

import { useState, type KeyboardEvent } from 'react';
import { useProjects } from '@/lib/projects-context';
import { useDictation } from '@/lib/use-dictation';
import { MAX_PROJECT_TAGS } from '@/lib/projects';
import { serializeTags, type ProjectStatus } from '@/lib/types';
import DictationControls from '../../../components/DictationControls';
import Modal from '../../../components/Modal';
import ChipInput from '../../ChipInput';
import styles from './newProjectModal.module.css';

type Props = {
  status: ProjectStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Stays mounted while closed, so a draft survives Esc or a stray click outside;
// only Save and Cancel clear it.
export default function NewProjectModal({ status, open, onOpenChange }: Props) {
  const { addProject } = useProjects();
  const [name, setName] = useState('');
  const [pitch, setPitch] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  // An idea is often easier said than typed; the notes become the project's description.
  const dictation = useDictation(notes, setNotes);

  function reset() {
    setName('');
    setPitch('');
    setNotes('');
    setTags([]);
    dictation.clear();
  }

  // Closing mid-dictation would drop the tail, which only lands once recording stops.
  function close() {
    if (!dictation.listening) onOpenChange(false);
  }

  function cancel() {
    if (dictation.listening) return;
    reset();
    onOpenChange(false);
  }

  // Closes at once (the card appears optimistically); a failed save reopens with the text back.
  function save() {
    const trimmed = name.trim();
    if (!trimmed || dictation.listening) return;
    const typed = { pitch, notes, tags };
    reset();
    onOpenChange(false);
    void addProject({
      name: trimmed,
      status,
      pitch: typed.pitch.trim() || null,
      description: typed.notes.trim() || null,
      tags: serializeTags(typed.tags, MAX_PROJECT_TAGS),
    }).then((created) => {
      if (created) return;
      setName(trimmed);
      setPitch(typed.pitch);
      setNotes(typed.notes);
      setTags(typed.tags);
      onOpenChange(true);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  }

  // Enter is a new line here, so a long thought saves with Cmd/Ctrl+Enter.
  function handleNotesKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  }

  return (
    <Modal
      open={open}
      eyebrow={status === 'idea' ? 'New idea' : 'New project'}
      onClose={close}
      width={560}
      height={600}
    >
      <div className={styles.form}>
        <input
          className={styles.name}
          placeholder="Name"
          aria-label="Name"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <input
          className={styles.input}
          placeholder="One-line pitch (optional)"
          aria-label="Pitch"
          maxLength={200}
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <textarea
          className={`${styles.input} ${styles.notes}`}
          placeholder={dictation.listening ? 'Listening…' : 'Talk it through (optional)'}
          aria-label="Notes"
          value={dictation.liveText}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleNotesKeyDown}
          readOnly={dictation.listening}
        />
        {dictation.error && <p className={styles.voiceError}>{dictation.error}</p>}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-project-tags">
            Tags
          </label>
          <ChipInput
            id="new-project-tags"
            values={tags}
            onChange={setTags}
            max={MAX_PROJECT_TAGS}
            placeholder="work, weekend, client…"
            inset
          />
        </div>
      </div>

      <div className={styles.actions}>
        <DictationControls dictation={dictation} hint="Talk the idea through" />
        <div className={styles.spacer} />
        <button type="button" className={styles.ghostBtn} onClick={cancel} disabled={dictation.listening}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={save}
          disabled={!name.trim() || dictation.listening}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
