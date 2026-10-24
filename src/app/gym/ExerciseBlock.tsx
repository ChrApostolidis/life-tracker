'use client';

import { useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Exercise, ProgressionSuggestion, WorkoutSet } from '@/lib/types';
import type { SuggestionState } from '@/lib/use-workout-session';
import { describeSuggestion, formatKg, parseKgInput } from '@/lib/gym';
import Skeleton from '../components/Skeleton';
import styles from './exerciseBlock.module.css';

type Props = {
  exercise: Exercise;
  sets: WorkoutSet[];
  suggestion: SuggestionState;
  onLog: (weightGrams: number, reps: number, warmup: boolean) => void;
  onDeleteSet: (setId: string) => void;
};

// Working sets are numbered 1, 2, 3…; warm-ups show "W" and don't take a number.
function setLabels(sets: WorkoutSet[]): string[] {
  let working = 0;
  return sets.map((set) => (set.warmup ? 'W' : String(++working)));
}

export default function ExerciseBlock({ exercise, sets, suggestion, onLog, onDeleteSet }: Props) {
  const labels = setLabels(sets);

  return (
    <section className={styles.block}>
      <header className={styles.head}>
        <h2 className={styles.name}>{exercise.name}</h2>
        <span className={styles.range}>
          {exercise.repMin}–{exercise.repMax} reps
        </span>
      </header>

      {suggestion === undefined ? (
        <Skeleton height={14} width="70%" radius={4} className={styles.reasonSkeleton} />
      ) : (
        suggestion && <p className={styles.reason}>{describeSuggestion(suggestion, exercise)}</p>
      )}

      {sets.length > 0 && (
        <ol className={styles.sets}>
          {sets.map((set, i) => (
            <li key={set.id} className={styles.setRow}>
              <span className={[styles.setIndex, set.warmup ? styles.setIndexWarmup : ''].filter(Boolean).join(' ')}>
                {labels[i]}
              </span>
              <span className={styles.setWeight}>{set.weightGrams === 0 ? 'BW' : `${formatKg(set.weightGrams)} kg`}</span>
              <span className={styles.setReps}>× {set.reps}</span>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => onDeleteSet(set.id)}
                aria-label={set.warmup ? 'Delete warm-up set' : `Delete set ${labels[i]}`}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Mounted once the suggestion settles, so its first render can prefill from it. */}
      {suggestion !== undefined && <SetEntry exercise={exercise} suggestion={suggestion} onLog={onLog} />}
    </section>
  );
}

function suggestedWeight(exercise: Exercise, suggestion: ProgressionSuggestion | null): string {
  if (suggestion?.weightGrams != null) return formatKg(suggestion.weightGrams);
  return exercise.weightStepGrams === 0 ? '0' : '';
}

function suggestedReps(exercise: Exercise, suggestion: ProgressionSuggestion | null): string {
  return String(suggestion?.targetReps ?? exercise.repMin);
}

function SetEntry({
  exercise,
  suggestion,
  onLog,
}: {
  exercise: Exercise;
  suggestion: ProgressionSuggestion | null;
  onLog: Props['onLog'];
}) {
  const [weight, setWeight] = useState(() => suggestedWeight(exercise, suggestion));
  const [reps, setReps] = useState(() => suggestedReps(exercise, suggestion));
  const [warmup, setWarmup] = useState(false);

  const weightGrams = parseKgInput(weight);
  const repCount = Number(reps);
  const valid = weightGrams !== null && Number.isInteger(repCount) && repCount >= 1;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onLog(weightGrams, repCount, warmup);
    // A warm-up's numbers are no guide to the next set: go back to the
    // suggestion. After a working set, keep the numbers — the next set is
    // usually the same.
    if (warmup) {
      setWeight(suggestedWeight(exercise, suggestion));
      setReps(suggestedReps(exercise, suggestion));
      setWarmup(false);
    }
  }

  return (
    <form className={styles.entry} onSubmit={submit}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>kg</span>
        <input
          className={styles.input}
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="0"
          aria-label={`${exercise.name} weight in kg`}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>reps</span>
        <input
          className={styles.input}
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          aria-label={`${exercise.name} reps`}
        />
      </label>
      <button
        type="button"
        className={[styles.warmupChip, warmup ? styles.warmupChipOn : ''].filter(Boolean).join(' ')}
        onClick={() => setWarmup((w) => !w)}
        aria-pressed={warmup}
      >
        Warm-up
      </button>
      <button type="submit" className={styles.logBtn} disabled={!valid}>
        Log set
      </button>
    </form>
  );
}
