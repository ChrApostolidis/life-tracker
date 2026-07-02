'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/lib/app-context';
import {
  startOfWeek,
  startOfDay,
  addDays,
  isSameDay,
  toDateInput,
  formatWeekRange,
} from '@/lib/date';
import { getNowId } from '@/lib/helpers';
import PeriodNav from '@/app/components/PeriodNav';
import type { Task } from '@/lib/types';
import styles from './week.module.css';

// ── Task pill ────────────────────────────────────────────────────────────────

type PillProps = {
  task: Task;
  now: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
};

function TaskPill({ task, now, onEdit, onDelete }: PillProps) {
  const done = Boolean(task.completedAt);
  const cls = [styles.pill, done ? styles.pillDone : '', now ? styles.pillNow : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      onClick={(e) => {
        e.stopPropagation();
        onEdit(task);
      }}
    >
      <span className={styles.pillTitle}>{task.title}</span>
      <button
        type="button"
        className={styles.pillDelete}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onDelete(task.id);
        }}
        aria-label="Delete task"
      >
        <FontAwesomeIcon icon={faTrash} />
      </button>
    </div>
  );
}

// ── Week page ──────────────────────────────────────────────────────────────

const byScheduledAsc = (a: Task, b: Task) =>
  new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime();

export default function WeekPage() {
  const { tasks, loading, error, openEdit, deleteTask, setRange } = useApp();
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  // Which week is on screen — navigable, independent of the "now" ticker.
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = weekStart.toISOString();
  const to = addDays(weekStart, 7).toISOString();

  // Load the whole week's window into the shared context.
  useEffect(() => {
    setRange(from, to);
  }, [from, to, setRange]);

  // "Now" highlight applies only within today's tasks.
  const todayScheduled = tasks.filter((t) => t.scheduledAt && isSameDay(t.scheduledAt, now));
  const nowId = getNowId(todayScheduled, now);

  function dayTasks(day: Date): Task[] {
    const scheduled = tasks.filter((t) => t.scheduledAt && isSameDay(t.scheduledAt, day));
    return [
      ...scheduled.filter((t) => !t.completedAt).sort(byScheduledAsc),
      ...scheduled.filter((t) => t.completedAt).sort(byScheduledAsc),
    ];
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Week</div>
          <h1 className={styles.rangeLabel}>{formatWeekRange(weekStart)}</h1>
        </div>
        <PeriodNav
          onPrev={() => setWeekStart((w) => addDays(w, -7))}
          onToday={() => setWeekStart(startOfWeek(new Date()))}
          onNext={() => setWeekStart((w) => addDays(w, 7))}
        />
      </header>

      {error && <div className={styles.message}>{error}</div>}
      {!error && loading && tasks.length === 0 && <div className={styles.message}>Loading…</div>}

      <div className={styles.grid}>
        {days.map((day) => {
          const isToday = startOfDay(day).getTime() === startOfDay(now).getTime();
          const columnClass = [styles.column, isToday ? styles.columnToday : '']
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={day.toISOString()}
              className={columnClass}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/day/${toDateInput(day)}`)}
            >
              <div className={styles.columnHeader}>
                <span className={styles.weekday}>
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className={styles.dayNumber}>{day.getDate()}</span>
              </div>
              <div className={styles.pills}>
                {dayTasks(day).map((task) => (
                  <TaskPill
                    key={task.id}
                    task={task}
                    now={isToday && task.id === nowId}
                    onEdit={openEdit}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
