import { formatTimeLabel } from "./date";
import { Task } from "./types";


export function taskKey(t: Task): string {
  return t.occurrenceDate ? `${t.id}:${t.occurrenceDate}` : t.id;
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function getNowId(scheduled: Task[], now: Date): string | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  const sorted = [...scheduled].sort(
    (a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
  );
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].completedAt) continue;
    const start = timeToMins(formatTimeLabel(sorted[i].scheduledAt!));
    // The last row of the day has no next start to bound it, so fall back to
    // its own duration and only then to a flat two hours.
    const end =
      i + 1 < sorted.length
        ? timeToMins(formatTimeLabel(sorted[i + 1].scheduledAt!))
        : start + (sorted[i].durationMin ?? 120);
    if (mins >= start && mins < end) return taskKey(sorted[i]);
  }
  return null;
}
