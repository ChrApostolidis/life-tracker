// Turns an edit form's values into the calls the backend needs. Pure, so it
// can be tested without a browser.
import { combineDateTime, dayForChoice, formatTimeLabel, toDateInput } from './dates.js';

// draft: { title, choice: 'inbox' | 'today' | 'tomorrow' | 'date', date, time }.
// Returns { patch, toInbox } or { error }. PATCH treats null as "unchanged", so
// only what changed is sent, and moving to the Inbox is its own unschedule call.
export function buildTaskEdit(task, draft) {
  const title = draft.title.trim();
  if (!title) return { error: 'A task needs a title' };

  const patch = {};
  if (title !== task.title) patch.title = title;

  // A series is one row on the server, so its schedule is never edited from here.
  if (task.recurrence) return { patch, toInbox: false };

  if (draft.choice === 'inbox') return { patch, toInbox: Boolean(task.scheduledAt) };

  const day = draft.choice === 'date' ? draft.date : toDateInput(dayForChoice(draft.choice));
  // Same rule as the capture modal: a blank time keeps the task's existing time
  // of day, and a task that had no date starts at midnight.
  const fallback = task.scheduledAt ? formatTimeLabel(task.scheduledAt) : '00:00';
  const scheduledAt = combineDateTime(day, draft.time || fallback);
  if (!scheduledAt) return { error: 'Pick a date first' };

  const moved = !task.scheduledAt || new Date(scheduledAt).getTime() !== new Date(task.scheduledAt).getTime();
  if (moved) patch.scheduledAt = scheduledAt;
  return { patch, toInbox: false };
}
