// The pure rules behind the write tools, apart from them so they test without HTTP.
// Each throws an Error whose message is the tool's answer.

import { addDays, combineDateTime, fromDateInput, localMidnightIso } from './dates.ts';
import type { DayNote, MoneyEntryType, Recurrence, TaskInput } from './types.ts';

export type NewTask = {
  title: string;
  date?: string;
  time?: string;
  durationMin?: number;
  repeat?: Recurrence;
};

// No date → Inbox. A date with no time is local midnight, the capture modal's
// rule. Weekly takes its weekday from the date (0 = Sunday).
export function buildNewTask({ title, date, time, durationMin, repeat }: NewTask): TaskInput {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('A task needs a title.');
  if (!date) {
    if (time) throw new Error('A time needs a date too. Leave both out to put the task in the Inbox.');
    if (repeat) throw new Error('A repeating task needs a start date.');
  }
  let scheduledAt: string | null = null;
  if (date) {
    scheduledAt = time ? combineDateTime(date, time) : localMidnightIso(date);
    if (!scheduledAt) throw new Error('Use a date as YYYY-MM-DD and a time as HH:MM.');
  }
  const input: TaskInput = { title: trimmed, scheduledAt, source: 'text' };
  if (durationMin !== undefined) input.durationMin = durationMin;
  if (repeat) {
    input.recurrence = repeat;
    if (repeat === 'weekly') input.recurrenceDay = fromDateInput(date!).getDay();
  }
  return input;
}

// The sleep card's rule: the night belongs to the morning woken, and a bedtime
// later on the clock than the wake time (or equal) was the evening before.
export function nightInstants(date: string, bed: string, woke: string): { bedAt: string; wokeAt: string } {
  const bedDay = bed >= woke ? addDays(date, -1) : date;
  const bedAt = combineDateTime(bedDay, bed);
  const wokeAt = combineDateTime(date, woke);
  if (!bedAt || !wokeAt) throw new Error('Use times as HH:MM, 24-hour.');
  return { bedAt, wokeAt };
}

export type DayLogMode = 'append' | 'replace';

// Append adds the text after what is there with a blank line between. A rating
// left out keeps the existing one, since the upsert would otherwise clear it.
export function nextDayLog(
  existing: DayNote | null,
  body: string,
  rating: number | undefined,
  mode: DayLogMode,
): { body: string; rating: number | null } {
  const addition = body.trim();
  const before = existing?.body.trimEnd() ?? '';
  let text = addition;
  if (mode === 'append' && before.trim()) text = addition ? `${before}\n\n${addition}` : before;
  return { body: text, rating: rating ?? existing?.rating ?? null };
}

const EUROS_RE = /^(\d+)(?:[.,](\d{1,2}))?$/;

// Euros → integer cents. Accepts a decimal comma ('12,50') and a leading €;
// rejects anything ambiguous ('1.200,50', three decimals) rather than guess.
export function parseEuros(amount: number | string): number {
  const text = String(amount).trim().replace(/^€\s*/, '').replace(/\s*€$/, '');
  const m = EUROS_RE.exec(text);
  if (!m) throw new Error(`"${amount}" is not an amount in euros. Use digits with at most two decimals, like 12.50 or 12,50.`);
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (cents <= 0) throw new Error('The amount must be more than zero.');
  if (!Number.isSafeInteger(cents) || cents > 2_147_483_647) throw new Error('That amount is too large.');
  return cents;
}

// The backend's whitelist (MoneyEntryService), the same lists as the web app's lib/money.ts.
export const MONEY_CATEGORIES: Record<MoneyEntryType, readonly string[]> = {
  expense: ['food', 'transport', 'fun', 'bills', 'other'],
  income: ['salary', 'gift', 'other'],
};

export function checkCategory(type: MoneyEntryType, category: string | undefined): string | null {
  if (category === undefined || !category.trim()) return null;
  const wanted = category.trim().toLowerCase();
  const allowed = MONEY_CATEGORIES[type];
  if (!allowed.includes(wanted)) {
    throw new Error(`"${category}" is not a${type === 'income' ? 'n income' : 'n expense'} category. Use one of: ${allowed.join(', ')}.`);
  }
  return wanted;
}
