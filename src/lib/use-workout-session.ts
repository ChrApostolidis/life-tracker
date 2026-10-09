'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProgressionSuggestion, Workout, WorkoutSet } from './types';
import { ApiError, api, describeError } from './api';
import { groupSetsByExercise } from './gym';

// undefined = still loading; null = the fetch failed (the entry row still works, just unfilled).
export type SuggestionState = ProgressionSuggestion | null | undefined;

// One workout's live state for /gym/[id]. Sets are saved one at a time, the
// moment they're logged, so a dead tab or a refresh mid-workout loses nothing.
export function useWorkoutSession(workoutId: string) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Picked this visit but no set logged yet, so not derivable from sets.
  const [pendingExerciseIds, setPendingExerciseIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, ProgressionSuggestion | null>>({});
  const requested = useRef(new Set<string>());

  const setsRef = useRef<WorkoutSet[]>(sets);
  useEffect(() => {
    setsRef.current = sets;
  }, [sets]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getWorkout(workoutId);
      setWorkout(detail.workout);
      setSets(detail.sets);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(describeError(e, 'Could not load this workout'));
    } finally {
      setLoading(false);
    }
  }, [workoutId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const groups = useMemo(() => groupSetsByExercise(sets), [sets]);
  const exerciseOrder = useMemo(() => {
    const logged = groups.map((g) => g.exerciseId);
    return [...logged, ...pendingExerciseIds.filter((id) => !logged.includes(id))];
  }, [groups, pendingExerciseIds]);

  // One suggestion per exercise, fetched once. It excludes this workout, so
  // logging sets here never moves it.
  useEffect(() => {
    for (const exerciseId of exerciseOrder) {
      if (requested.current.has(exerciseId)) continue;
      requested.current.add(exerciseId);
      api
        .exerciseSuggestion(exerciseId, workoutId)
        .then((s) => setSuggestions((prev) => ({ ...prev, [exerciseId]: s })))
        .catch(() => setSuggestions((prev) => ({ ...prev, [exerciseId]: null })));
    }
  }, [exerciseOrder, workoutId]);

  const addExercise = useCallback((exerciseId: string) => {
    setPendingExerciseIds((prev) => (prev.includes(exerciseId) ? prev : [...prev, exerciseId]));
  }, []);

  const logSet = useCallback(
    async (exerciseId: string, weightGrams: number, reps: number, warmup: boolean) => {
      const tempId = `temp-set-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const position = Math.max(-1, ...setsRef.current.map((s) => s.position)) + 1;
      const optimistic: WorkoutSet = {
        id: tempId,
        workoutId,
        exerciseId,
        position,
        weightGrams,
        reps,
        warmup,
        deletedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setSets((prev) => [...prev, optimistic]);
      try {
        const saved = await api.addWorkoutSet(workoutId, { exerciseId, weightGrams, reps, warmup });
        setSets((prev) => prev.map((s) => (s.id === tempId ? saved : s)));
      } catch (e) {
        setSets((prev) => prev.filter((s) => s.id !== tempId));
        setError(describeError(e, 'Could not save that set'));
      }
    },
    [workoutId],
  );

  const deleteSet = useCallback(async (setId: string) => {
    const snapshot = setsRef.current;
    setSets((prev) => prev.filter((s) => s.id !== setId));
    try {
      await api.removeWorkoutSet(setId);
    } catch (e) {
      setSets(snapshot);
      setError(describeError(e, 'Could not delete that set'));
    }
  }, []);

  const finish = useCallback(async (): Promise<boolean> => {
    try {
      setWorkout(await api.finishWorkout(workoutId));
      return true;
    } catch (e) {
      setError(describeError(e, 'Could not finish the workout'));
      return false;
    }
  }, [workoutId]);

  return {
    workout,
    sets,
    groups,
    exerciseOrder,
    suggestions,
    loading,
    error,
    notFound,
    addExercise,
    logSet,
    deleteSet,
    finish,
  };
}
