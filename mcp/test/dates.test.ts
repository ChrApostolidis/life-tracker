import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  combineDateTime,
  currentStreak,
  dateOf,
  dayLabel,
  daysBetween,
  isDateString,
  isTimeString,
  localMidnightIso,
  timeOf,
  today,
} from '../src/dates.ts';

// The zone config.ts sets at startup; read when the tests run, not at import.
process.env.TZ = 'Europe/Athens';

test('isDateString accepts real days only', () => {
  assert.equal(isDateString('2026-10-28'), true);
  assert.equal(isDateString('2028-02-29'), true);
  assert.equal(isDateString('2026-02-29'), false);
  assert.equal(isDateString('2026-13-01'), false);
  assert.equal(isDateString('2026-1-01'), false);
  assert.equal(isDateString('28/10/2026'), false);
});

test('isTimeString is 24-hour HH:MM', () => {
  assert.equal(isTimeString('00:00'), true);
  assert.equal(isTimeString('23:59'), true);
  assert.equal(isTimeString('24:00'), false);
  assert.equal(isTimeString('9:30'), false);
  assert.equal(isTimeString('09:60'), false);
});

test('addDays crosses month, year and DST boundaries by the calendar', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  // Athens leaves summer time on 2026-10-25.
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
});

test('daysBetween counts whole days, DST included', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-08'), 7);
  assert.equal(daysBetween('2026-10-24', '2026-10-27'), 3);
  assert.equal(daysBetween('2026-10-08', '2026-10-01'), -7);
});

test('localMidnightIso is local midnight as a UTC instant', () => {
  assert.equal(localMidnightIso('2026-07-15'), '2026-07-14T21:00:00.000Z'); // UTC+3 in summer
  assert.equal(localMidnightIso('2026-12-15'), '2026-12-14T22:00:00.000Z'); // UTC+2 in winter
});

test('combineDateTime joins a local date and time, or returns null', () => {
  assert.equal(combineDateTime('2026-10-28', '09:30'), '2026-10-28T07:30:00.000Z');
  assert.equal(combineDateTime('2026-10-28', '9:30'), null);
  assert.equal(combineDateTime('2026-02-30', '09:30'), null);
});

test('dateOf and timeOf read an instant in local time', () => {
  assert.equal(dateOf('2026-10-27T22:30:00Z'), '2026-10-28');
  assert.equal(timeOf('2026-10-27T22:30:00Z'), '00:30');
});

test('today and dayLabel', () => {
  assert.equal(today(new Date('2026-10-27T22:30:00Z')), '2026-10-28');
  assert.equal(dayLabel('2026-10-28'), 'Wed 2026-10-28');
});

test('currentStreak ends today, or yesterday while today is unchecked', () => {
  const days = new Set(['2026-10-25', '2026-10-26', '2026-10-27']);
  assert.equal(currentStreak(days, '2026-10-27'), 3);
  assert.equal(currentStreak(days, '2026-10-28'), 3);
  assert.equal(currentStreak(days, '2026-10-29'), 0);
  assert.equal(currentStreak(new Set(['2026-10-28', '2026-10-26']), '2026-10-28'), 1);
  assert.equal(currentStreak(new Set(), '2026-10-28'), 0);
});
