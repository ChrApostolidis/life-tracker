import { z } from 'zod';
import { api } from '../api.ts';
import { dayLabel } from '../dates.ts';
import { describeSuggestion, duration, idTag, kg, minutesBetween, plural, sessionSets, volume } from '../format.ts';
import { resolveByName } from '../resolve.ts';
import type { DefineTool } from '../server.ts';

const DEFAULT_WORKOUTS = 10;
const HISTORY_SESSIONS = 5;

export function registerGymTools(defineTool: DefineTool): void {
  defineTool(
    'list_workouts',
    {
      description:
        'Recent gym workouts, newest first: date, duration (or "not finished"), working sets, volume (Σ weight × reps, warm-ups excluded) and the exercises in the order first logged.',
      input: z.object({
        limit: z.number().int().min(1).max(100).optional().describe(`How many workouts. Default ${DEFAULT_WORKOUTS}.`),
      }),
      readOnly: true,
    },
    async ({ limit = DEFAULT_WORKOUTS }) => {
      const [workouts, exercises] = await Promise.all([api.listWorkouts(), api.listExercises()]);
      if (workouts.length === 0) return 'No workouts logged yet.';
      const names = new Map(exercises.map((e) => [e.id, e.name]));
      const shown = workouts.slice(0, limit);
      const lines = [`${plural(shown.length, 'workout')} (of ${workouts.length}):`];
      for (const { workout, exerciseIds, workingSetCount, volumeGrams } of shown) {
        const length = workout.finishedAt
          ? duration(minutesBetween(workout.startedAt, workout.finishedAt))
          : 'not finished';
        const exerciseText = exerciseIds.map((id) => names.get(id) ?? 'unknown exercise').join(', ') || 'no sets';
        lines.push(
          `- ${dayLabel(workout.performedOn)} · ${length} · ${plural(workingSetCount, 'working set')} · ${volume(volumeGrams)} · ${exerciseText} ${idTag(workout.id)}`,
        );
        if (workout.notes) lines.push(`  ${workout.notes}`);
      }
      return lines.join('\n');
    },
  );

  defineTool(
    'get_exercise',
    {
      description:
        "One exercise: its rep range and weight step, the next-weight suggestion (double progression, worked out by the server) and the last 5 sessions with every set (W = warm-up). Weights are kg; dumbbell weights are per hand.",
      input: z.object({
        exercise: z.string().min(1).describe('Exercise name (case-insensitive; a unique prefix is enough) or its id.'),
      }),
      readOnly: true,
    },
    async ({ exercise: query }) => {
      const exercise = resolveByName(await api.listExercises(), query, 'exercise');
      const [history, suggestion] = await Promise.all([
        api.getExerciseHistory(exercise.id, HISTORY_SESSIONS),
        api.getExerciseSuggestion(exercise.id),
      ]);

      const pinned = exercise.repMinOverride !== null ? ', pinned by hand' : ', from the training style';
      const step = exercise.weightStepGrams === 0 ? 'bodyweight, progresses by reps' : `step ${kg(exercise.weightStepGrams)}`;
      const next =
        suggestion.weightGrams === null
          ? `Next: ${suggestion.targetReps} reps at a weight of your choice (${suggestion.action})`
          : `Next: ${kg(suggestion.weightGrams)} × ${suggestion.targetReps} (${suggestion.action})`;
      const lines = [
        `${exercise.name}${exercise.archivedAt ? ' (archived)' : ''} ${idTag(exercise.id)}`,
        `${exercise.muscleGroup} · ${exercise.equipment} · ${exercise.kind} · ${exercise.repMin}–${exercise.repMax} reps${pinned} · ${step}`,
        '',
        next,
        describeSuggestion(suggestion, exercise),
        '',
        history.length > 0 ? `Last ${plural(history.length, 'session')}:` : 'No sessions logged yet.',
        ...history.map((s) => `- ${dayLabel(s.performedOn)} · ${sessionSets(s)}`),
      ];
      return lines.join('\n');
    },
  );
}
