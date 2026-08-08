'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTrash, faPlus, faRepeat } from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/lib/app-context';
import { useHabits } from '@/lib/habits-context';
import DayJournal from './DayJournal';
import { isSameDay, formatDate, formatTimeLabel, formatAgeShort, startOfDay, addDays, toDateInput } from '@/lib/date';
import type { Task } from '@/lib/types';
import { getNowId, taskKey } from '@/lib/helpers';
import styles from './dayView.module.css';

// ── Timeline Row ───────────────────────────────────────────────────────────

type RowProps = {
  task: Task;
  timeLabel: string;
  now?: boolean;
  overdue?: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
};

function TimelineRow({ task, timeLabel, now, overdue, onToggle, onEdit, onDelete }: RowProps) {
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
    overdue && !done ? styles.timeOverdue : now && !done ? styles.timeNow : styles.timeMuted,
  ].join(' ');

  function handleDotClick(e: MouseEvent) {
    e.stopPropagation();
    onToggle(task);
  }

  function handleDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    onDelete(task.id);
  }

  return (
    <div className={rowClass} onClick={() => onEdit(task)}>
      <div className={timeClass}>{timeLabel}</div>
      <button
        type="button"
        className={styles.dotBtn}
        onClick={handleDotClick}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
      >
        <span className={dotClass}>
          {done && (
            <span className={styles.checkIcon}>
              <FontAwesomeIcon icon={faCheck} />
            </span>
          )}
        </span>
      </button>
      <div className={titleClass}>{task.title}</div>
      <div className={styles.indicators}>
        {task.recurrence && (
          <FontAwesomeIcon icon={faRepeat} className={styles.recurIcon} title="Repeats" />
        )}
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
  const {
    tasks,
    overdueTasks,
    loading,
    error,
    toggleComplete,
    openEdit,
    openCapture,
    deleteTask,
    setRange,
  } = useApp();
  const { habits, isChecked, toggleCheck } = useHabits();
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
  // Overdue is range-independent (fetched separately in context), so it only
  // makes sense to surface on Today — a past day already shows its own history.
  const overdue = isToday ? overdueTasks : [];

  const allVisible = [...unscheduled, ...scheduled];
  const doneCount = allVisible.filter((t) => t.completedAt).length;
  const totalTasks = allVisible.length;

  const eyebrow = isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'long' });

  // The date key is used for habit check-ins, which are stored by date string. 
  const dateKey = toDateInput(date);
  const activeHabits = habits.filter((h) => !h.archivedAt);
  const showHabits = activeHabits.length > 0 && startOfDay(date).getTime() <= startOfDay(now).getTime();

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
          <span className={styles.addBtnLabel}>Add task</span>
        </button>
      </header>

      {error && <div className={styles.empty}>{error}</div>}

      {showHabits && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Habits</div>
          <div className={styles.habitsList}>
            {activeHabits.map((habit) => {
              const checked = isChecked(habit.id, dateKey);
              return (
                <button
                  key={habit.id}
                  type="button"
                  className={styles.habitRow}
                  onClick={() => void toggleCheck(habit.id, dateKey)}
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={checked ? `Mark ${habit.name} not done` : `Mark ${habit.name} done`}
                >
                  <span
                    className={[styles.habitCheckbox, checked ? styles.habitCheckboxChecked : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {checked && (
                      <span className={styles.habitCheckIcon}>
                        <FontAwesomeIcon icon={faCheck} />
                      </span>
                    )}
                  </span>
                  <span className={styles.habitName}>{habit.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {overdue.length > 0 && (
        <section className={styles.section}>
          <div className={[styles.sectionLabel, styles.sectionLabelOverdue].join(' ')}>
            Overdue · {overdue.length}
          </div>
          <div>
            {overdue.map((task) => (
              <TimelineRow
                key={taskKey(task)}
                task={task}
                timeLabel={formatAgeShort(task.scheduledAt!)}
                overdue
                onToggle={toggleComplete}
                onEdit={openEdit}
                onDelete={deleteTask}
              />
            ))}
          </div>
        </section>
      )}

      {unscheduled.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Unscheduled</div>
          <div>
            {unscheduled.map((task) => (
              <TimelineRow
                key={taskKey(task)}
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
                key={taskKey(task)}
                task={task}
                timeLabel={formatTimeLabel(task.scheduledAt!)}
                now={taskKey(task) === nowId}
                onToggle={toggleComplete}
                onEdit={openEdit}
                onDelete={deleteTask}
              />
            ))}
          </div>
        </section>
      )}

      {totalTasks === 0 && overdue.length === 0 && !error && (
        <div className={styles.empty}>
          {loading ? 'Loading…' : 'Nothing scheduled. Add a task to get started.'}
        </div>
      )}

      {startOfDay(date).getTime() <= startOfDay(now).getTime() && <DayJournal date={date} />}
    </div>
  );
}
