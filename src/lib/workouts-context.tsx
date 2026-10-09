'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Exercise, GymSettings, TrainingStyle, Workout, WorkoutSummary } from './types';
import { api, describeError } from './api';

type WorkoutsCtx = {
  settings: GymSettings | null;
  exercises: Exercise[];
  exerciseById: Map<string, Exercise>;
  workouts: WorkoutSummary[];
  loading: boolean;
  error: string | null;
  chooseStyle: (style: TrainingStyle) => Promise<void>;
  startWorkout: () => Promise<Workout | null>;
  deleteWorkout: (id: string) => Promise<void>;
  // Background refetch of the history list, e.g. after leaving a workout.
  refreshWorkouts: () => Promise<void>;
};

const WorkoutsContext = createContext<WorkoutsCtx | null>(null);

// Route-scoped to /gym, like Money/Books/Watch: nothing else reads this data.
// The active workout's own sets live in useWorkoutSession, not here.
export function WorkoutsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const workoutsRef = useRef<WorkoutSummary[]>(workouts);
  useEffect(() => {
    workoutsRef.current = workouts;
  }, [workouts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedSettings, loadedExercises, loadedWorkouts] = await Promise.all([
        api.getGymSettings(),
        api.listExercises(),
        api.listWorkouts(),
      ]);
      setSettings(loadedSettings);
      setExercises(loadedExercises);
      setWorkouts(loadedWorkouts);
    } catch (e) {
      setError(describeError(e, 'Could not load workouts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load once on mount; load() owns its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const refreshWorkouts = useCallback(async () => {
    try {
      setWorkouts(await api.listWorkouts());
    } catch (e) {
      setError(describeError(e, 'Could not refresh workouts'));
    }
  }, []);

  const chooseStyle = useCallback(async (style: TrainingStyle) => {
    const previous = settings;
    setSettings((prev) => (prev ? { ...prev, trainingStyle: style } : prev));
    try {
      setSettings(await api.updateGymSettings(style));
      // Every exercise following the style just changed range.
      setExercises(await api.listExercises());
    } catch (e) {
      setSettings(previous);
      setError(describeError(e, 'Could not save training style'));
    }
  }, [settings]);

  // Not optimistic: the page navigates to the new workout's id, which only
  // the server can mint.
  const startWorkout = useCallback(async () => {
    try {
      const workout = await api.startWorkout();
      setWorkouts((prev) => [{ workout, exerciseIds: [], workingSetCount: 0, volumeGrams: 0 }, ...prev]);
      return workout;
    } catch (e) {
      setError(describeError(e, 'Could not start a workout'));
      return null;
    }
  }, []);

  const deleteWorkout = useCallback(async (id: string) => {
    const snapshot = workoutsRef.current;
    setWorkouts((prev) => prev.filter((w) => w.workout.id !== id));
    try {
      await api.removeWorkout(id);
    } catch (e) {
      setWorkouts(snapshot);
      setError(describeError(e, 'Could not delete workout'));
    }
  }, []);

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  return (
    <WorkoutsContext.Provider
      value={{
        settings,
        exercises,
        exerciseById,
        workouts,
        loading,
        error,
        chooseStyle,
        startWorkout,
        deleteWorkout,
        refreshWorkouts,
      }}
    >
      {children}
    </WorkoutsContext.Provider>
  );
}

export function useWorkouts(): WorkoutsCtx {
  const ctx = useContext(WorkoutsContext);
  if (!ctx) throw new Error('useWorkouts must be used inside <WorkoutsProvider>');
  return ctx;
}
