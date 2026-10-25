'use client';

import { useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useProjects } from '@/lib/projects-context';
import { useDictation } from '@/lib/use-dictation';
import {
  MAX_TECH_STACK,
  STAGES,
  STAGE_LABELS,
  STATUSES,
  STATUS_LABELS,
  progressOf,
  slugForStatus,
} from '@/lib/projects';
import {
  parseTags,
  serializeTags,
  type Project,
  type ProjectPatch,
  type ProjectStage,
  type ProjectStatus,
} from '@/lib/types';
import DictationControls from '../../components/DictationControls';
import { formatDay, useTwoTapDelete } from './project-ui';
import styles from './overview.module.css';

type TextField = 'pitch' | 'description' | 'repoUrl' | 'liveUrl';
type UrlField = 'repoUrl' | 'liveUrl';

const URL_FIELDS: { key: UrlField; label: string; placeholder: string }[] = [
  { key: 'repoUrl', label: 'Repository', placeholder: 'https://github.com/…' },
  { key: 'liveUrl', label: 'Live site', placeholder: 'https://…' },
];

// The backend 400s on any other scheme, so a javascript: URL never reaches an href.
function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export default function Overview({
  project,
  counts,
}: {
  project: Project;
  counts: Record<ProjectStage, number>;
}) {
  const router = useRouter();
  const { updateProject, deleteProject, error } = useProjects();

  const [drafts, setDrafts] = useState<Record<TextField, string>>({
    pitch: project.pitch ?? '',
    description: project.description ?? '',
    repoUrl: project.repoUrl ?? '',
    liveUrl: project.liveUrl ?? '',
  });
  const [urlErrors, setUrlErrors] = useState<Partial<Record<UrlField, string>>>({});
  const [stack, setStack] = useState(() => parseTags(project.techStack));
  const [stackDraft, setStackDraft] = useState('');
  const deleteTap = useTwoTapDelete();
  const [deleting, setDeleting] = useState(false);

  const progress = progressOf(counts);

  function save(patch: ProjectPatch) {
    void updateProject(project.id, patch);
  }

  // Dictation lands after the field has already lost focus to the mic, so it saves itself.
  const dictation = useDictation(drafts.description, (next) => {
    editDraft('description', next);
    if (next.trim() !== (project.description ?? '')) save({ description: next.trim() });
  });

  // Saves on blur, only when changed. An empty string clears the field; null would mean "unchanged".
  function saveText(key: TextField) {
    const value = drafts[key].trim();
    if (value !== (project[key] ?? '')) save({ [key]: value });
  }

  function saveUrl(key: UrlField) {
    const value = drafts[key].trim();
    if (value && !isWebUrl(value)) {
      setUrlErrors((prev) => ({ ...prev, [key]: 'Links must start with http:// or https://' }));
      return;
    }
    saveText(key);
  }

  function editDraft(key: TextField, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
    if (key === 'repoUrl' || key === 'liveUrl') setUrlErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  // Chips are discrete actions, so they save as they change rather than on blur.
  function saveStack(next: string[]) {
    setStack(next);
    const serialized = serializeTags(next, MAX_TECH_STACK) ?? '';
    if (serialized !== (project.techStack ?? '')) save({ techStack: serialized });
  }

  function commitStack() {
    const tech = stackDraft.trim();
    // At the cap the text stays put rather than vanishing unsaved.
    if (!tech || stack.length >= MAX_TECH_STACK) return;
    saveStack(parseTags(serializeTags([...stack, tech], MAX_TECH_STACK)));
    setStackDraft('');
  }

  function handleStackKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitStack();
    } else if (e.key === 'Backspace' && !stackDraft && stack.length > 0) {
      saveStack(stack.slice(0, -1));
    }
  }

  function changeStatus(status: ProjectStatus) {
    if (status !== project.status) save({ status });
  }

  // Leave first: the optimistic removal would otherwise flash this page's
  // not-found state. The pool shares the provider, so a failed delete shows there.
  function handleDelete() {
    if (!deleteTap.confirm()) return;
    setDeleting(true);
    router.push(`/projects/${slugForStatus(project.status)}`);
    void deleteProject(project.id);
  }

  return (
    <div className={styles.overview}>
      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.section}>
        <div className={styles.label}>Status</div>
        <div className={styles.segmented} role="group" aria-label="Status">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={project.status === status}
              className={[styles.segment, project.status === status ? styles.segmentActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => changeStatus(status)}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <label className={styles.label} htmlFor="overview-pitch">
          Pitch
        </label>
        <input
          id="overview-pitch"
          className={styles.input}
          placeholder="One line on what it is"
          maxLength={200}
          value={drafts.pitch}
          onChange={(e) => editDraft('pitch', e.target.value)}
          onBlur={() => saveText('pitch')}
        />
      </section>

      <section className={styles.section}>
        <label className={styles.label} htmlFor="overview-description">
          Description
        </label>
        <textarea
          id="overview-description"
          className={styles.textarea}
          placeholder={dictation.listening ? 'Listening…' : "What it is, why it matters, where it's going"}
          rows={6}
          value={dictation.liveText}
          onChange={(e) => editDraft('description', e.target.value)}
          onBlur={() => saveText('description')}
          readOnly={dictation.listening}
        />
        <div className={styles.voiceRow}>
          <DictationControls dictation={dictation} hint="Talk it through; it's added to the end" />
        </div>
        {dictation.error && <p className={styles.voiceError}>{dictation.error}</p>}
      </section>

      <section className={styles.section}>
        <div className={styles.label}>Links</div>
        {URL_FIELDS.map(({ key, label, placeholder }) => {
          const value = drafts[key].trim();
          return (
            <div key={key} className={styles.linkRow}>
              <label className={styles.linkLabel} htmlFor={`overview-${key}`}>
                {label}
              </label>
              <div className={styles.linkField}>
                <input
                  id={`overview-${key}`}
                  type="url"
                  inputMode="url"
                  className={styles.input}
                  placeholder={placeholder}
                  maxLength={500}
                  value={drafts[key]}
                  onChange={(e) => editDraft(key, e.target.value)}
                  onBlur={() => saveUrl(key)}
                  aria-invalid={urlErrors[key] ? true : undefined}
                />
                {isWebUrl(value) && (
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.linkOpen}
                    aria-label={`Open ${label.toLowerCase()} in a new tab`}
                    title="Open in a new tab"
                  >
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                  </a>
                )}
              </div>
              {urlErrors[key] && <p className={styles.fieldError}>{urlErrors[key]}</p>}
            </div>
          );
        })}
      </section>

      <section className={styles.section}>
        <label className={styles.label} htmlFor="overview-stack">
          Tech stack
        </label>
        <div className={styles.chipField}>
          {stack.map((tech) => (
            <span key={tech} className={styles.chip}>
              {tech}
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => saveStack(stack.filter((t) => t !== tech))}
                aria-label={`Remove ${tech}`}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </span>
          ))}
          <input
            id="overview-stack"
            className={styles.chipInput}
            placeholder={
              stack.length === 0 ? 'Add a technology' : stack.length >= MAX_TECH_STACK ? `${MAX_TECH_STACK} max` : ''
            }
            value={stackDraft}
            onChange={(e) => setStackDraft(e.target.value)}
            onKeyDown={handleStackKeyDown}
            onBlur={commitStack}
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.label}>Timeline</div>
        <div className={styles.dates}>
          <div className={styles.dateCell}>
            <span className={styles.dateLabel}>Started</span>
            <span className={styles.dateValue}>{project.startedOn ? formatDay(project.startedOn) : '—'}</span>
          </div>
          <div className={styles.dateCell}>
            <span className={styles.dateLabel}>Finished</span>
            <span className={styles.dateValue}>{project.finishedOn ? formatDay(project.finishedOn) : '—'}</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.label}>Progress</div>
        <div className={styles.card}>
          <div className={styles.progressHead}>
            <span>
              {progress.total === 0
                ? 'No items on the board yet'
                : `${progress.done} of ${progress.total} done`}
            </span>
            {progress.total > 0 && (
              <span className={styles.progressPct}>{Math.round(progress.ratio * 100)}%</span>
            )}
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label="Items done"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div className={styles.barFill} style={{ width: `${progress.ratio * 100}%` }} />
          </div>
          <div className={styles.stages}>
            {STAGES.map((stage) => (
              <div key={stage} className={styles.stage}>
                <span className={styles.stageLabel}>{STAGE_LABELS[stage]}</span>
                <span className={styles.stageCount}>{counts[stage]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.footer}>
        <button
          type="button"
          className={[styles.deleteBtn, deleteTap.armed ? styles.deleteBtnArmed : ''].filter(Boolean).join(' ')}
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleteTap.armed ? 'Tap again to delete' : 'Delete project'}
        </button>
      </div>
    </div>
  );
}
