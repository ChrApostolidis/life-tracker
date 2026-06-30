import { formatTimeLabel } from "./date";
import { Task } from "./types";

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
    const end =
      i + 1 < sorted.length
        ? timeToMins(formatTimeLabel(sorted[i + 1].scheduledAt!))
        : start + 120;
    if (mins >= start && mins < end) return sorted[i].id;
  }
  return null;
}
