// The side panel's Tasks tab: the add box, today's three lists, and the
// click-to-expand preview with its edit form.
import { captureTask, savedMessage } from './lib/capture.js';
import { choiceForDate, describeWhen, formatAgeShort, formatTimeLabel, splitDateTime, toDateInput } from './lib/dates.js';
import { send } from './lib/messages.js';
import { buildTaskEdit } from './lib/task-edit.js';
import { el, setStatus, wireChoiceChips } from './lib/ui.js';
import { attachDictation } from './lib/voice.js';

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const REPEATS = { daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly' };
const WHEN_CHOICES = [
  ['inbox', 'Inbox'],
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['date', 'Pick a date'],
];

const $ = (id) => document.getElementById(id);
const list = $('today-list');
const listStatus = $('today-status');

let today = null; // { overdue, inbox, scheduled } once loaded
let expandedKey = null;
// The edit in progress. Kept here rather than in the form, because the list is
// rebuilt on every render (a tick elsewhere, a refresh) and would wipe the inputs.
let draft = null;
const pending = new Set();
let onQueueChange = () => {};

// An occurrence's identity is (id, date): every occurrence of a series shares the id.
const keyOf = (t) => (t.occurrenceDate ? `${t.id}:${t.occurrenceDate}` : t.id);

// Open first, then done, each in time order: the same order as the web app.
function openFirst(tasks) {
  const byTime = (a, b) => new Date(a.scheduledAt ?? 0) - new Date(b.scheduledAt ?? 0);
  return [...tasks.filter((t) => !t.completedAt).sort(byTime), ...tasks.filter((t) => t.completedAt)];
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderSkeleton() {
  const rows = el('ul', 'rows');
  rows.setAttribute('role', 'status');
  rows.setAttribute('aria-label', 'Loading');
  for (let i = 0; i < 4; i++) {
    const main = el('div', 'row-main');
    main.append(
      el('span', 'skeleton skeleton-circle'),
      el('span', 'skeleton skeleton-time'),
      el('span', 'skeleton skeleton-title'),
    );
    const row = el('li', 'row');
    row.append(main);
    rows.append(row);
  }
  list.replaceChildren(rows);
}

function render() {
  const { overdue, inbox, scheduled } = today;
  const all = [...overdue, ...inbox, ...scheduled];
  const doneCount = all.filter((t) => t.completedAt).length;
  $('today-meta').textContent = all.length ? `${all.length - doneCount} open · ${doneCount} done` : '';

  if (all.length === 0) {
    list.replaceChildren(el('p', 'empty', 'Nothing on today. Add a task above.'));
    return;
  }
  const sections = [];
  // A ticked overdue task stays listed (struck through) until the next refresh,
  // unlike the web app, so a mis-tick can still be undone from here.
  if (overdue.length) {
    const open = overdue.filter((t) => !t.completedAt).length;
    sections.push(section(`Overdue · ${open}`, overdue, (t) => formatAgeShort(t.scheduledAt), 'overdue'));
  }
  if (inbox.length) sections.push(section('Unscheduled', inbox, () => '—'));
  if (scheduled.length) sections.push(section('Schedule', scheduled, (t) => formatTimeLabel(t.scheduledAt)));
  list.replaceChildren(...sections);
}

function section(label, tasks, timeOf, labelClass = '') {
  const wrap = el('div', 'section');
  const rows = el('ul', 'rows');
  for (const task of openFirst(tasks)) rows.append(taskRow(task, timeOf(task), labelClass === 'overdue'));
  wrap.append(el('p', `section-label ${labelClass}`, label), rows);
  return wrap;
}

function taskRow(task, timeLabel, overdue) {
  const key = keyOf(task);
  const done = Boolean(task.completedAt);
  const expanded = expandedKey === key;
  const row = el('li', ['row', done && 'done', expanded && 'expanded'].filter(Boolean).join(' '));

  const check = el('button', 'check');
  check.type = 'button';
  check.innerHTML = CHECK_ICON; // a constant, never data
  check.setAttribute('aria-pressed', String(done));
  check.setAttribute('aria-label', done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`);
  check.disabled = pending.has(key);
  check.addEventListener('click', () => toggleDone(task));

  const title = el('button', 'title-button', task.title);
  title.type = 'button';
  title.setAttribute('aria-expanded', String(expanded));
  title.addEventListener('click', () => {
    expandedKey = expanded ? null : key;
    if (draft && draft.key !== expandedKey) draft = null; // collapsing abandons the edit
    render();
  });

  const main = el('div', 'row-main');
  main.append(check, el('span', 'time', timeLabel), title);
  row.append(main);
  if (expanded) row.append(draft?.key === key ? editForm(task) : preview(task, overdue));
  return row;
}

function preview(task, overdue) {
  const facts = [describeWhen(task.scheduledAt)];
  if (overdue) facts.push(`${formatAgeShort(task.scheduledAt)} overdue`);
  if (task.recurrence) facts.push(REPEATS[task.recurrence]);
  if (task.completedAt) facts.push('Done');
  if (task.source === 'voice') facts.push('Captured by voice');

  const box = el('div', 'details');
  box.append(el('p', 'facts', facts.join(' · ')));
  // What voice actually heard, when it was edited into something else afterwards.
  if (task.source === 'voice' && task.rawTranscript && task.rawTranscript !== task.title) {
    box.append(el('p', 'heard', `Heard: "${task.rawTranscript}"`));
  }
  const edit = el('button', 'link-button', 'Edit');
  edit.type = 'button';
  edit.addEventListener('click', () => {
    draft = startDraft(task);
    render();
  });
  box.append(edit);
  return box;
}

// ── Editing ─────────────────────────────────────────────────────────────────

function startDraft(task) {
  const { date, time } = task.scheduledAt
    ? splitDateTime(task.scheduledAt)
    : { date: toDateInput(new Date()), time: '' };
  return {
    key: keyOf(task),
    title: task.title,
    choice: choiceForDate(task.scheduledAt),
    date,
    // Midnight is how a date without a time is stored, so it shows as no time.
    time: time === '00:00' ? '' : time,
    saving: false,
    error: '',
    focused: false,
  };
}

function editForm(task) {
  const form = el('form', 'edit-form');

  const title = el('textarea', 'text-input');
  title.rows = 2;
  title.value = draft.title;
  title.setAttribute('aria-label', 'Title');
  title.addEventListener('input', () => (draft.title = title.value));
  // Titles are one line in the app, so Enter saves and Escape backs out.
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
    if (e.key === 'Escape') cancelEdit();
  });
  form.append(el('p', 'field-label', 'Title'), title);

  if (task.recurrence) {
    // A series is one row on the server, so there is no editing a single day.
    form.append(
      el('p', 'hint', `${REPEATS[task.recurrence]}. A new title renames every day in the series. Change its schedule in the app.`),
    );
  } else {
    form.append(el('p', 'field-label', 'When'), ...whenFields());
  }

  const actions = el('div', 'edit-actions');
  const cancel = el('button', 'ghost', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', cancelEdit);
  const save = el('button', 'primary', draft.saving ? 'Saving' : 'Save');
  save.type = 'submit';
  save.disabled = draft.saving;
  actions.append(cancel, save);

  form.append(el('p', 'status error', draft.error), actions);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveEdit(task);
  });

  if (!draft.focused) {
    draft.focused = true;
    requestAnimationFrame(() => title.focus());
  }
  return form;
}

function whenFields() {
  const chips = el('div', 'edit-when');
  chips.setAttribute('role', 'radiogroup');
  chips.setAttribute('aria-label', 'When');
  for (const [value, label] of WHEN_CHOICES) {
    const chip = el('button', 'chip', label);
    chip.type = 'button';
    chip.dataset.choice = value;
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(draft.choice === value));
    chips.append(chip);
  }

  const date = el('input', 'text-input compact');
  date.type = 'date';
  date.value = draft.date;
  date.setAttribute('aria-label', 'Date');
  date.addEventListener('input', () => (draft.date = date.value));

  const time = el('input', 'text-input compact');
  time.type = 'time';
  time.value = draft.time;
  time.setAttribute('aria-label', 'Time, optional');
  time.addEventListener('input', () => (draft.time = time.value));

  const showFor = (choice) => {
    date.hidden = choice !== 'date';
    time.hidden = choice === 'inbox';
  };
  showFor(draft.choice);
  wireChoiceChips(chips, (choice) => {
    draft.choice = choice;
    showFor(choice);
  });

  const row = el('div', 'edit-when-row');
  row.append(date, time);
  return [chips, row];
}

function cancelEdit() {
  draft = null;
  render();
}

function failEdit(message) {
  draft.saving = false;
  draft.error = message;
  render();
}

async function saveEdit(task) {
  const { patch, toInbox, error } = buildTaskEdit(task, draft);
  if (error) return failEdit(error);
  if (Object.keys(patch).length === 0 && !toInbox) return cancelEdit();

  draft.saving = true;
  draft.error = '';
  render();
  const result = await send('updateTask', { id: task.id, patch, toInbox });
  if (!result.ok) return failEdit(result.error);

  draft = null;
  expandedKey = null;
  setStatus(listStatus, 'Saved', 'ok');
  // The edit may have moved it to another section, or off today entirely.
  await load();
}

// ── Ticking ─────────────────────────────────────────────────────────────────

// Optimistic, like the web app: flip now, roll back if the server refuses.
async function toggleDone(task) {
  const key = keyOf(task);
  if (pending.has(key)) return;
  const previous = task.completedAt;
  const done = !previous;

  task.completedAt = done ? new Date().toISOString() : null;
  pending.add(key);
  render();

  const result = await send('setDone', { task: { id: task.id, occurrenceDate: task.occurrenceDate }, done });
  pending.delete(key);
  if (result.ok) {
    setStatus(listStatus, '');
  } else {
    task.completedAt = previous;
    setStatus(listStatus, `Could not update "${task.title}": ${result.error}`, 'error');
  }
  render();
}

// ── Loading ─────────────────────────────────────────────────────────────────

export async function load() {
  if (!today) renderSkeleton();
  const result = await send('getToday');

  if (!result.ok) {
    if (today) {
      // Keep what is on screen: stale rows beat an empty panel.
      setStatus(listStatus, `Could not refresh: ${result.error}`, 'error');
      return;
    }
    const message = el('p', 'status error', result.error);
    const retry = el('button', 'link-button retry', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', load);
    message.append(retry);
    list.replaceChildren(message);
    return;
  }

  today = { overdue: result.overdue, inbox: result.inbox, scheduled: result.scheduled };
  // Drop an expansion whose task is no longer on today, e.g. edited onto another day.
  const keys = new Set([...today.overdue, ...today.inbox, ...today.scheduled].map(keyOf));
  if (expandedKey && !keys.has(expandedKey)) expandedKey = null;
  render();
}

export const isEditing = () => draft !== null;

// ── Add a task ──────────────────────────────────────────────────────────────

function initAddTask(getLang) {
  const form = $('add-task');
  const input = $('add-title');
  const status = $('add-status');
  const report = (message, kind, optionsLink) => setStatus(status, message, kind, optionsLink);
  const when = wireChoiceChips($('add-when'), () => input.focus());
  const dictation = getLang ? attachDictation({ field: input, button: $('add-mic'), getLang, report }) : null;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (dictation?.listening) return report('Stop dictating before adding', 'error');
    const title = input.value.trim();
    if (!title) return report('Type a task first', 'error');

    input.disabled = true;
    report('Adding');
    const result = await captureTask(title, when.value, dictation?.rawTranscript ?? null);
    input.disabled = false;
    input.focus();

    if (!result.ok) return report(result.error, 'error', result.error.includes('options'));
    input.value = '';
    if (dictation) dictation.rawTranscript = null;
    report(...savedMessage(result, when.value));
    onQueueChange();
    if (!result.queued) load(); // show it in the list straight away
  });
}

export function initTasks({ getLang, queueChanged }) {
  onQueueChange = queueChanged;
  initAddTask(getLang);
}
