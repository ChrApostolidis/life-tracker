import type {
  Exercise,
  ExerciseSession,
  MuscleGroup,
  ProgressionSuggestion,
  TrainingStyle,
  WorkoutSet,
} from './types';

export const MUSCLE_GROUPS: MuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

// Copy for the style picker only. The ranges an exercise actually uses come
// resolved from the backend (TrainingStyles.java) — never derive them from this.
export const STYLE_OPTIONS: {
  value: TrainingStyle;
  label: string;
  compound: string;
  isolation: string;
  blurb: string;
}[] = [
  { value: 'strength', label: 'Strength', compound: '3–6', isolation: '8–12', blurb: 'Heavy and low on the big lifts.' },
  { value: 'balanced', label: 'Strength + size', compound: '5–8', isolation: '8–12', blurb: 'Heavy enough to get strong, enough reps to grow.' },
  { value: 'hypertrophy', label: 'Hypertrophy', compound: '8–12', isolation: '10–15', blurb: 'Classic muscle-building ranges.' },
];

export function styleLabel(style: TrainingStyle | null): string {
  return STYLE_OPTIONS.find((o) => o.value === style)?.label ?? 'Not chosen';
}

// 62500 → "62.5", 60000 → "60". Weights travel as integer grams.
export function formatKg(grams: number): string {
  return String(Math.round(grams / 10) / 100);
}

export function formatWeight(grams: number): string {
  return grams === 0 ? 'bodyweight' : `${formatKg(grams)} kg`;
}

// "62,5" or "62.5" → 62500. Null for blank, non-numeric or negative input.
export function parseKgInput(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const kg = Number(trimmed);
  if (!Number.isFinite(kg) || kg < 0) return null;
  return Math.round(kg * 1000);
}

// Σ weight × reps in gram-reps → "3,420 kg".
export function formatVolume(volumeGrams: number): string {
  return `${Math.round(volumeGrams / 1000).toLocaleString('en-US')} kg`;
}

// "48 min", "1 h 12 min".
export function formatDuration(fromIso: string, toMs: number): string {
  const minutes = Math.max(0, Math.round((toMs - new Date(fromIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Exercises in the order first logged, each with its sets in position order.
export function groupSetsByExercise(sets: WorkoutSet[]): { exerciseId: string; sets: WorkoutSet[] }[] {
  const groups = new Map<string, WorkoutSet[]>();
  for (const set of [...sets].sort((a, b) => a.position - b.position)) {
    const group = groups.get(set.exerciseId);
    if (group) group.push(set);
    else groups.set(set.exerciseId, [set]);
  }
  return [...groups].map(([exerciseId, grouped]) => ({ exerciseId, sets: grouped }));
}

// The working sets at the session's heaviest weight — the same sets the
// backend judged, so the "last time" phrase matches its verdict.
function topSets(session: ExerciseSession): WorkoutSet[] {
  const working = session.sets.filter((s) => !s.warmup);
  const heaviest = Math.max(...working.map((s) => s.weightGrams));
  return working.filter((s) => s.weightGrams === heaviest);
}

// "3 × 12 @ 60 kg", or "60 kg × 12, 12, 11" when the reps differ.
function describeSets(sets: WorkoutSet[]): string {
  const weight = formatWeight(sets[0].weightGrams);
  const reps = sets.map((s) => s.reps);
  if (reps.every((r) => r === reps[0])) return `${sets.length} × ${reps[0]} @ ${weight}`;
  return `${weight} × ${reps.join(', ')}`;
}

// The one-line reason under each exercise. The backend sends structured data
// only; the wording lives here.
export function describeSuggestion(suggestion: ProgressionSuggestion, exercise: Exercise): string {
  const { action, weightGrams, targetReps, basedOn } = suggestion;
  if (action === 'start' || !basedOn || weightGrams === null) {
    return `New lift. Pick a weight you can do for ${exercise.repMin}–${exercise.repMax} reps.`;
  }
  const last = `Last: ${describeSets(topSets(basedOn))}.`;
  const weight = formatWeight(weightGrams);
  switch (action) {
    case 'increase':
      return `${last} Top of the range, so try ${weight} for ${targetReps}.`;
    case 'extend':
      return `${last} ${formatWeight(weightGrams + exercise.weightStepGrams)} is a big jump, so stay at ${weight} and aim for ${targetReps}.`;
    case 'deload':
      return `${last} Three tough sessions in a row, so drop to ${weight} and build back up.`;
    default:
      return exercise.weightStepGrams === 0
        ? `${last} Aim for ${targetReps} reps.`
        : `${last} Same weight, aim for ${targetReps} reps.`;
  }
}
