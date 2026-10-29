// Ported from extension/lib/task-edit.js (buildTaskEdit). There the form always
// carries a full choice; here an absent field means "leave it as it is".

import { combineDateTime, dateOf, timeOf } from './dates.ts';
import type { Task, TaskPatch } from './types.ts';

export type TaskEditDraft = {
  title?: string;
  // 'inbox' moves the task out of the schedule.
  date?: string | 'inbox';
  // Blank keeps the task's existing time of day.
  time?: string;
};

export type TaskEdit = { patch: TaskPatch; toInbox: boolean } | { error: string };

export function buildTaskEdit(task: Task, draft: TaskEditDraft): TaskEdit {
  const patch: TaskPatch = {};
  if (draft.title !== undefined) {
    const title = draft.title.trim();
    if (!title) return { error: 'A task needs a title.' };
    if (title !== task.title) patch.title = title;
  }

  const time = draft.time?.trim() || undefined;
  if (draft.date === undefined && time === undefined) return { patch, toInbox: false };

  // A series is one row on the server; moving it here would move every day of it.
  if (task.recurrence) {
    return {
      error:
        'This is a recurring task: only its title can be changed here (that renames every day of the series). Its schedule is edited in the web app.',
    };
  }

  if (draft.date === 'inbox') {
    if (time !== undefined) return { error: 'An Inbox task has no time. Pass a date with the time, or leave the time out.' };
    return { patch, toInbox: Boolean(task.scheduledAt) };
  }

  const day = draft.date ?? (task.scheduledAt ? dateOf(task.scheduledAt) : null);
  if (!day) return { error: 'This task is in the Inbox, so a time needs a date too.' };
  // The capture modal's rule: a blank time keeps the existing time of day, and
  // a task that had no date starts at midnight.
  const fallback = task.scheduledAt ? timeOf(task.scheduledAt) : '00:00';
  const scheduledAt = combineDateTime(day, time ?? fallback);
  if (!scheduledAt) return { error: 'Use a date as YYYY-MM-DD and a time as HH:MM.' };

  const moved = !task.scheduledAt || new Date(scheduledAt).getTime() !== new Date(task.scheduledAt).getTime();
  if (moved) patch.scheduledAt = scheduledAt;
  return { patch, toInbox: false };
}
