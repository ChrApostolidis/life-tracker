'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDumbbell, faPlay } from '@fortawesome/free-solid-svg-icons';
import { useWorkouts } from '@/lib/workouts-context';
import { formatDate, formatTimeLabel, fromDateInput, startOfWeek, toDateInput } from '@/lib/date';
import { formatDuration, formatVolume, styleLabel } from '@/lib/gym';
import type { Exercise, WorkoutSummary } from '@/lib/types';
import Skeleton, { SkeletonBlock } from '../components/Skeleton';
import StylePicker from './StylePicker';
import styles from './gym.module.css';

const SKELETON_CARDS = 4;
const NAMES_SHOWN = 4;

// Same .list/.card geometry as the real history, so nothing shifts on load.
function HistorySkeleton() {
  return (
    <SkeletonBlock className={styles.list} label="Loading workouts">
      {Array.from({ length: SKELETON_CARDS }, (_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton height={16} width="40%" radius={4} />
          <Skeleton height={14} width="55%" radius={4} style={{ marginTop: 8 }} />
          <Skeleton height={14} width="75%" radius={4} style={{ marginTop: 8 }} />
        </div>
      ))}
    </SkeletonBlock>
  );
}

function exerciseNames(summary: WorkoutSummary, exerciseById: Map<string, Exercise>): string {
  const names = summary.exerciseIds.map((id) => exerciseById.get(id)?.name ?? 'Unknown exercise');
  const shown = names.slice(0, NAMES_SHOWN).join(' · ');
  return names.length > NAMES_SHOWN ? `${shown} · +${names.length - NAMES_SHOWN}` : shown;
}

function summaryMeta(summary: WorkoutSummary): string {
  const { workout, workingSetCount, volumeGrams } = summary;
  const parts: string[] = [];
  if (workout.finishedAt) parts.push(formatDuration(workout.startedAt, new Date(workout.finishedAt).getTime()));
  else parts.push('not finished');
  parts.push(`${workingSetCount} set${workingSetCount === 1 ? '' : 's'}`);
  if (volumeGrams > 0) parts.push(formatVolume(volumeGrams));
  return parts.join(' · ');
}

export default function GymPage() {
  const router = useRouter();
  const { settings, exerciseById, workouts, loading, error, chooseStyle, startWorkout } = useWorkouts();
  const [changingStyle, setChangingStyle] = useState(false);
  const [starting, setStarting] = useState(false);

  const todayKey = toDateInput(new Date());
  const weekStartKey = toDateInput(startOfWeek(new Date()));
  const thisWeek = workouts.filter((w) => w.workout.performedOn >= weekStartKey).length;
  // Only today's unfinished session is "in progress"; an older one where Finish
  // was never tapped just sits in the history.
  const inProgress = workouts.find((w) => !w.workout.finishedAt && w.workout.performedOn === todayKey);

  const styleUnchosen = settings !== null && settings.trainingStyle === null;
  const showPicker = styleUnchosen || changingStyle;

  async function handleStart() {
    setStarting(true);
    const workout = await startWorkout();
    if (workout) router.push(`/gym/${workout.id}`);
    else setStarting(false);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Gym</div>
        <h1 className={styles.title}>Workouts</h1>
        {settings && !styleUnchosen && (
          <div className={styles.meta}>
            {thisWeek} this week · {styleLabel(settings.trainingStyle)}
            {!changingStyle && (
              <>
                {' · '}
                <button type="button" className={styles.inlineLink} onClick={() => setChangingStyle(true)}>
                  change
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {error && <div className={styles.message}>{error}</div>}

      {showPicker && settings && (
        <StylePicker
          current={settings.trainingStyle}
          onChoose={(style) => {
            void chooseStyle(style);
            setChangingStyle(false);
          }}
          onCancel={styleUnchosen ? undefined : () => setChangingStyle(false)}
        />
      )}

      {!styleUnchosen && settings && (
        inProgress ? (
          <Link href={`/gym/${inProgress.workout.id}`} className={styles.primaryCard}>
            <FontAwesomeIcon icon={faPlay} className={styles.primaryIcon} />
            <span className={styles.primaryText}>
              <span className={styles.primaryTitle}>Resume workout</span>
              <span className={styles.primarySub}>
                Started {formatTimeLabel(inProgress.workout.startedAt)} · {inProgress.workingSetCount} set
                {inProgress.workingSetCount === 1 ? '' : 's'} so far
              </span>
            </span>
          </Link>
        ) : (
          <button type="button" className={styles.primaryCard} onClick={handleStart} disabled={starting}>
            <FontAwesomeIcon icon={faDumbbell} className={styles.primaryIcon} />
            <span className={styles.primaryText}>
              <span className={styles.primaryTitle}>Start workout</span>
              <span className={styles.primarySub}>Pick exercises as you go</span>
            </span>
          </button>
        )
      )}

      {/* Until a style is chosen the picker is the whole page. */}
      {styleUnchosen ? null : loading && workouts.length === 0 && !error ? (
        <HistorySkeleton />
      ) : !loading && !error && workouts.length === 0 ? (
        <div className={styles.empty}>
          <FontAwesomeIcon icon={faDumbbell} className={styles.emptyIcon} />
          <p>No workouts yet. Start one when you get to the gym.</p>
        </div>
      ) : (
        workouts.length > 0 && (
          <>
            <div className={styles.sectionLabel}>History</div>
            <div className={styles.list}>
              {workouts.map((summary) => (
                <Link key={summary.workout.id} href={`/gym/${summary.workout.id}`} className={styles.card}>
                  <div className={styles.cardDate}>{formatDate(fromDateInput(summary.workout.performedOn))}</div>
                  <div className={styles.cardMeta}>{summaryMeta(summary)}</div>
                  {summary.exerciseIds.length > 0 && (
                    <div className={styles.cardExercises}>{exerciseNames(summary, exerciseById)}</div>
                  )}
                </Link>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
