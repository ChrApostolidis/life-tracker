import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewTask, checkCategory, nextDayLog, nightInstants, parseEuros } from '../src/writes.ts';
import type { DayNote } from '../src/types.ts';

// The zone config.ts sets at startup; read when the tests run, not at import.
process.env.TZ = 'Europe/Athens';

test('a task with no date goes to the Inbox', () => {
  assert.deepEqual(buildNewTask({ title: ' Buy milk ' }), { title: 'Buy milk', scheduledAt: null, source: 'text' });
});

test('a date with no time is local midnight', () => {
  assert.equal(buildNewTask({ title: 'x', date: '2026-10-29' }).scheduledAt, '2026-10-28T22:00:00.000Z');
});

test('a date and time is that instant', () => {
  assert.equal(buildNewTask({ title: 'x', date: '2026-10-29', time: '09:15' }).scheduledAt, '2026-10-29T07:15:00.000Z');
});

test('weekly repeat takes its weekday from the date', () => {
  const input = buildNewTask({ title: 'x', date: '2026-11-01', repeat: 'weekly', durationMin: 30 });
  assert.equal(input.recurrence, 'weekly');
  assert.equal(input.recurrenceDay, 0); // a Sunday
  assert.equal(input.durationMin, 30);
});

test('daily repeat carries no weekday', () => {
  assert.equal(buildNewTask({ title: 'x', date: '2026-10-29', repeat: 'daily' }).recurrenceDay, undefined);
});

test('a time or a repeat without a date is an error', () => {
  assert.throws(() => buildNewTask({ title: 'x', time: '09:00' }));
  assert.throws(() => buildNewTask({ title: 'x', repeat: 'daily' }));
  assert.throws(() => buildNewTask({ title: '  ' }));
});

test('a bedtime later on the clock than waking is the evening before', () => {
  assert.deepEqual(nightInstants('2026-10-28', '23:40', '07:00'), {
    bedAt: '2026-10-27T21:40:00.000Z',
    wokeAt: '2026-10-28T05:00:00.000Z',
  });
});

test('a bedtime after midnight is the same morning', () => {
  assert.equal(nightInstants('2026-10-28', '00:30', '07:00').bedAt, '2026-10-27T22:30:00.000Z');
});

test('the night the clocks go back is an hour longer', () => {
  // Athens leaves summer time at 04:00 on 2026-10-25.
  const { bedAt, wokeAt } = nightInstants('2026-10-25', '23:00', '07:00');
  assert.equal((new Date(wokeAt).getTime() - new Date(bedAt).getTime()) / 3_600_000, 9);
});

function dayNote(body: string, rating: number | null): DayNote {
  return { id: 'd1', entryDate: '2026-10-28', body, rating, deletedAt: null, createdAt: '', updatedAt: '' };
}

test('append adds after a blank line and keeps the rating', () => {
  assert.deepEqual(nextDayLog(dayNote('Morning was slow.\n', 3), ' Afternoon better. ', undefined, 'append'), {
    body: 'Morning was slow.\n\nAfternoon better.',
    rating: 3,
  });
});

test('append to no log is just the text', () => {
  assert.deepEqual(nextDayLog(null, 'First words', 4, 'append'), { body: 'First words', rating: 4 });
});

test('append with no text changes only the rating', () => {
  assert.deepEqual(nextDayLog(dayNote('Kept', 2), '', 5, 'append'), { body: 'Kept', rating: 5 });
});

test('replace overwrites, and a blank replace leaves a blank body to clear', () => {
  assert.deepEqual(nextDayLog(dayNote('Old', 2), 'New', undefined, 'replace'), { body: 'New', rating: 2 });
  assert.equal(nextDayLog(dayNote('Old', 2), '  ', undefined, 'replace').body, '');
});

test('euros become integer cents, decimal comma included', () => {
  assert.equal(parseEuros('12,50'), 1250);
  assert.equal(parseEuros('12.5'), 1250);
  assert.equal(parseEuros(3), 300);
  assert.equal(parseEuros(0.1), 10);
  assert.equal(parseEuros('€ 4.05'), 405);
  assert.equal(parseEuros('1200'), 120000);
});

test('ambiguous or empty amounts are refused', () => {
  for (const bad of ['1.200,50', '1,2345', '0', '0,00', '-3', 'abc', '', 1e21, 12.345]) {
    assert.throws(() => parseEuros(bad), String(bad));
  }
});

test('categories are checked per type', () => {
  assert.equal(checkCategory('expense', 'Food'), 'food');
  assert.equal(checkCategory('income', undefined), null);
  assert.throws(() => checkCategory('income', 'food'), /salary, gift, other/);
});
