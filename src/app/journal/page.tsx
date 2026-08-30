'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faPenNib, faStar, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useJournal } from '@/lib/journal-context';
import { useSpeechRecognition } from '@/lib/use-speech-recognition';
import { fromDateInput, toDateInput } from '@/lib/date';
import { parseTags, serializeTags, type DayNote, type JournalEntry } from '@/lib/types';
import Skeleton, { SkeletonBlock } from '../components/Skeleton';
import styles from './journal.module.css';

const SKELETON_ROWS = 6;

type VoiceLang = 'el-GR' | 'en-US';
// Shared with CaptureModal so the language choice follows you across surfaces.
const VOICE_LANG_KEY = 'lt-voice-lang';

// One timeline over two different tables, so rows carry their source with them.
type Row =
  | { kind: 'daily'; date: string; sortKey: string; note: DayNote }
  | { kind: 'entry'; date: string; sortKey: string; entry: JournalEntry };

type Filter = 'all' | 'daily' | 'entries';

function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

function monthLabel(monthKey: string): string {
  return fromDateInput(`${monthKey}-01`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function dayLabel(date: string): string {
  return fromDateInput(date).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// Untitled entries show their opening line instead, so the timeline never has
// a row with no visible label.
function firstLine(body: string): string {
  return body.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
}

export default function JournalPage() {
  const { entries, dayNotes, loading, error, addEntry, updateEntry, deleteEntry } = useJournal();

  const [filter, setFilter] = useState<Filter>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Composer ──
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [draftDate, setDraftDate] = useState(() => toDateInput(new Date()));

  // ── Voice capture (speech-to-text only; no audio is recorded or stored) ──
  const speech = useSpeechRecognition();
  const [voiceLang, setVoiceLang] = useState<VoiceLang>('el-GR');
  // The body as it stood when recording began. Dictation *appends* to it rather
  // than replacing, unlike quick capture — a journal entry is usually built up
  // in passes, typing some and speaking some. State rather than a ref because
  // the live preview renders from it.
  const [bodyBeforeVoice, setBodyBeforeVoice] = useState('');
  // Non-null once anything has been dictated into this draft, so the original
  // transcript can be saved alongside the edited text.
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(VOICE_LANG_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === 'el-GR' || stored === 'en-US') setVoiceLang(stored);
  }, []);

  function toggleVoiceLang() {
    const next: VoiceLang = voiceLang === 'el-GR' ? 'en-US' : 'el-GR';
    setVoiceLang(next);
    window.localStorage.setItem(VOICE_LANG_KEY, next);
  }

  function toggleRecording() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    setBodyBeforeVoice(draftBody);
    speech.reset();
    speech.start(voiceLang);
  }

  // Recording ended (mic tapped again, or auto-stop on silence): fold the
  // transcript into the body so it can be edited like anything else.
  useEffect(() => {
    if (speech.listening || !speech.transcript) return;
    const spoken = speech.transcript.trim();
    if (!spoken) return;
    // Syncing from an external system (the Web Speech API), which is what an
    // effect is for. The hook surfaces its result as state rather than a
    // callback, and stop() returns before the final result flushes, so the
    // commit cannot happen in the click handler.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftBody(bodyBeforeVoice ? `${bodyBeforeVoice.trimEnd()} ${spoken}` : spoken);
    setVoiceTranscript((prev) => (prev ? `${prev} ${spoken}` : spoken));
  }, [speech.listening, speech.transcript, bodyBeforeVoice]);

  // While recording, show what has been heard so far appended to the body.
  const liveBody = speech.listening
    ? [bodyBeforeVoice, speech.transcript, speech.interimTranscript]
        .filter(Boolean)
        .join(' ')
    : draftBody;

  function resetComposer() {
    setDraftTitle('');
    setDraftBody('');
    setDraftTags([]);
    setTagDraft('');
    setDraftDate(toDateInput(new Date()));
    setVoiceTranscript(null);
    speech.reset();
    setComposerOpen(false);
  }

  function commitTag() {
    const tag = tagDraft.trim();
    if (!tag) return;
    setDraftTags((prev) => parseTags(serializeTags([...prev, tag])));
    setTagDraft('');
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag();
    } else if (e.key === 'Backspace' && !tagDraft) {
      setDraftTags((prev) => prev.slice(0, -1));
    }
  }

  function handleSave() {
    if (speech.listening) return; // saving mid-dictation would drop the tail
    const body = draftBody.trim();
    if (!body) return;
    // A tag half-typed when Save is pressed should still count.
    const tags = serializeTags(tagDraft.trim() ? [...draftTags, tagDraft.trim()] : draftTags);
    void addEntry({
      title: draftTitle.trim() || null,
      body,
      tags,
      entryDate: draftDate,
      source: voiceTranscript ? 'voice' : 'text',
      rawTranscript: voiceTranscript,
    });
    resetComposer();
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  // ── Timeline ──
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((entry) =>
      parseTags(entry.tags).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)),
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out: Row[] = [];

    if (filter !== 'entries' && !activeTag) {
      dayNotes.forEach((note) => {
        if (needle && !note.body.toLowerCase().includes(needle)) return;
        out.push({ kind: 'daily', date: note.entryDate, sortKey: `${note.entryDate}-0`, note });
      });
    }

    if (filter !== 'daily') {
      entries.forEach((entry) => {
        if (activeTag && !parseTags(entry.tags).includes(activeTag)) return;
        if (
          needle &&
          !entry.body.toLowerCase().includes(needle) &&
          !(entry.title ?? '').toLowerCase().includes(needle)
        ) {
          return;
        }
        out.push({ kind: 'entry', date: entry.entryDate, sortKey: `${entry.entryDate}-1`, entry });
      });
    }

    // Newest first. Within a day, long-form entries sit under the daily log.
    return out.sort((a, b) => (a.sortKey === b.sortKey ? 0 : a.sortKey < b.sortKey ? 1 : -1));
  }, [entries, dayNotes, filter, activeTag, query]);

  // Month headers are derived from the rows rather than the calendar, so a
  // month with nothing in it never renders an empty heading.
  const months = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((row) => {
      const key = monthKeyOf(row.date);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    return [...seen.entries()];
  }, [rows]);

  const showSkeleton = loading && entries.length === 0 && dayNotes.length === 0 && !error;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Journal</div>
        <h1 className={styles.title}>Everything written down</h1>
        <div className={styles.meta}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {dayNotes.length} daily{' '}
          {dayNotes.length === 1 ? 'log' : 'logs'}
        </div>
      </header>

      {/* Collapsed to one line until focused, so the timeline stays the page. */}
      <div className={styles.composer}>
        {!composerOpen ? (
          <button type="button" className={styles.composerTrigger} onClick={() => setComposerOpen(true)}>
            Write an entry
          </button>
        ) : (
          <>
            <input
              className={styles.composerTitle}
              placeholder="Title (optional)"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              autoFocus
            />
            <textarea
              className={styles.composerBody}
              placeholder={speech.listening ? 'Listening…' : "What's on your mind?"}
              value={liveBody}
              onChange={(e) => setDraftBody(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              readOnly={speech.listening}
              rows={6}
            />
            <div className={styles.composerRow}>
              <div className={styles.tagField}>
                {draftTags.map((tag) => (
                  <span key={tag} className={styles.tagChip}>
                    {tag}
                    <button
                      type="button"
                      className={styles.tagRemove}
                      onClick={() => setDraftTags((prev) => prev.filter((t) => t !== tag))}
                      aria-label={`Remove tag ${tag}`}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </span>
                ))}
                <input
                  className={styles.tagInput}
                  placeholder={draftTags.length === 0 ? 'Tags' : ''}
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={commitTag}
                />
              </div>
              <input
                type="date"
                className={styles.composerDate}
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
            </div>
            {speech.error && <div className={styles.voiceError}>{speech.error}</div>}

            <div className={styles.composerActions}>
              <button
                type="button"
                className={[styles.micBtn, speech.listening ? styles.micBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={toggleRecording}
                disabled={!speech.supported}
                title={
                  speech.supported
                    ? speech.listening
                      ? 'Stop recording'
                      : 'Dictate into this entry'
                    : 'Voice capture needs Chrome or Edge on a secure connection'
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
              <div className={styles.actionsSpacer} />
              <button type="button" className={styles.ghostBtn} onClick={resetComposer}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={!draftBody.trim() || speech.listening}
              >
                Save
              </button>
            </div>
          </>
        )}
      </div>

      {error && <div className={styles.message}>{error}</div>}

      <div className={styles.filterRow}>
        {(['all', 'daily', 'entries'] as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            className={[styles.filterPill, filter === key && !activeTag ? styles.filterPillActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              setFilter(key);
              setActiveTag(null);
            }}
          >
            {key === 'all' ? 'All' : key === 'daily' ? 'Daily' : 'Entries'}
          </button>
        ))}
        {allTags.map(([tag, count]) => (
          <button
            key={tag}
            type="button"
            className={[styles.filterPill, activeTag === tag ? styles.filterPillActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              setActiveTag(activeTag === tag ? null : tag);
              setFilter('entries');
            }}
          >
            {tag} <span className={styles.filterCount}>{count}</span>
          </button>
        ))}
      </div>

      <input
        className={styles.search}
        placeholder="Search what you've written"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className={styles.body}>
        <div className={styles.timeline}>
          {showSkeleton ? (
            <SkeletonBlock className={styles.card} label="Loading journal">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} className={styles.row}>
                  <Skeleton height={11} width={90} radius={4} />
                  <Skeleton height={14} width={`${75 - (i % 3) * 15}%`} radius={4} />
                </div>
              ))}
            </SkeletonBlock>
          ) : rows.length === 0 ? (
            <div className={styles.empty}>
              <FontAwesomeIcon icon={faPenNib} className={styles.emptyIcon} />
              <p>
                {entries.length + dayNotes.length === 0
                  ? 'Nothing written yet. The first entry is the hard one.'
                  : 'Nothing matches that.'}
              </p>
            </div>
          ) : (
            months.map(([monthKey]) => (
              <section key={monthKey} className={styles.month}>
                <h2 id={`month-${monthKey}`} className={styles.monthHeader}>
                  {monthLabel(monthKey)}
                </h2>
                <div className={styles.card}>
                  {rows
                    .filter((row) => monthKeyOf(row.date) === monthKey)
                    .map((row) =>
                      row.kind === 'daily' ? (
                        // Editing a daily log belongs to DayJournal on the day
                        // page — there is only ever one editor for these.
                        <Link
                          key={`daily-${row.note.id}`}
                          href={`/day/${row.date}`}
                          className={styles.row}
                        >
                          <div className={styles.rowHead}>
                            <span className={styles.rowDate}>{dayLabel(row.date)}</span>
                            <span className={styles.rowKind}>Daily</span>
                            {row.note.rating != null && (
                              <span className={styles.stars}>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <FontAwesomeIcon
                                    key={n}
                                    icon={faStar}
                                    className={n <= row.note.rating! ? styles.starFilled : styles.starEmpty}
                                  />
                                ))}
                              </span>
                            )}
                          </div>
                          <div className={styles.rowBody}>{row.note.body}</div>
                        </Link>
                      ) : (
                        <EntryRow
                          key={`entry-${row.entry.id}`}
                          entry={row.entry}
                          expanded={expandedId === row.entry.id}
                          onToggle={() =>
                            setExpandedId(expandedId === row.entry.id ? null : row.entry.id)
                          }
                          onDelete={() => void deleteEntry(row.entry.id)}
                          onSaveBody={(body) => void updateEntry(row.entry.id, { body })}
                        />
                      ),
                    )}
                </div>
              </section>
            ))
          )}
        </div>

        {months.length > 1 && (
          <nav className={styles.jumper} aria-label="Jump to month">
            {months.map(([monthKey, count]) => (
              <a key={monthKey} href={`#month-${monthKey}`} className={styles.jumperLink}>
                {monthLabel(monthKey)} <span className={styles.jumperCount}>{count}</span>
              </a>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

// ── Long-form row ──

function EntryRow({
  entry,
  expanded,
  onToggle,
  onDelete,
  onSaveBody,
}: {
  entry: JournalEntry;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSaveBody: (body: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const tags = parseTags(entry.tags);

  function save() {
    const body = draft.trim();
    // Blank is a 400 server-side, so treat it as "abandon the edit" rather than
    // firing a request that can only fail.
    if (body && body !== entry.body) onSaveBody(body);
    setEditing(false);
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.rowDate}>{dayLabel(entry.entryDate)}</span>
        <span className={styles.rowKind}>Entry</span>
        {tags.map((tag) => (
          <span key={tag} className={styles.rowTag}>
            {tag}
          </span>
        ))}
        <button
          type="button"
          className={styles.rowDelete}
          onClick={onDelete}
          aria-label="Delete entry"
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>

      <button type="button" className={styles.rowTitle} onClick={onToggle}>
        {entry.title ?? firstLine(entry.body)}
      </button>

      {!expanded && <div className={styles.rowBody}>{entry.body}</div>}

      {expanded &&
        (editing ? (
          <>
            <textarea
              className={styles.editBody}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              autoFocus
            />
            <div className={styles.rowActions}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => {
                  setDraft(entry.body);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button type="button" className={styles.saveBtn} onClick={save}>
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.rowFull}>{entry.body}</div>
            <div className={styles.rowActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => setEditing(true)}>
                Edit
              </button>
            </div>
          </>
        ))}
    </div>
  );
}
