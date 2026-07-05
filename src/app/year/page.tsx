'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { toDateInput } from '@/lib/date';
import PeriodNav from '@/app/components/PeriodNav';
import styles from './year.module.css';

const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const LEVEL_CLASSES = [styles.level0, styles.level1, styles.level2, styles.level3];

type DayStats = { total: number; done: number };
type StatsByDay = Map<string, DayStats>;

// Completion → density: no tasks, under half done, partially done, all done.
function levelOf(stats: DayStats | undefined): 0 | 1 | 2 | 3 {
  if (!stats || stats.total === 0) return 0;
  const ratio = stats.done / stats.total;
  if (ratio < 0.5) return 1;
  if (ratio < 1) return 2;
  return 3;
}

function tooltip(date: Date, stats: DayStats | undefined): string {
  const label = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return stats ? `${label} · ${stats.done}/${stats.total} done` : `${label} · no tasks`;
}

export default function YearPage() {
  const { tasks, loading, error, setRange } = useApp();
  const router = useRouter();
  const [year, setYear] = useState(() => new Date().getFullYear());

  const from = new Date(year, 0, 1).toISOString();
  const to = new Date(year + 1, 0, 1).toISOString();

  useEffect(() => {
    setRange(from, to);
  }, [from, to, setRange]);

  // Per-day completed/total buckets, keyed "YYYY-MM-DD" (local).
  const statsByDay: StatsByDay = useMemo(() => {
    const map: StatsByDay = new Map();
    tasks.forEach((t) => {
      if (!t.scheduledAt) return;
      const key = toDateInput(new Date(t.scheduledAt));
      const stats = map.get(key) ?? { total: 0, done: 0 };
      stats.total += 1;
      if (t.completedAt) stats.done += 1;
      map.set(key, stats);
    });
    return map;
  }, [tasks]);

  const yearTotals = useMemo(() => {
    let total = 0;
    let done = 0;
    statsByDay.forEach((s) => {
      total += s.total;
      done += s.done;
    });
    return { daysTracked: statsByDay.size, total, done };
  }, [statsByDay]);

  const now = new Date();
  const todayKey = toDateInput(now);
  const completionPct =
    yearTotals.total > 0 ? Math.round((yearTotals.done / yearTotals.total) * 100) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Year</div>
          <h1 className={styles.yearLabel}>{year}</h1>
          <div className={styles.stats}>
            <span className={styles.statsStrong}>{yearTotals.daysTracked}</span> days tracked
            {completionPct !== null && <> · {completionPct}% completion rate</>}
          </div>
        </div>
        <div className={styles.headerRight}>
          <PeriodNav
            onPrev={() => setYear((y) => y - 1)}
            onToday={() => setYear(new Date().getFullYear())}
            onNext={() => setYear((y) => y + 1)}
          />
          <div className={styles.legend}>
            <span>less</span>
            {LEVEL_CLASSES.map((level) => (
              <div key={level} className={`${styles.legendSquare} ${level}`} />
            ))}
            <span>more</span>
          </div>
        </div>
      </header>

      {error && <div className={styles.message}>{error}</div>}
      {!error && loading && tasks.length === 0 && <div className={styles.message}>Loading…</div>}

      <div className={styles.panels}>
        {MONTHS.map((month) => (
          <MonthPanel
            key={month}
            year={year}
            month={month}
            current={year === now.getFullYear() && month === now.getMonth()}
            todayKey={todayKey}
            statsByDay={statsByDay}
            onDayClick={(key) => router.push(`/day/${key}`)}
          />
        ))}
      </div>
    </div>
  );
}

type PanelProps = {
  year: number;
  month: number; // 0–11
  current: boolean;
  todayKey: string;
  statsByDay: StatsByDay;
  onDayClick: (key: string) => void;
};

function MonthPanel({ year, month, current, todayKey, statsByDay, onDayClick }: PanelProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const name = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' });

  let total = 0;
  let done = 0;
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month, i + 1);
    const key = toDateInput(date);
    const stats = statsByDay.get(key);
    if (stats) {
      total += stats.total;
      done += stats.done;
    }
    return { date, key, stats };
  });
  const pct = total > 0 ? `${Math.round((done / total) * 100)}%` : '—';

  return (
    <div className={[styles.panel, current ? styles.panelCurrent : ''].filter(Boolean).join(' ')}>
      <div className={styles.panelHeader}>
        <span className={styles.monthName}>{name}</span>
        <span className={styles.monthPct}>{pct}</span>
      </div>
      <div className={styles.squares}>
        {days.map(({ date, key, stats }) => (
          <div
            key={key}
            className={[
              styles.square,
              LEVEL_CLASSES[levelOf(stats)],
              key === todayKey ? styles.squareToday : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={tooltip(date, stats)}
            aria-label={tooltip(date, stats)}
            onClick={() => onDayClick(key)}
          />
        ))}
      </div>
    </div>
  );
}
