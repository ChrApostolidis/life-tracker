'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import {
  addDays,
  addMonths,
  formatMonthYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateInput,
} from '@/lib/date';
import PeriodNav from '@/app/components/PeriodNav';
import type { Task } from '@/lib/types';
import styles from './month.module.css';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GRID_DAYS = 42; // 6 rows × 7 columns
const MAX_LINES = 3;

const byScheduledAsc = (a: Task, b: Task) =>
  new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime();

export default function MonthPage() {
  const { tasks, loading, error, openEdit, setRange } = useApp();
  const router = useRouter();
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));

  // The visible grid always starts on the Monday on/before the 1st, so the
  // fetch window covers the dimmed outside-month days too.
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: GRID_DAYS }, (_, i) => addDays(gridStart, i));

  const from = gridStart.toISOString();
  const to = addDays(gridStart, GRID_DAYS).toISOString();

  useEffect(() => {
    setRange(from, to);
  }, [from, to, setRange]);

  // Bucket tasks per local day, incomplete first by time, completed last —
  // same ordering as the Day and Week views.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks
      .filter((t) => t.scheduledAt)
      .sort(byScheduledAsc)
      .forEach((t) => {
        const key = toDateInput(new Date(t.scheduledAt!));
        map.set(key, [...(map.get(key) ?? []), t]);
      });
    map.forEach((list, key) =>
      map.set(key, [...list.filter((t) => !t.completedAt), ...list.filter((t) => t.completedAt)]),
    );
    return map;
  }, [tasks]);

  const now = new Date();
  const todayTime = startOfDay(now).getTime();

  function lineClass(task: Task): string {
    if (task.completedAt) return `${styles.taskLine} ${styles.taskLineDone}`;
    if (new Date(task.scheduledAt!) < now) return `${styles.taskLine} ${styles.taskLineOverdue}`;
    return styles.taskLine;
  }

  function handleLineClick(e: MouseEvent, task: Task) {
    e.stopPropagation();
    openEdit(task);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Month</div>
          <h1 className={styles.titleLabel}>{formatMonthYear(monthStart)}</h1>
        </div>
        <PeriodNav
          onPrev={() => setMonthStart((m) => addMonths(m, -1))}
          onToday={() => setMonthStart(startOfMonth(new Date()))}
          onNext={() => setMonthStart((m) => addMonths(m, 1))}
        />
      </header>

      {error && <div className={styles.message}>{error}</div>}
      {!error && loading && tasks.length === 0 && <div className={styles.message}>Loading…</div>}

      <div className={styles.weekdayRow}>
        {WEEKDAYS.map((label) => (
          <div key={label} className={styles.weekdayLabel}>
            {label}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {days.map((day) => {
          const key = toDateInput(day);
          const isToday = startOfDay(day).getTime() === todayTime;
          const outside = day.getMonth() !== monthStart.getMonth();
          const dayTasks = tasksByDay.get(key) ?? [];
          const overflow = dayTasks.length - MAX_LINES;

          return (
            <div
              key={key}
              className={[styles.cell, outside ? styles.cellOutside : '']
                .filter(Boolean)
                .join(' ')}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/day/${key}`)}
            >
              <div className={isToday ? styles.dayNumberToday : styles.dayNumber}>
                {day.getDate()}
              </div>
              <div className={styles.lines}>
                {dayTasks.slice(0, MAX_LINES).map((task) => (
                  <div
                    key={task.id}
                    className={lineClass(task)}
                    onClick={(e) => handleLineClick(e, task)}
                  >
                    {task.title}
                  </div>
                ))}
                {overflow > 0 && <div className={styles.moreLine}>+{overflow} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
