// Compact text for tool results. One style everywhere: one item per line,
// '- ' bullets, ids in [id:…] at the end so a follow-up call can address the row.

import { dateOf, dayLabel, timeOf } from './dates.ts';
import type { Exercise, ExerciseSession, ProgressionSuggestion, Task, WorkoutSet } from './types.ts';

export function idTag(id: string): string {
  return `[id:${id}]`;
}

// An occurrence's identity is the pair, so both go in the tag.
export function taskTag(task: Task): string {
  return task.occurrenceDate ? `[id:${task.id} occurrenceDate:${task.occurrenceDate}]` : idTag(task.id);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// 1250 → '€12.50'. Money travels as integer cents.
export function euros(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}€${whole}.${String(abs % 100).padStart(2, '0')}`;
}

// 62500 → '62.5 kg', 0 → 'bodyweight'. Weights travel as integer grams.
export function kg(grams: number): string {
  return grams === 0 ? 'bodyweight' : `${Math.round(grams / 10) / 100} kg`;
}

// Σ weight × reps in gram-reps → '3,420 kg'.
export function volume(grams: number): string {
  return `${Math.round(grams / 1000).toLocaleString('en-US')} kg`;
}

// 440 → '7h 20m', 45 → '45m', 480 → '8h'.
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000;
}

// One line; long text is cut with an ellipsis so a list stays a list.
export function oneLine(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function checkbox(done: boolean): string {
  return done ? '[x]' : '[ ]';
}

// A scheduled task. Midnight means no time was given: the model has no all-day
// flag, so a dated capture is stored at 00:00.
export function taskLine(task: Task): string {
  const time = task.scheduledAt ? timeOf(task.scheduledAt) : null;
  const parts = [checkbox(task.completedAt !== null)];
  parts.push(time && time !== '00:00' ? time : 'no time');
  parts.push(oneLine(task.title));
  if (task.durationMin) parts.push(`(${duration(task.durationMin)})`);
  if (task.recurrence || task.occurrenceDate) parts.push(`↻ ${task.recurrence ?? 'recurring'}`);
  return `- ${parts.join(' ')} ${taskTag(task)}`;
}

// An overdue task: when it was due instead of a time of day.
export function overdueLine(task: Task): string {
  const due = task.scheduledAt ? dayLabel(dateOf(task.scheduledAt)) : 'no date';
  return `- ${checkbox(false)} ${oneLine(task.title)} · due ${due} ${taskTag(task)}`;
}

export function inboxLine(task: Task): string {
  return `- ${checkbox(task.completedAt !== null)} ${oneLine(task.title)} · added ${dateOf(task.createdAt)} ${taskTag(task)}`;
}

// The working sets at the session's heaviest weight: the sets the backend judged.
function topSets(session: ExerciseSession): WorkoutSet[] {
  const working = session.sets.filter((s) => !s.warmup);
  const heaviest = Math.max(...working.map((s) => s.weightGrams));
  return working.filter((s) => s.weightGrams === heaviest);
}

// '3 × 12 @ 60 kg', or '60 kg × 12, 12, 11' when the reps differ.
export function describeSets(sets: WorkoutSet[]): string {
  const first = sets[0];
  if (!first) return 'no sets';
  const weight = kg(first.weightGrams);
  const reps = sets.map((s) => s.reps);
  if (reps.every((r) => r === reps[0])) return `${sets.length} × ${reps[0]} @ ${weight}`;
  return `${weight} × ${reps.join(', ')}`;
}

// Every set of a session in order, warm-ups marked: 'W 40 kg × 10, 60 kg × 8, 60 kg × 7'.
export function sessionSets(session: ExerciseSession): string {
  return [...session.sets]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.warmup ? 'W ' : ''}${kg(s.weightGrams)} × ${s.reps}`)
    .join(', ');
}

// Ported from describeSuggestion in the web app's src/lib/gym.ts, so the chat
// and the /gym page explain the next weight the same way.
export function describeSuggestion(suggestion: ProgressionSuggestion, exercise: Exercise): string {
  const { action, weightGrams, targetReps, basedOn } = suggestion;
  if (action === 'start' || !basedOn || weightGrams === null) {
    return `New lift. Pick a weight you can do for ${exercise.repMin}–${exercise.repMax} reps.`;
  }
  const last = `Last: ${describeSets(topSets(basedOn))}.`;
  const weight = kg(weightGrams);
  switch (action) {
    case 'increase':
      return `${last} Top of the range, so try ${weight} for ${targetReps}.`;
    case 'extend':
      return `${last} ${kg(weightGrams + exercise.weightStepGrams)} is a big jump, so stay at ${weight} and aim for ${targetReps}.`;
    case 'deload':
      return `${last} Three tough sessions in a row, so drop to ${weight} and build back up.`;
    default:
      return exercise.weightStepGrams === 0
        ? `${last} Aim for ${targetReps} reps.`
        : `${last} Same weight, aim for ${targetReps} reps.`;
  }
}
