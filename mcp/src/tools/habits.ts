import { z } from 'zod';
import { api } from '../api.ts';
import { addDays, currentStreak, dayLabel, daysBetween, today } from '../dates.ts';
import { idTag, plural } from '../format.ts';
import { changeNow } from '../offline.ts';
import { resolveByName } from '../resolve.ts';
import type { DefineTool } from '../server.ts';
import { checkRange, dateParam, notFuture, rangeEndParam } from './params.ts';

const DEFAULT_DAYS = 30;
const MAX_RANGE_DAYS = 366;
// How far back a streak is counted; checks are one tiny row per day.
const STREAK_LOOKBACK_DAYS = 366;
// A per-day strip reads well up to about a month; longer ranges get counts only.
const MAX_STRIP_DAYS = 31;

export function registerHabitTools(defineTool: DefineTool): void {
  defineTool(
    'get_habits',
    {
      description:
        'Daily habits (binary: done or not each day) with how many days each was done in a range, a day-by-day strip (oldest → newest, ■ done, □ not) for ranges up to 31 days, and the current streak: consecutive done days ending today, or ending yesterday while today is not checked yet. Defaults to the last 30 days including today. Pass both from and to, or neither.',
      input: z.object({
        from: dateParam('First day included').optional(),
        to: rangeEndParam().optional(),
      }),
      readOnly: true,
    },
    async ({ from, to }) => {
      if ((from === undefined) !== (to === undefined)) throw new Error('Pass both "from" and "to", or neither.');
      const now = today();
      const end = to ?? addDays(now, 1);
      const start = from ?? addDays(end, -DEFAULT_DAYS);
      checkRange(start, end, MAX_RANGE_DAYS);

      // One fetch covers both the range and the streak's lookback.
      const fetchFrom = [start, addDays(now, -STREAK_LOOKBACK_DAYS)].sort()[0]!;
      const fetchTo = [end, addDays(now, 1)].sort().at(-1)!;
      const [habits, checks] = await Promise.all([api.listHabits(), api.listHabitChecks(fetchFrom, fetchTo)]);

      const byHabit = new Map<string, Set<string>>();
      for (const c of checks) {
        if (!byHabit.has(c.habitId)) byHabit.set(c.habitId, new Set());
        byHabit.get(c.habitId)!.add(c.checkedOn);
      }

      const active = habits.filter((h) => h.archivedAt === null);
      const archived = habits.filter((h) => h.archivedAt !== null);
      if (active.length === 0) return 'No active habits.';

      const days = daysBetween(start, end);
      const range = Array.from({ length: days }, (_, i) => addDays(start, i));
      const lines = [`Habits from ${start} to ${end} (exclusive, ${plural(days, 'day')}):`];
      for (const habit of active) {
        const dates = byHabit.get(habit.id) ?? new Set<string>();
        const doneDays = range.filter((d) => dates.has(d)).length;
        const streak = currentStreak(dates, now);
        const streakText = streak >= STREAK_LOOKBACK_DAYS ? `${streak}+` : String(streak);
        const todayText = dates.has(now) ? 'done today' : 'not done today';
        const strip = days <= MAX_STRIP_DAYS ? ` · ${range.map((d) => (dates.has(d) ? '■' : '□')).join('')}` : '';
        lines.push(
          `- ${habit.name} · ${doneDays}/${days} days · streak ${streakText} (${todayText})${strip} ${idTag(habit.id)}`,
        );
      }
      if (archived.length > 0) lines.push('', `Archived: ${archived.map((h) => h.name).join(', ')}`);
      return lines.join('\n');
    },
  );

  defineTool(
    'check_habit',
    {
      description:
        'Mark a daily habit done for a day, or not done (done: false). Today by default; an earlier day backfills it; a future day is refused. Only active (not archived) habits. Never queued: if the server is unreachable nothing changes.',
      input: z.object({
        habit: z.string().min(1).describe('Habit name (case-insensitive; a unique prefix is enough) or its id.'),
        date: dateParam('The day; defaults to today').optional(),
        done: z.boolean().describe('true to check it, false to uncheck it.'),
      }),
      readOnly: false,
    },
    ({ habit: query, date = today(), done }) => {
      notFuture(date, 'a habit');
      return changeNow(async () => {
        const active = (await api.listHabits()).filter((h) => h.archivedAt === null);
        const habit = resolveByName(active, query, 'active habit');
        if (done) await api.checkHabit(habit.id, date);
        else await api.uncheckHabit(habit.id, date);
        return `${done ? 'Checked' : 'Unchecked'} "${habit.name}" for ${dayLabel(date)} ${idTag(habit.id)}`;
      });
    },
  );
}
