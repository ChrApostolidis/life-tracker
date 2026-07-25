'use client';

import { useState, type KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxArchive, faCheck, faListCheck, faPen } from '@fortawesome/free-solid-svg-icons';
import { useHabits } from '@/lib/habits-context';
import { computeStreak } from '@/lib/game';
import { addDays, toDateInput } from '@/lib/date';
import type { Habit } from '@/lib/types';
import styles from './habits.module.css';

export default function HabitsPage() {
  const {
    habits,
    checks,
    loading,
    error,
    isChecked,
    toggleCheck,
    addHabit,
    renameHabit,
    archiveHabit,
    unarchiveHabit,
  } = useHabits();

  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const now = new Date();
  const todayKey = toDateInput(now);

  const activeHabits = habits.filter((h) => !h.archivedAt);
  const archivedHabits = habits.filter((h) => h.archivedAt);
  const doneToday = activeHabits.filter((h) => isChecked(h.id, todayKey)).length;

  function habitDayKeys(habitId: string): Set<string> {
    return new Set(checks.filter((c) => c.habitId === habitId).map((c) => c.checkedOn));
  }

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    void addHabit(name);
    setNewName('');
  }

  function handleAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAdd();
  }

  function startRename(habit: Habit) {
    setRenamingId(habit.id);
    setRenameDraft(habit.name);
  }

  function saveRename(id: string) {
    const name = renameDraft.trim();
    if (name) void renameHabit(id, name);
    setRenamingId(null);
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>, id: string) {
    if (e.key === 'Enter') saveRename(id);
    if (e.key === 'Escape') setRenamingId(null);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Habits</div>
        <h1 className={styles.title}>Daily habits</h1>
        <div className={styles.meta}>
          {doneToday} of {activeHabits.length} done today
        </div>
      </header>

      <div className={styles.addRow}>
        <input
          className={styles.addInput}
          placeholder="New habit"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleAddKeyDown}
        />
        <button type="button" className={styles.addBtn} onClick={handleAdd} disabled={!newName.trim()}>
          Add
        </button>
      </div>

      {error && <div className={styles.message}>{error}</div>}
      {!error && loading && habits.length === 0 && <div className={styles.message}>Loading…</div>}

      {!loading && !error && habits.length === 0 ? (
        <div className={styles.empty}>
          <FontAwesomeIcon icon={faListCheck} className={styles.emptyIcon} />
          <p>No habits yet. Add one above to start tracking.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {activeHabits.map((habit) => {
            const dayKeys = habitDayKeys(habit.id);
            const streak = computeStreak(dayKeys, todayKey);
            const checkedToday = isChecked(habit.id, todayKey);
            const last14 = Array.from({ length: 14 }, (_, i) => {
              const date = toDateInput(addDays(now, i - 13));
              return { date, checked: dayKeys.has(date) };
            });

            return (
              <div key={habit.id} className={styles.row}>
                <div className={styles.rowTop}>
                  <button
                    type="button"
                    className={styles.checkboxBtn}
                    onClick={() => void toggleCheck(habit.id, todayKey)}
                    role="checkbox"
                    aria-checked={checkedToday}
                    aria-label={
                      checkedToday ? `Mark ${habit.name} not done today` : `Mark ${habit.name} done today`
                    }
                  >
                    <span
                      className={[styles.checkbox, checkedToday ? styles.checkboxChecked : styles.checkboxOpen]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {checkedToday && (
                        <span className={styles.checkIcon}>
                          <FontAwesomeIcon icon={faCheck} />
                        </span>
                      )}
                    </span>
                  </button>

                  {renamingId === habit.id ? (
                    <input
                      className={styles.renameInput}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => saveRename(habit.id)}
                      onKeyDown={(e) => handleRenameKeyDown(e, habit.id)}
                      autoFocus
                    />
                  ) : (
                    <div className={styles.name}>{habit.name}</div>
                  )}

                  {streak.current > 0 && (
                    <span className={styles.streakChip}>
                      {streak.current} day{streak.current === 1 ? '' : 's'} streak
                    </span>
                  )}

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => startRename(habit)}
                      aria-label="Rename habit"
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => void archiveHabit(habit.id)}
                      aria-label="Archive habit"
                    >
                      <FontAwesomeIcon icon={faBoxArchive} />
                    </button>
                  </div>
                </div>

                <div className={styles.strip}>
                  {last14.map((d) => (
                    <div
                      key={d.date}
                      className={[
                        styles.stripDay,
                        d.checked ? styles.stripDayChecked : '',
                        d.date === todayKey ? styles.stripDayToday : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={d.date}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archivedHabits.length > 0 && (
        <div className={styles.archivedSection}>
          <div className={styles.archivedLabel}>Archived · {archivedHabits.length}</div>
          {archivedHabits.map((habit) => (
            <div key={habit.id} className={styles.archivedRow}>
              <span className={styles.archivedName}>{habit.name}</span>
              <button
                type="button"
                className={styles.unarchiveBtn}
                onClick={() => void unarchiveHabit(habit.id)}
              >
                Unarchive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
