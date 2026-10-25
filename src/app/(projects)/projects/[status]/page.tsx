'use client';

import { use, useRef, useState, type KeyboardEvent } from 'react';
import { useProjects } from '@/lib/projects-context';
import { useDictation } from '@/lib/use-dictation';
import { POOL_LABELS, statusFromSlug } from '@/lib/projects';
import type { ProjectStatus } from '@/lib/types';
import DictationControls from '../../../components/DictationControls';
import Skeleton, { SkeletonBlock } from '../../../components/Skeleton';
import ProjectCard from './ProjectCard';
import styles from './pool.module.css';

const SKELETON_CARDS = 4;

const EMPTY_COPY: Record<ProjectStatus, string> = {
  idea: 'No ideas yet. Write the first one down.',
  ongoing: 'Nothing in progress. Pick something from your ideas.',
  finished: 'Nothing shipped yet.',
};

// Same .grid/.card geometry as the real cards, so nothing shifts on load.
function PoolSkeleton() {
  return (
    <SkeletonBlock className={styles.grid} label="Loading projects">
      {Array.from({ length: SKELETON_CARDS }, (_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton height={16} width="50%" radius={4} />
          <Skeleton height={14} width="90%" radius={4} style={{ marginTop: 8 }} />
          <Skeleton height={14} width="60%" radius={4} style={{ marginTop: 8 }} />
          <div className={styles.cardFooter}>
            <Skeleton height={12} width={56} radius={4} style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      ))}
    </SkeletonBlock>
  );
}

function Composer({ status }: { status: ProjectStatus }) {
  const { addProject } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pitch, setPitch] = useState('');
  const [notes, setNotes] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  // An idea is often easier said than typed; the notes become the project's description.
  const dictation = useDictation(notes, setNotes);

  function reset() {
    setName('');
    setPitch('');
    setNotes('');
    dictation.clear();
  }

  function close() {
    if (dictation.listening) return;
    reset();
    setOpen(false);
  }

  // Stays open with focus back on the name, so several ideas go in a row.
  function save() {
    const trimmed = name.trim();
    // Saving mid-dictation would drop the tail, which only lands once recording stops.
    if (!trimmed || dictation.listening) return;
    const typed = { pitch, notes };
    reset();
    nameRef.current?.focus();
    void addProject({ name: trimmed, status, pitch: typed.pitch.trim() || null, description: typed.notes.trim() || null }).then(
      (created) => {
        // A failed save hands the text back, unless something new was typed meanwhile.
        if (created) return;
        setName((current) => current || trimmed);
        setPitch((current) => current || typed.pitch);
        setNotes((current) => current || typed.notes);
      },
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      close();
    }
  }

  // Enter is a new line here; Esc doesn't throw away a long thought.
  function handleNotesKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  }

  return (
    <div className={styles.composer}>
      {!open ? (
        <button type="button" className={styles.composerTrigger} onClick={() => setOpen(true)}>
          {status === 'idea' ? 'New idea' : 'New project'}
        </button>
      ) : (
        <>
          <input
            ref={nameRef}
            className={styles.composerInput}
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <input
            className={styles.composerInput}
            placeholder="One-line pitch (optional)"
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <textarea
            className={`${styles.composerInput} ${styles.composerNotes}`}
            placeholder={dictation.listening ? 'Listening…' : 'Talk it through (optional)'}
            aria-label="Notes"
            value={dictation.liveText}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={handleNotesKeyDown}
            readOnly={dictation.listening}
            rows={3}
          />
          {dictation.error && <p className={styles.voiceError}>{dictation.error}</p>}
          <div className={styles.composerActions}>
            <DictationControls dictation={dictation} hint="Talk the idea through" />
            <div className={styles.spacer} />
            <button type="button" className={styles.ghostBtn} onClick={close} disabled={dictation.listening}>
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
        </>
      )}
    </div>
  );
}

function Pool({ status }: { status: ProjectStatus }) {
  const { summaries, loading, error } = useProjects();
  const pool = summaries.filter((s) => s.project.status === status);
  const coldLoad = loading && summaries.length === 0 && !error;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Projects</div>
        <h1 className={styles.title}>{POOL_LABELS[status]}</h1>
        <div className={styles.meta}>
          {coldLoad ? (
            <Skeleton height={14} width={80} radius={4} />
          ) : (
            `${pool.length} ${pool.length === 1 ? 'project' : 'projects'}`
          )}
        </div>
      </header>

      {error && <div className={styles.message}>{error}</div>}

      <Composer status={status} />

      {coldLoad ? (
        <PoolSkeleton />
      ) : pool.length > 0 ? (
        <div className={styles.grid}>
          {pool.map((summary) => (
            <ProjectCard key={summary.project.id} summary={summary} />
          ))}
        </div>
      ) : (
        !loading && !error && <div className={styles.empty}>{EMPTY_COPY[status]}</div>
      )}
    </div>
  );
}

// `params` is a Promise in the App Router; unwrap it with React's `use`.
export default function PoolPage({ params }: { params: Promise<{ status: string }> }) {
  const { status: slug } = use(params);
  const status = statusFromSlug(slug);

  if (!status) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>Projects</div>
        </header>
        <div className={styles.empty}>No such list.</div>
      </div>
    );
  }

  // Keyed so a half-typed composer doesn't follow you to another pool.
  return <Pool key={status} status={status} />;
}
