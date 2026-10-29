import { z } from 'zod';
import { api } from '../api.ts';
import { addDays, dayLabel, timeOf, today } from '../dates.ts';
import { duration, minutesBetween } from '../format.ts';
import { changeNow } from '../offline.ts';
import type { DefineTool } from '../server.ts';
import { nightInstants } from '../writes.ts';
import { dateParam, notFuture, timeParam } from './params.ts';

const DEFAULT_NIGHTS = 7;

export function registerSleepTools(defineTool: DefineTool): void {
  defineTool(
    'get_sleep',
    {
      description:
        'Sleep for the last N nights, newest first, each as hours slept plus bed → wake times, then the average over the logged nights. A night belongs to the morning you woke: Sun 23:40 → Mon 07:00 is Monday. Nights with nothing logged are listed as such.',
      input: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(366)
          .optional()
          .describe(`How many nights back from today, today included. Default ${DEFAULT_NIGHTS}.`),
      }),
      readOnly: true,
    },
    async ({ days = DEFAULT_NIGHTS }) => {
      const end = addDays(today(), 1);
      const start = addDays(end, -days);
      const logs = await api.listSleepLogs(start, end);
      const byDate = new Map(logs.map((l) => [l.sleepDate, l]));

      const lines: string[] = [];
      let total = 0;
      for (let day = addDays(end, -1); day >= start; day = addDays(day, -1)) {
        const night = byDate.get(day);
        if (!night) {
          lines.push(`- ${dayLabel(day)} · not logged`);
          continue;
        }
        const minutes = minutesBetween(night.bedAt, night.wokeAt);
        total += minutes;
        lines.push(`- ${dayLabel(day)} · ${duration(minutes)} · ${timeOf(night.bedAt)} → ${timeOf(night.wokeAt)}`);
      }
      const summary =
        logs.length > 0
          ? `Average ${duration(total / logs.length)} over ${logs.length} of ${days} nights logged.`
          : `No nights logged in the last ${days}.`;
      return [`Sleep, last ${days} nights:`, ...lines, '', summary].join('\n');
    },
  );

  defineTool(
    'log_sleep',
    {
      description:
        'Log one night of sleep, replacing whatever that night had. date is the morning woken (Sun 23:40 → Mon 07:00 is Monday). ' +
        'A bedtime later on the clock than the wake time means the evening before; an earlier one (00:30 → 07:00) means after midnight. Answers with the hours slept. Never queued: if the server is unreachable nothing changes.',
      input: z.object({
        bed: timeParam('When you went to sleep'),
        woke: timeParam('When you woke up'),
        date: dateParam('The morning woken; defaults to today').optional(),
      }),
      readOnly: false,
    },
    ({ bed, woke, date = today() }) => {
      notFuture(date, 'sleep');
      const night = nightInstants(date, bed, woke);
      return changeNow(async () => {
        const saved = await api.saveSleepLog(date, night);
        const slept = duration(minutesBetween(saved.bedAt, saved.wokeAt));
        return `Logged sleep for ${dayLabel(date)}: ${slept} · ${timeOf(saved.bedAt)} → ${timeOf(saved.wokeAt)}`;
      });
    },
  );
}
