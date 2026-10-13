'use client';

import { useEffect, useRef, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { addDays, combineDateTime, formatTimeLabel, toDateInput } from '@/lib/date';
import type { SleepLog } from '@/lib/types';
import Skeleton, { SkeletonBlock } from './Skeleton';
import TimePicker, { TimeTrigger } from './TimePicker';
import styles from './sleepCard.module.css';

const STRIP_DAYS = 7;
// Bars scale against this many hours; a longer night just fills the column.
const STRIP_MAX_HOURS = 10;
const DEFAULT_BED = '23:00';
const DEFAULT_WAKE = '07:00';
const PICKER_ID = 'sleep-time-picker';

type TimeField = 'bed' | 'wake';

// Home's sleep widget. State lives here rather than in a provider: Home is the
// only surface that reads or writes sleep, the same reasoning as DayJournal.
// className carries Home's grid placement, which the card shouldn't know about.
export default function SleepCard({ className }: { className?: string }) {
  const today = new Date();
  const todayKey = toDateInput(today);
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i - (STRIP_DAYS - 1)));

  // null = still loading.
  const [logs, setLogs] = useState<SleepLog[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bed, setBed] = useState(DEFAULT_BED);
  const [wake, setWake] = useState(DEFAULT_WAKE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openField, setOpenField] = useState<TimeField | null>(null);
  const bedRef = useRef<HTMLButtonElement>(null);
  const wakeRef = useRef<HTMLButtonElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  // Lifted above the cards after it while the picker floats over them.
  const cardClass = [styles.card, openField ? styles.cardRaised : '', className].filter(Boolean).join(' ');

  useEffect(() => {
    let cancelled = false;
    api
      .listSleepLogs(toDateInput(days[0]), toDateInput(addDays(today, 1)))
      .then((result) => {
        if (cancelled) return;
        setLogs(result);
        // Prefill from the latest night — bedtimes are habitual, so it's
        // usually right or a minute's nudge away.
        const latest = result[result.length - 1];
        if (latest) {
          setBed(formatTimeLabel(latest.bedAt));
          setWake(formatTimeLabel(latest.wokeAt));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
    // Fetch once per mount; Home re-mounts on every visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A click anywhere outside the fields row (triggers included) closes the picker.
  useEffect(() => {
    if (!openField) return;
    function handlePointerDown(e: PointerEvent) {
      if (!fieldsRef.current?.contains(e.target as Node)) setOpenField(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openField]);

  if (loadError) {
    return (
      <div className={cardClass}>
        <div className={styles.header}>
          <span className={styles.label}>Sleep</span>
        </div>
        <div className={styles.muted}>Couldn&rsquo;t load sleep.</div>
      </div>
    );
  }

  if (logs === null) {
    return (
      <SkeletonBlock className={cardClass} label="Loading sleep">
        <div className={styles.header}>
          <Skeleton height={11} width={44} radius={4} />
        </div>
        <Skeleton height={20} width="55%" radius={4} />
        <div className={styles.strip}>
          {days.map((d) => (
            <div key={d.toISOString()} className={styles.stripDay}>
              <div className={styles.barTrack} />
              <Skeleton height={10} width={10} radius={4} />
            </div>
          ))}
        </div>
      </SkeletonBlock>
    );
  }

  const byDate = new Map(logs.map((l) => [l.sleepDate, l]));
  const todayLog = byDate.get(todayKey);
  const showForm = !todayLog || editing;
  const weekMinutes = logs.map(minutesSlept);
  const avgMinutes = weekMinutes.length
    ? Math.round(weekMinutes.reduce((a, b) => a + b, 0) / weekMinutes.length)
    : 0;

  function startEdit() {
    if (todayLog) {
      setBed(formatTimeLabel(todayLog.bedAt));
      setWake(formatTimeLabel(todayLog.wokeAt));
    }
    setSaveError(null);
    setEditing(true);
  }

  // Optimistic: the night shows straight away and rolls back if the save fails.
  async function save() {
    const night = nightInstants(todayKey, bed, wake);
    if (!night) {
      setSaveError('Enter both times.');
      return;
    }
    const previous = logs!;
    const now = new Date().toISOString();
    const provisional: SleepLog = {
      id: todayLog?.id ?? `pending-${todayKey}`,
      sleepDate: todayKey,
      ...night,
      deletedAt: null,
      createdAt: todayLog?.createdAt ?? now,
      updatedAt: now,
    };
    setLogs(upsert(previous, provisional));
    setEditing(false);
    setOpenField(null);
    setSaveError(null);
    try {
      const saved = await api.saveSleepLog(todayKey, night);
      setLogs((current) => upsert(current ?? [], saved));
    } catch (e) {
      setLogs(previous);
      setEditing(true);
      setSaveError(describeError(e, 'Couldn’t save sleep'));
    }
  }

  function togglePicker(field: TimeField) {
    setOpenField((current) => (current === field ? null : field));
  }

  // Hands focus back to the field the panel belonged to.
  function closePicker() {
    (openField === 'bed' ? bedRef : wakeRef).current?.focus();
    setOpenField(null);
  }

  async function remove() {
    const previous = logs!;
    setLogs(previous.filter((l) => l.sleepDate !== todayKey));
    setEditing(false);
    try {
      await api.removeSleepLog(todayKey);
    } catch (e) {
      setLogs(previous);
      setSaveError(describeError(e, 'Couldn’t remove sleep'));
    }
  }

  return (
    <div className={cardClass}>
      <div className={styles.header}>
        <span className={styles.label}>Sleep</span>
        {todayLog && !editing && (
          <button type="button" className={styles.linkButton} onClick={startEdit}>
            edit
          </button>
        )}
      </div>

      {showForm ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className={styles.prompt}>How did you sleep?</div>
          <div ref={fieldsRef} className={styles.fields}>
            <TimeTrigger
              label="Bed"
              value={bed}
              open={openField === 'bed'}
              panelId={PICKER_ID}
              buttonRef={bedRef}
              onToggle={() => togglePicker('bed')}
              onChange={setBed}
            />
            <TimeTrigger
              label="Woke"
              value={wake}
              open={openField === 'wake'}
              panelId={PICKER_ID}
              buttonRef={wakeRef}
              onToggle={() => togglePicker('wake')}
              onChange={setWake}
            />
            <button type="submit" className={styles.saveButton}>
              Save
            </button>
            {openField && (
              <TimePicker
                key={openField}
                id={PICKER_ID}
                label={openField === 'bed' ? 'Bed' : 'Woke'}
                value={openField === 'bed' ? bed : wake}
                onChange={openField === 'bed' ? setBed : setWake}
                onDone={closePicker}
              />
            )}
          </div>
          {saveError && <div className={styles.error}>{saveError}</div>}
          {editing && (
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  setEditing(false);
                  setOpenField(null);
                }}
              >
                cancel
              </button>
              <button type="button" className={styles.linkButton} onClick={() => void remove()}>
                remove
              </button>
            </div>
          )}
        </form>
      ) : (
        <div className={styles.summary}>
          <span className={styles.hours}>{formatDuration(minutesSlept(todayLog!))}</span>
          <span className={styles.range}>
            {formatTimeLabel(todayLog!.bedAt)} → {formatTimeLabel(todayLog!.wokeAt)}
          </span>
        </div>
      )}

      {!showForm && saveError && <div className={styles.error}>{saveError}</div>}

      {logs.length > 0 && (
        <>
          <div className={styles.strip} role="list" aria-label="Last 7 nights">
            {days.map((d) => {
              const key = toDateInput(d);
              const log = byDate.get(key);
              const minutes = log ? minutesSlept(log) : 0;
              const pct = Math.min(100, (minutes / 60 / STRIP_MAX_HOURS) * 100);
              const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
              const description = log ? `${weekday} · ${formatDuration(minutes)}` : `${weekday} · not logged`;
              return (
                <div key={key} className={styles.stripDay} role="listitem" title={description} aria-label={description}>
                  <div className={styles.barTrack}>
                    {log ? (
                      <div className={styles.bar} style={{ height: `${pct}%` }} />
                    ) : (
                      <div className={styles.barEmpty} />
                    )}
                  </div>
                  <span className={key === todayKey ? styles.dayLabelToday : styles.dayLabel}>
                    {weekday.charAt(0)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className={styles.footer}>
            avg {formatDuration(avgMinutes)} · {logs.length} of {STRIP_DAYS} nights
          </div>
        </>
      )}
    </div>
  );
}

// A bedtime later in the clock than the wake time (23:40 vs 07:00) means the
// night before; an earlier one (00:30) is the same morning.
function nightInstants(dateKey: string, bed: string, wake: string): { bedAt: string; wokeAt: string } | null {
  const bedDateKey = bed >= wake ? toDateInput(addDays(new Date(`${dateKey}T00:00:00`), -1)) : dateKey;
  const bedAt = combineDateTime(bedDateKey, bed);
  const wokeAt = combineDateTime(dateKey, wake);
  return bedAt && wokeAt ? { bedAt, wokeAt } : null;
}

function minutesSlept(log: SleepLog): number {
  return Math.round((new Date(log.wokeAt).getTime() - new Date(log.bedAt).getTime()) / 60_000);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function upsert(logs: SleepLog[], log: SleepLog): SleepLog[] {
  return [...logs.filter((l) => l.sleepDate !== log.sleepDate), log].sort((a, b) =>
    a.sleepDate.localeCompare(b.sleepDate),
  );
}
