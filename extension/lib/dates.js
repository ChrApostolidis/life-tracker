// Ported from the web app's src/lib/date.ts. All local time, like the web app.

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isSameDay(iso, day) {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

export function formatTimeLabel(iso) {
  const d = new Date(iso);
  return [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')].join(':');
}

export function formatAgeShort(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return '<1d';
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

// Date → 'YYYY-MM-DD' in local time.
export function toDateInput(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

// 'YYYY-MM-DD' + 'HH:MM' → ISO instant, or null if either half is malformed.
export function combineDateTime(date, time) {
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function splitDateTime(iso) {
  return { date: toDateInput(new Date(iso)), time: formatTimeLabel(iso) };
}

// The day an Inbox / Today / Tomorrow chip stands for; null means the Inbox.
export function dayForChoice(choice) {
  const today = startOfDay(new Date());
  if (choice === 'today') return today;
  if (choice === 'tomorrow') return addDays(today, 1);
  return null;
}

// Which chip describes an existing date: inbox, today, tomorrow, or date for any other day.
export function choiceForDate(iso) {
  if (!iso) return 'inbox';
  const today = startOfDay(new Date());
  if (isSameDay(iso, today)) return 'today';
  if (isSameDay(iso, addDays(today, 1))) return 'tomorrow';
  return 'date';
}

// "Today at 14:00", "Tomorrow", "Thu, Oct 2 at 09:00". Midnight means no time was
// given: the model has no all-day flag, so a dated capture is stored at 00:00.
export function describeWhen(iso) {
  if (!iso) return 'Inbox, no date';
  const choice = choiceForDate(iso);
  const day =
    choice === 'today'
      ? 'Today'
      : choice === 'tomorrow'
        ? 'Tomorrow'
        : new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = formatTimeLabel(iso);
  return time === '00:00' ? day : `${day} at ${time}`;
}
