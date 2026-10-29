import { z } from 'zod';
import { api, describeError } from '../api.ts';
import { addDays, dateOf, dayLabel, localMidnightIso, timeOf, today } from '../dates.ts';
import {
  duration,
  idTag,
  inboxLine,
  minutesBetween,
  oneLine,
  overdueLine,
  plural,
  taskLine,
  taskTag,
} from '../format.ts';
import { changeNow, createOrQueue } from '../offline.ts';
import type { DefineTool } from '../server.ts';
import { buildTaskEdit } from '../task-edit.ts';
import type { Task } from '../types.ts';
import { buildNewTask } from '../writes.ts';
import { checkRange, dateParam, rangeEndParam, timeParam } from './params.ts';

const MAX_TASK_RANGE_DAYS = 92;

// Where a task sits: 'the Inbox', 'Tue 2026-10-28 (no time)', 'Tue 2026-10-28 at 09:00'.
function whenText(scheduledAt: string | null): string {
  if (!scheduledAt) return 'the Inbox';
  const time = timeOf(scheduledAt);
  return `${dayLabel(dateOf(scheduledAt))}${time === '00:00' ? ' (no time)' : ` at ${time}`}`;
}

function scheduleSection(tasks: Task[]): string[] {
  if (tasks.length === 0) return ['Schedule: nothing scheduled'];
  const done = tasks.filter((t) => t.completedAt !== null).length;
  return [`Schedule (${tasks.length}, ${done} done):`, ...tasks.map(taskLine)];
}

async function getDay(date: string): Promise<string> {
  const isToday = date === today();
  const isFuture = date > today();
  const next = addDays(date, 1);

  // A future day has no habits, log or sleep yet, the Today view's rule.
  const [tasks, overdue, inbox, habits, checks, dayNote, sleep, entries] = await Promise.all([
    api.listTasks(localMidnightIso(date), localMidnightIso(next)),
    isToday ? api.listOverdue() : Promise.resolve([]),
    api.listInbox(),
    isFuture ? Promise.resolve([]) : api.listHabits(),
    isFuture ? Promise.resolve([]) : api.listHabitChecks(date, next),
    isFuture ? Promise.resolve(null) : api.getDayNote(date),
    isFuture ? Promise.resolve([]) : api.listSleepLogs(date, next),
    api.listJournalEntries(date, next),
  ]);

  const lines = [`${dayLabel(date)}${isToday ? ' (today)' : ''}`, '', ...scheduleSection(tasks)];

  if (overdue.length > 0) lines.push(`Overdue (${overdue.length}):`, ...overdue.map(overdueLine));

  const openInbox = inbox.filter((t) => t.completedAt === null).length;
  lines.push(`Inbox: ${plural(openInbox, 'open item')}${openInbox > 0 ? ' (list_inbox shows them)' : ''}`);

  const active = habits.filter((h) => h.archivedAt === null);
  if (active.length > 0) {
    const checked = new Set(checks.map((c) => c.habitId));
    const doneCount = active.filter((h) => checked.has(h.id)).length;
    lines.push(
      `Habits (${doneCount} of ${active.length} done):`,
      ...active.map((h) => `- ${checked.has(h.id) ? '[x]' : '[ ]'} ${h.name} ${idTag(h.id)}`),
    );
  }

  if (!isFuture) {
    if (dayNote) {
      const rating = dayNote.rating ? ` (rating ${dayNote.rating}/5)` : '';
      lines.push(`Day log${rating}:`, dayNote.body);
    } else {
      lines.push('Day log: none');
    }
    const night = sleep[0];
    lines.push(
      night
        ? `Sleep: ${duration(minutesBetween(night.bedAt, night.wokeAt))} · ${timeOf(night.bedAt)} → ${timeOf(night.wokeAt)}`
        : 'Sleep: not logged',
    );
  }

  if (entries.length > 0) {
    lines.push(
      `Journal entries (${entries.length}, search_journal shows the text):`,
      ...entries.map((e) => `- ${e.title ? oneLine(e.title) : oneLine(e.body, 60)} ${idTag(e.id)}`),
    );
  }
  return lines.join('\n');
}

