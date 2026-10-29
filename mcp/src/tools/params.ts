// Input schemas and checks shared by several tools.

import { z } from 'zod';
import { daysBetween, isDateString, today } from '../dates.ts';

export function dateParam(description: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a local date as YYYY-MM-DD')
    .refine(isDateString, 'Not a real calendar date')
    .describe(`${description}. Local date as YYYY-MM-DD.`);
}

// The end of a half-open range: the first day NOT included.
export function rangeEndParam() {
  return dateParam('End of the range, exclusive: the first day NOT included (for one day, pass the next day)');
}

export function checkRange(from: string, to: string, maxDays: number): void {
  const days = daysBetween(from, to);
  if (days <= 0) throw new Error(`"to" (${to}) must be after "from" (${from}); "to" is exclusive.`);
  if (days > maxDays) throw new Error(`That range is ${days} days; the most this tool returns is ${maxDays}.`);
}

export function timeParam(description: string) {
  return z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time as HH:MM')
    .describe(`${description}. 24-hour local time as HH:MM.`);
}

// No checking off a day not lived yet, the Today view's rule.
export function notFuture(date: string, what: string): void {
  if (date > today()) throw new Error(`${date} is in the future; ${what} can only be logged for today or earlier.`);
}
