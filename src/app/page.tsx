'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/lib/app-context';
import { isSameDay, formatDate, formatTimeLabel } from '@/lib/date';
import type { Task } from '@/lib/types';
import styles from './page.module.css';
import { getNowId } from '@/lib/helpers';


// ── Timeline Row ───────────────────────────────────────────────────────────

type RowProps = {
  task: Task;
  timeLabel: string;
  now?: boolean;
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
};

function TimelineRow({ task, timeLabel, now, onToggle, onEdit }: RowProps) {
  const done = Boolean(task.completedAt);

  const rowClass = [styles.row, now ? styles.rowNow : ''].filter(Boolean).join(' ');
  const dotClass = [
    styles.dot,
    done ? styles.dotDone : now ? styles.dotNow : styles.dotOpen,
  ].join(' ');
  const titleClass = [
    styles.title,
    done ? styles.titleDone : now ? styles.titleNow : '',
  ].filter(Boolean).join(' ');
  const timeClass = [
    styles.time,
    now && !done ? styles.timeNow : styles.timeMuted,
  ].join(' ');

  function handleRowClick() {
    onEdit(task);
  }

  function handleDotClick(e: MouseEvent) {
    e.stopPropagation();
    onToggle(task.id);
  }

  return (
    <div className={rowClass} onClick={handleRowClick}>
      <div className={timeClass}>{timeLabel}</div>
      <div className={dotClass} onClick={handleDotClick} role="checkbox" aria-checked={done}>
        {done && (
          <span className={styles.checkIcon}>
            <FontAwesomeIcon icon={faCheck} />
          </span>
        )}
      </div>
      <div className={titleClass}>{task.title}</div>
      <div className={styles.indicators}>
        {now && !done && <span className={styles.nowBadge}>NOW</span>}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Home() {
  const { tasks, loading, error, toggleComplete, openEdit } = useApp();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Partition into today's scheduled tasks and unscheduled (persistent)
  const scheduled = tasks.filter((t) => t.scheduledAt && isSameDay(t.scheduledAt, now));
  const unscheduled = tasks.filter(
    (t) => !t.scheduledAt && (!t.completedAt || isSameDay(t.completedAt, now)),
  );

  // Sort scheduled: incomplete first by time, done last
  const sortedScheduled = [
    ...scheduled.filter((t) => !t.completedAt).sort(
      (a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
    ),
    ...scheduled.filter((t) => t.completedAt).sort(
      (a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
    ),
  ];

  const nowId = getNowId(scheduled, now);

  // Header counts
  const allVisible = [...unscheduled, ...scheduled];
  const doneCount = allVisible.filter((t) => t.completedAt).length;
  const totalTasks = allVisible.length;

  return (
    <div className={styles.page}>
      <div className={styles.glow} />

      <header className={styles.header}>
        <div className={styles.eyebrow}>Today</div>
        <h1 className={styles.dateDisplay}>{formatDate(now)}</h1>
        <div className={styles.meta}>
          {totalTasks} tasks ·{' '}
          <span className={styles.doneCount}>{doneCount} done</span>
        </div>
      </header>

      {error && <div className={styles.empty}>{error}</div>}

      {unscheduled.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Unscheduled</div>
          <div>
            {unscheduled.map((task) => (
              <TimelineRow
                key={task.id}
                task={task}
                timeLabel="—"
                onToggle={toggleComplete}
                onEdit={openEdit}
              />
            ))}
          </div>
        </section>
      )}

      {sortedScheduled.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Schedule</div>
          <div className={styles.timeline}>
            <div className={styles.timelineRule} />
            {sortedScheduled.map((task) => (
              <TimelineRow
                key={task.id}
                task={task}
                timeLabel={formatTimeLabel(task.scheduledAt!)}
                now={task.id === nowId}
                onToggle={toggleComplete}
                onEdit={openEdit}
              />
            ))}
          </div>
        </section>
      )}

      {totalTasks === 0 && !error && (
        <div className={styles.empty}>
          {loading ? 'Loading…' : 'Nothing scheduled. Add a task to get started.'}
        </div>
      )}
    </div>
  );
}
