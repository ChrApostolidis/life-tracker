'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useWorkouts } from '@/lib/workouts-context';
import { useWorkoutSession } from '@/lib/use-workout-session';
import { formatDate, formatTimeLabel, fromDateInput } from '@/lib/date';
import { formatDuration, formatVolume } from '@/lib/gym';
import type { WorkoutSet } from '@/lib/types';
import Skeleton, { SkeletonBlock } from '../../components/Skeleton';
import ExerciseBlock from '../ExerciseBlock';
import ExercisePicker from '../ExercisePicker';
import blockStyles from '../exerciseBlock.module.css';
import styles from './workout.module.css';

const DELETE_CONFIRM_MS = 4000;

// A clock that only ticks while something on screen counts time.
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function workingStats(sets: WorkoutSet[]): { count: number; volumeGrams: number } {
  const working = sets.filter((s) => !s.warmup);
  return { count: working.length, volumeGrams: working.reduce((sum, s) => sum + s.weightGrams * s.reps, 0) };
}

// The header is unknown until the workout loads; the blocks reuse the real
// card class so the swap doesn't shift anything.
function WorkoutSkeleton() {
  return (
    <SkeletonBlock label="Loading workout">
      <header className={styles.header}>
        <Skeleton height={12} width={72} radius={4} />
        <Skeleton height={34} width="60%" radius={6} style={{ marginTop: 8 }} />
        <Skeleton height={14} width="40%" radius={4} style={{ marginTop: 8 }} />
      </header>
      <div className={styles.blocks}>
        {[0, 1].map((i) => (
          <div key={i} className={blockStyles.block}>
            <Skeleton height={16} width="45%" radius={4} />
            <Skeleton height={14} width="80%" radius={4} style={{ marginTop: 12 }} />
            <Skeleton height={44} radius={8} style={{ marginTop: 16 }} />
          </div>
        ))}
      </div>
    </SkeletonBlock>
  );
}

// Keyed by id so moving between workouts starts from fresh state, never
// carrying one workout's suggestions or picked exercises into the next.
export default function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <WorkoutScreen key={id} id={id} />;
}

function WorkoutScreen({ id }: { id: string }) {
  const router = useRouter();
  const { exercises, exerciseById, loading: libraryLoading, deleteWorkout, refreshWorkouts } = useWorkouts();
  const session = useWorkoutSession(id);
  const { workout, sets, groups, exerciseOrder, suggestions } = session;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const inProgress = workout !== null && workout.finishedAt === null;
  const now = useNow(inProgress || restStartedAt !== null);

  // The history list on /gym shows set counts and volume; refresh it once on
  // the way out rather than after every set.
  useEffect(() => () => void refreshWorkouts(), [refreshWorkouts]);

  // The first tap arms delete; it disarms itself if the second never comes.
  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  async function handleFinish() {
    setLeaving(true);
    if (await session.finish()) router.push('/gym');
    else setLeaving(false);
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setLeaving(true);
    await deleteWorkout(id);
    router.push('/gym');
  }

  if (session.notFound) {
    return (
      <div className={styles.page}>
        <Link href="/gym" className={styles.back}>
          <FontAwesomeIcon icon={faChevronLeft} />
          Workouts
        </Link>
        <p className={styles.message}>This workout no longer exists.</p>
      </div>
    );
  }

  const stillLoading = (session.loading && !workout) || (libraryLoading && exercises.length === 0);
  const { count, volumeGrams } = workingStats(sets);

  return (
    <div className={styles.page}>
      <Link href="/gym" className={styles.back}>
        <FontAwesomeIcon icon={faChevronLeft} />
        Workouts
      </Link>

      {session.error && <div className={styles.message}>{session.error}</div>}

      {stillLoading || !workout ? (
        !session.error && <WorkoutSkeleton />
      ) : (
        <>
          <header className={styles.header}>
            <div className={styles.eyebrow}>{inProgress ? 'Workout · in progress' : 'Workout'}</div>
            <h1 className={styles.title}>{formatDate(fromDateInput(workout.performedOn))}</h1>
            <div className={styles.meta}>
              {inProgress
                ? `Started ${formatTimeLabel(workout.startedAt)} · ${formatDuration(workout.startedAt, now)}`
                : formatDuration(workout.startedAt, new Date(workout.finishedAt ?? workout.startedAt).getTime())}
              {` · ${count} set${count === 1 ? '' : 's'}`}
              {volumeGrams > 0 && ` · ${formatVolume(volumeGrams)}`}
            </div>
          </header>

          <div className={styles.blocks}>
            {exerciseOrder.length === 0 && (
              <p className={styles.hint}>Add your first exercise to get a suggested weight.</p>
            )}
            {exerciseOrder.map((exerciseId) => {
              const exercise = exerciseById.get(exerciseId);
              if (!exercise) return null;
              return (
                <ExerciseBlock
                  key={exerciseId}
                  exercise={exercise}
                  sets={groups.find((g) => g.exerciseId === exerciseId)?.sets ?? []}
                  suggestion={exerciseId in suggestions ? suggestions[exerciseId] : undefined}
                  onLog={(weightGrams, reps, warmup) => {
                    void session.logSet(exerciseId, weightGrams, reps, warmup);
                    setRestStartedAt(Date.now());
                  }}
                  onDeleteSet={(setId) => void session.deleteSet(setId)}
                />
              );
            })}

            <button type="button" className={styles.addExercise} onClick={() => setPickerOpen(true)}>
              <FontAwesomeIcon icon={faPlus} />
              Add exercise
            </button>
          </div>

          {restStartedAt !== null && (
            <div className={styles.rest} role="timer" aria-live="off">
              <span className={styles.restLabel}>Rest</span>
              <span className={styles.restClock}>{formatClock(now - restStartedAt)}</span>
              <button type="button" className={styles.restDismiss} onClick={() => setRestStartedAt(null)}>
                Dismiss
              </button>
            </div>
          )}

          <div className={styles.footer}>
            {inProgress && (
              <button type="button" className={styles.finishBtn} onClick={handleFinish} disabled={leaving}>
                Finish workout
              </button>
            )}
            <button
              type="button"
              className={[styles.deleteBtn, confirmingDelete ? styles.deleteBtnArmed : ''].filter(Boolean).join(' ')}
              onClick={handleDelete}
              disabled={leaving}
            >
              {confirmingDelete ? 'Tap again to delete' : 'Delete workout'}
            </button>
          </div>

          <ExercisePicker
            open={pickerOpen}
            exercises={exercises}
            addedIds={exerciseOrder}
            onPick={session.addExercise}
            onClose={() => setPickerOpen(false)}
          />
        </>
      )}
    </div>
  );
}
