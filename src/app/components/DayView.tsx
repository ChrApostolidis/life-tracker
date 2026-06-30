'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/lib/app-context';
import { isSameDay, formatDate, formatTimeLabel, startOfDay, addDays } from '@/lib/date';
import type { Task } from '@/lib/types';
import { getNowId } from '@/lib/helpers';
import styles from './dayView.module.css';

// ── Timeline Row ───────────────────────────────────────────────────────────

type RowProps = {
  task: Task;
  timeLabel: string;
  now?: boolean;
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
};

function TimelineRow({ task, timeLabel, now, onToggle, onEdit, onDelete }: RowProps) {
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

  function handleDotClick(e: MouseEvent) {
    e.stopPropagation();
    onToggle(task.id);
  }

  function handleDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    onDelete(task.id);
  }

  return (
    <div className={rowClass} onClick={() => onEdit(task)}>
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
        <button
          type="button"
          className={styles.deleteRowBtn}
          onClick={handleDeleteClick}
          aria-label="Delete task"
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>
    </div>
  );
}

// ── Day View ─────────────────────────────────────────────────────────────────

const byScheduledAsc = (a: Task, b: Task) =>
  new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime();

export default function DayView({ date }: { date: Date }) {
  const { tasks, loading, error, toggleComplete, openEdit, openCapture, deleteTask, setRange } =
    useApp();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Load this day's window into the shared context.
  useEffect(() => {
    setRange(startOfDay(date).toISOString(), startOfDay(addDays(date, 1)).toISOString());
  }, [date, setRange]);

  const isToday = startOfDay(date).getTime() === startOfDay(now).getTime();

  const scheduled = tasks.filter((t) => t.scheduledAt && isSameDay(t.scheduledAt, date));
  // The inbox isn't date-bound, so only surface it on today's view.
  const unscheduled = isToday
    ? tasks.filter((t) => !t.scheduledAt && (!t.completedAt || isSameDay(t.completedAt, now)))
    : [];

  // Incomplete first by time, completed last.
  const sortedScheduled = [
    ...scheduled.filter((t) => !t.completedAt).sort(byScheduledAsc),
    ...scheduled.filter((t) => t.completedAt).sort(byScheduledAsc),
  ];

  const nowId = isToday ? getNowId(scheduled, now) : null;

  const allVisible = [...unscheduled, ...scheduled];
  const doneCount = allVisible.filter((t) => t.completedAt).length;
  const totalTasks = allVisible.length;

  const eyebrow = isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div className={styles.page}>
      <div className={styles.glow} />

      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>{eyebrow}</div>
          <h1 className={styles.dateDisplay}>{formatDate(date)}</h1>
          <div className={styles.meta}>
            {totalTasks} tasks · <span className={styles.doneCount}>{doneCount} done</span>
          </div>
        </div>
        <button className={styles.addBtn} onClick={() => openCapture(date)} type="button">
          <FontAwesomeIcon icon={faPlus} />
          <span>Add task</span>
        </button>
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
                onDelete={deleteTask}
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
                onDelete={deleteTask}
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
