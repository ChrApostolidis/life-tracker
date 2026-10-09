'use client';

import { useState } from 'react';
import Modal from '../components/Modal';
import type { Exercise } from '@/lib/types';
import { MUSCLE_GROUPS } from '@/lib/gym';
import styles from './exercisePicker.module.css';

type Props = {
  open: boolean;
  exercises: Exercise[];
  // Already in this workout: listed but marked, so it's clear why tapping does nothing new.
  addedIds: string[];
  onPick: (exerciseId: string) => void;
  onClose: () => void;
};

export default function ExercisePicker({ open, exercises, addedIds, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const visible = exercises.filter((e) => !e.archivedAt && e.name.toLowerCase().includes(needle));
  const groups = MUSCLE_GROUPS.map((group) => ({
    group,
    items: visible.filter((e) => e.muscleGroup === group),
  })).filter((g) => g.items.length > 0);

  function pick(exerciseId: string) {
    onPick(exerciseId);
    setQuery('');
    onClose();
  }

  return (
    <Modal open={open} eyebrow="Add exercise" onClose={onClose} width={480} height={560}>
      <div className={styles.body}>
        <input
          className={styles.search}
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className={styles.list}>
          {groups.length === 0 && <p className={styles.empty}>Nothing matches that.</p>}
          {groups.map(({ group, items }) => (
            <div key={group} className={styles.group}>
              <div className={styles.groupLabel}>{group}</div>
              {items.map((exercise) => {
                const added = addedIds.includes(exercise.id);
                return (
                  <button
                    key={exercise.id}
                    type="button"
                    className={styles.item}
                    onClick={() => pick(exercise.id)}
                  >
                    <span className={styles.itemName}>{exercise.name}</span>
                    <span className={styles.itemMeta}>{added ? 'added' : exercise.equipment}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
