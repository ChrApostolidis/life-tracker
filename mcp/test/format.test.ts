import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, ExerciseSession, Task, WorkoutSet } from '../src/types.ts';
import {
  describeSets,
  describeSuggestion,
  duration,
  euros,
  kg,
  oneLine,
  plural,
  sessionSets,
  taskLine,
  volume,
} from '../src/format.ts';

process.env.TZ = 'Europe/Athens';

function task(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'Write tests',
    scheduledAt: '2026-10-28T07:30:00Z',
    durationMin: null,
    recurrence: null,
    recurrenceDay: null,
    recurrenceUntil: null,
    completedAt: null,
    deletedAt: null,
    source: 'text',
    rawTranscript: null,
    createdAt: '2026-10-27T10:00:00Z',
    updatedAt: '2026-10-27T10:00:00Z',
    occurrenceDate: null,
    ...overrides,
  };
}

function set(weightGrams: number, reps: number, position: number, warmup = false): WorkoutSet {
  return {
    id: `s${position}`,
    workoutId: 'w1',
    exerciseId: 'e1',
    position,
    weightGrams,
    reps,
    warmup,
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

const bench: Exercise = {
  id: 'e1',
  name: 'Bench press',
  muscleGroup: 'chest',
  equipment: 'barbell',
  kind: 'compound',
  repMin: 5,
  repMax: 8,
  repMinOverride: null,
  repMaxOverride: null,
  weightStepGrams: 2500,
  archivedAt: null,
  createdAt: '',
  updatedAt: '',
};

test('euros formats integer cents', () => {
  assert.equal(euros(1250), '€12.50');
  assert.equal(euros(5), '€0.05');
  assert.equal(euros(123456), '€1,234.56');
  assert.equal(euros(-700), '-€7.00');
});

test('kg and volume format integer grams', () => {
  assert.equal(kg(62500), '62.5 kg');
  assert.equal(kg(60000), '60 kg');
  assert.equal(kg(0), 'bodyweight');
  assert.equal(volume(3_420_000), '3,420 kg');
});

test('duration reads like 7h 20m', () => {
  assert.equal(duration(440), '7h 20m');
  assert.equal(duration(45), '45m');
  assert.equal(duration(480), '8h');
  assert.equal(duration(439.6), '7h 20m');
});

test('plural and oneLine', () => {
  assert.equal(plural(1, 'task'), '1 task');
  assert.equal(plural(2, 'entry', 'entries'), '2 entries');
  assert.equal(oneLine('a\n  b'), 'a b');
  assert.equal(oneLine('abcdef', 4), 'abc…');
});

test('taskLine shows state, local time and the id', () => {
  assert.equal(taskLine(task({})), '- [ ] 09:30 Write tests [id:t1]');
  assert.equal(
    taskLine(task({ completedAt: '2026-10-28T08:00:00Z', durationMin: 90 })),
    '- [x] 09:30 Write tests (1h 30m) [id:t1]',
  );
});

test('taskLine treats local midnight as no time', () => {
  assert.equal(taskLine(task({ scheduledAt: '2026-10-27T22:00:00Z' })), '- [ ] no time Write tests [id:t1]');
});

test('an occurrence carries its date in the tag and the ↻ marker', () => {
  assert.equal(
    taskLine(task({ recurrence: 'daily', occurrenceDate: '2026-10-28' })),
    '- [ ] 09:30 Write tests ↻ daily [id:t1 occurrenceDate:2026-10-28]',
  );
});

test('describeSets and sessionSets', () => {
  assert.equal(describeSets([set(60000, 8, 1), set(60000, 8, 2)]), '2 × 8 @ 60 kg');
  assert.equal(describeSets([set(60000, 8, 1), set(60000, 7, 2)]), '60 kg × 8, 7');
  const session: ExerciseSession = {
    workoutId: 'w1',
    performedOn: '2026-10-25',
    sets: [set(60000, 7, 3), set(40000, 10, 1, true), set(60000, 8, 2)],
  };
  assert.equal(sessionSets(session), 'W 40 kg × 10, 60 kg × 8, 60 kg × 7');
});

test('describeSuggestion phrases the server verdict like the /gym page', () => {
  const basedOn: ExerciseSession = {
    workoutId: 'w1',
    performedOn: '2026-10-25',
    sets: [set(40000, 10, 1, true), set(60000, 8, 2), set(60000, 8, 3), set(50000, 12, 4)],
  };
  assert.equal(
    describeSuggestion({ action: 'increase', weightGrams: 62500, targetReps: 5, setCount: 2, basedOn }, bench),
    'Last: 2 × 8 @ 60 kg. Top of the range, so try 62.5 kg for 5.',
  );
  assert.equal(
    describeSuggestion({ action: 'start', weightGrams: null, targetReps: 5, setCount: null, basedOn: null }, bench),
    'New lift. Pick a weight you can do for 5–8 reps.',
  );
});
