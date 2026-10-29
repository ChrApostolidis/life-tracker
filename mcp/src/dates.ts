// Local-date helpers, after the web app's src/lib/date.ts. Everything is local
// time: config.ts sets process.env.TZ before any of this runs.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Date → 'YYYY-MM-DD' in local time.
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// True only for a real calendar day, so '2026-02-30' is rejected rather than rolled over.
export function isDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDateInput(d) === s;
}

export function isTimeString(s: string): boolean {
  return TIME_RE.test(s);
}

// 'YYYY-MM-DD' → local Date at 00:00. Callers validate first.
export function fromDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function today(now: Date = new Date()): string {
  return toDateInput(now);
}

// Calendar arithmetic, not +24h, so a DST change never skips or repeats a day.
export function addDays(date: string, n: number): string {
  const d = fromDateInput(date);
  d.setDate(d.getDate() + n);
  return toDateInput(d);
}

// Whole days from a to b ('2026-10-01' → '2026-10-08' is 7).
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

// Local midnight of a day as an ISO instant, for the task range endpoints.
export function localMidnightIso(date: string): string {
  return fromDateInput(date).toISOString();
}

// 'YYYY-MM-DD' + 'HH:MM' → ISO instant, or null if either half is malformed.
export function combineDateTime(date: string, time: string): string | null {
  if (!isDateString(date) || !isTimeString(time)) return null;
  const [h, min] = time.split(':').map(Number) as [number, number];
  const d = fromDateInput(date);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

// ISO instant → local 'YYYY-MM-DD'.
export function dateOf(iso: string): string {
  return toDateInput(new Date(iso));
}

// ISO instant → local 'HH:MM'.
export function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 'Tue 2026-10-28'
export function dayLabel(date: string): string {
  const weekday = fromDateInput(date).toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${date}`;
}

// Consecutive checked days ending today, or ending yesterday while today is not
// checked yet: an unchecked morning should not read as a broken streak.
export function currentStreak(checked: Set<string>, todayDate: string): number {
  let day = checked.has(todayDate) ? todayDate : addDays(todayDate, -1);
  let streak = 0;
  while (checked.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}
