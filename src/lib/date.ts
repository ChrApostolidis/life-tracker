export function isSameDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

// "YYYY-MM-DD" + "HH:MM" → ISO string
export function combineDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

// Date → "YYYY-MM-DD" in local time — the date half that combineDateTime expects.
export function toDateInput(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ISO string → { date: "YYYY-MM-DD", time: "HH:MM" }
export function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const time = [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join(':');
  return { date: toDateInput(d), time };
}

// ISO string → "HH:MM" for timeline labels
export function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  return [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join(':');
}

// Start of the given day in local time (00:00:00.000).
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// Monday-based start of the week, local, 00:00:00.000.
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const daysSinceMonday = (x.getDay() + 6) % 7; // getDay(): 0=Sun … 6=Sat
  x.setDate(x.getDate() - daysSinceMonday);
  return x;
}

// "YYYY-MM-DD" → local Date at start of day. Malformed input → Invalid Date.
export function fromDateInput(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

// First of the month, local, 00:00:00.000.
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Meant for month-start anchors — a day-of-month past 28 could overflow into
// the month after the intended one.
export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

// "July 2026"
export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Mon-anchored week → "Jun 30 – Jul 6"
export function formatWeekRange(weekStart: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const end = addDays(weekStart, 6);
  return `${weekStart.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

// ISO string (in the past) → compact age for narrow columns: "<1d" / "2d" / "3w" / "5mo"
export function formatAgeShort(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return '<1d';
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

// ISO string → "just now" / "5m ago" / "2h ago" / "3d ago" / "Jun 30"
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
