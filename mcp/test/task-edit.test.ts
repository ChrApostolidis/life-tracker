import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskEdit } from '../src/task-edit.ts';
import type { Task } from '../src/types.ts';

// The zone config.ts sets at startup; read when the tests run, not at import.
process.env.TZ = 'Europe/Athens';

function task(fields: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Call mum',
    scheduledAt: '2026-10-28T07:30:00.000Z', // 09:30 in Athens (winter time)
    durationMin: null,
    recurrence: null,
    recurrenceDay: null,
    recurrenceUntil: null,
    completedAt: null,
    deletedAt: null,
    source: 'text',
    rawTranscript: null,
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    occurrenceDate: null,
    ...fields,
  };
}

test('only a changed title is patched', () => {
  assert.deepEqual(buildTaskEdit(task(), { title: '  Call dad ' }), { patch: { title: 'Call dad' }, toInbox: false });
  assert.deepEqual(buildTaskEdit(task(), { title: 'Call mum' }), { patch: {}, toInbox: false });
});

test('a blank title is an error', () => {
  assert.ok('error' in buildTaskEdit(task(), { title: '   ' }));
});

test('a new date with no time keeps the time of day, across a DST change too', () => {
  assert.deepEqual(buildTaskEdit(task(), { date: '2026-10-20' }), {
    patch: { scheduledAt: '2026-10-20T06:30:00.000Z' }, // 09:30 in summer time
    toInbox: false,
  });
});

test('a new time with no date keeps the day', () => {
  assert.deepEqual(buildTaskEdit(task(), { time: '14:00' }), {
    patch: { scheduledAt: '2026-10-28T12:00:00.000Z' },
    toInbox: false,
  });
});

test('the same date and time patches nothing', () => {
  assert.deepEqual(buildTaskEdit(task(), { date: '2026-10-28', time: '09:30' }), { patch: {}, toInbox: false });
});

test('an Inbox task given a date starts at midnight', () => {
  assert.deepEqual(buildTaskEdit(task({ scheduledAt: null }), { date: '2026-10-29' }), {
    patch: { scheduledAt: '2026-10-28T22:00:00.000Z' },
    toInbox: false,
  });
});

test('an Inbox task given only a time is an error', () => {
  assert.ok('error' in buildTaskEdit(task({ scheduledAt: null }), { time: '10:00' }));
});

test('inbox unschedules a scheduled task, and is a no-op for one already there', () => {
  assert.deepEqual(buildTaskEdit(task(), { date: 'inbox' }), { patch: {}, toInbox: true });
  assert.deepEqual(buildTaskEdit(task({ scheduledAt: null }), { date: 'inbox' }), { patch: {}, toInbox: false });
});

test('inbox with a time is an error', () => {
  assert.ok('error' in buildTaskEdit(task(), { date: 'inbox', time: '10:00' }));
});

test('a recurring task can be renamed but not moved', () => {
  const series = task({ recurrence: 'daily' });
  assert.deepEqual(buildTaskEdit(series, { title: 'Stretch' }), { patch: { title: 'Stretch' }, toInbox: false });
  for (const draft of [{ date: '2026-10-30' }, { time: '07:00' }, { date: 'inbox' }, { title: 'Stretch', time: '07:00' }]) {
    const edit = buildTaskEdit(series, draft);
    assert.ok('error' in edit && /web app/.test(edit.error), JSON.stringify(draft));
  }
});

test('a blank time counts as no time', () => {
  assert.deepEqual(buildTaskEdit(task(), { time: '' }), { patch: {}, toInbox: false });
});