export function registerTaskTools(defineTool: DefineTool): void {
  defineTool(
    'get_day',
    {
      description:
        "One day at a glance: scheduled tasks (done or open, time, ↻ for recurring), overdue tasks (only when the day is today), the inbox count, habits with that day's checks, the day log, sleep, and the titles of that day's journal entries. The one call a \"how's today\" or \"what did I do on …\" question needs.",
      input: z.object({ date: dateParam('The day to show; defaults to today').optional() }),
      readOnly: true,
    },
    ({ date }) => getDay(date ?? today()),
  );

  defineTool(
    'list_tasks',
    {
      description:
        'Scheduled tasks in a date range, grouped by day, with recurring occurrences already expanded. Recurring rows carry an occurrenceDate in their tag; a task and its occurrence are addressed by that pair. Inbox (undated) tasks are not included: use list_inbox.',
      input: z.object({
        from: dateParam('First day included'),
        to: rangeEndParam(),
      }),
      readOnly: true,
    },
    async ({ from, to }) => {
      checkRange(from, to, MAX_TASK_RANGE_DAYS);
      const tasks = await api.listTasks(localMidnightIso(from), localMidnightIso(to));
      if (tasks.length === 0) return `No scheduled tasks from ${from} to ${to} (exclusive).`;
      const done = tasks.filter((t) => t.completedAt !== null).length;
      const lines = [`${plural(tasks.length, 'task')} from ${from} to ${to} (exclusive), ${done} done:`];
      let day = '';
      for (const task of tasks) {
        const taskDay = dateOf(task.scheduledAt!);
        if (taskDay !== day) {
          day = taskDay;
          lines.push('', `${dayLabel(day)}:`);
        }
        lines.push(taskLine(task));
      }
      return lines.join('\n');
    },
  );

  defineTool(
    'list_inbox',
    {
      description: 'Open inbox tasks: unscheduled, captured without a date. Newest first.',
      input: z.object({}),
      readOnly: true,
    },
    async () => {
      const inbox = await api.listInbox();
      const open = inbox.filter((t) => t.completedAt === null);
      const done = inbox.length - open.length;
      if (open.length === 0) return 'The inbox is empty.';
      const footer = done > 0 ? ['', `(${plural(done, 'finished item')} not shown)`] : [];
      return [`Inbox (${open.length} open):`, ...open.map(inboxLine), ...footer].join('\n');
    },
  );

  defineTool(
    'list_overdue',
    {
      description:
        'Open tasks scheduled before today, oldest first, from any day. Recurring tasks never appear here: a missed occurrence simply recurs.',
      input: z.object({}),
      readOnly: true,
    },
    async () => {
      const overdue = await api.listOverdue();
      if (overdue.length === 0) return 'Nothing is overdue.';
      return [`Overdue (${overdue.length}):`, ...overdue.map(overdueLine)].join('\n');
    },
  );

  defineTool(
    'add_task',
    {
      description:
        'Add a task. No date puts it in the Inbox (unsorted, no time). A date without a time schedules it for that day with no time. ' +
        'repeat makes it a recurring series starting on the date (weekly repeats on that weekday). ' +
        'If the server is unreachable the task is queued on this PC and sent later: a "Queued" answer means it is NOT saved yet.',
      input: z.object({
        title: z.string().min(1).describe('What the task is.'),
        date: dateParam('The day it is scheduled for; leave out for the Inbox').optional(),
        time: timeParam('Time of day; needs a date').optional(),
        durationMin: z.number().int().min(1).max(1440).optional().describe('Expected length in minutes.'),
        repeat: z.enum(['daily', 'weekly', 'monthly']).optional().describe('Repeat from the date onwards; needs a date.'),
      }),
      readOnly: false,
    },
    async (args) => {
      const input = buildNewTask(args);
      const repeats = input.recurrence ? `, repeating ${input.recurrence}` : '';
      const summary = `task "${input.title}" for ${whenText(input.scheduledAt)}${repeats}`;
      return createOrQueue('task', input, summary, (task: Task) => `Added ${summary} ${idTag(task.id)}`);
    },
  );

  defineTool(
    'set_task_done',
    {
      description:
        'Tick a task done, or untick it (done: false). For a day of a recurring task pass its occurrenceDate, shown in list results as [id:… occurrenceDate:YYYY-MM-DD]; that ticks only that day. Never queued: if the server is unreachable nothing changes.',
      input: z.object({
        id: z.string().min(1).describe('The task id from a list result.'),
        occurrenceDate: dateParam('For a recurring task, which day of the series').optional(),
        done: z.boolean().describe('true to mark done, false to mark not done.'),
      }),
      readOnly: false,
    },
    ({ id, occurrenceDate, done }) =>
      changeNow(async () => {
        if (!occurrenceDate) {
          const task = await api.getTask(id);
          if (task.recurrence) {
            throw new Error(
              `"${task.title}" is a recurring task: pass occurrenceDate (list results show it as occurrenceDate:YYYY-MM-DD) to tick one day of it.`,
            );
          }
        }
        const task = await api.setTaskDone(id, done, occurrenceDate);
        const day = occurrenceDate ? ` for ${dayLabel(occurrenceDate)}` : '';
        return `Marked "${task.title}"${day} ${done ? 'done' : 'not done'} ${taskTag(task)}`;
      }),
  );

  defineTool(
    'edit_task',
    {
      description:
        'Rename or reschedule a task. Only what you pass changes. date "inbox" moves it back to the Inbox; a new date with no time keeps its current time of day (midnight, i.e. no time, if it had none). ' +
        'A recurring task can only be renamed, which renames every day of the series; its schedule is edited in the web app. Never queued: if the server is unreachable nothing changes.',
      input: z.object({
        id: z.string().min(1).describe('The task id from a list result (for a recurring task, the id alone, without occurrenceDate).'),
        title: z.string().min(1).optional().describe('New title.'),
        date: z
          .union([z.literal('inbox'), dateParam('New day')])
          .optional()
          .describe('New day as YYYY-MM-DD, or "inbox" to unschedule it.'),
        time: timeParam('New time of day; keeps the day unless date is given too').optional(),
      }),
      readOnly: false,
    },
    ({ id, title, date, time }) =>
      changeNow(async () => {
        const task = await api.getTask(id);
        const edit = buildTaskEdit(task, { title, date, time });
        if ('error' in edit) throw new Error(edit.error);
        const { patch, toInbox } = edit;
        if (!toInbox && Object.keys(patch).length === 0) {
          return `Nothing to change: "${task.title}" is already like that, in ${whenText(task.scheduledAt)} ${idTag(task.id)}`;
        }
        let updated = task;
        if (toInbox) updated = await api.unscheduleTask(id);
        if (Object.keys(patch).length > 0) {
          try {
            updated = await api.patchTask(id, patch);
          } catch (e) {
            // Unscheduling already went through, so "nothing changed" would be wrong.
            if (toInbox) throw new Error(`Moved to the Inbox, but the rename failed: ${describeError(e)}`);
            throw e;
          }
        }
        const changes = [];
        if (patch.title) changes.push(`renamed to "${updated.title}"`);
        if (toInbox || patch.scheduledAt) changes.push(`moved to ${whenText(updated.scheduledAt)}`);
        return `Task ${changes.join(' and ')} ${idTag(updated.id)}`;
      }),
  );
}
