'use client';

import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { useTodayProgress } from '@/lib/use-today-progress';
import styles from './todayRing.module.css';

const SIZE = 44;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Sidebar footer widget: a circular progress ring for today's task completion,
// visible on every screen. Links to the Today view.
export default function TodayRing() {
  const { taskRevision } = useApp();
  const { total, done } = useTodayProgress(taskRevision);

  const ratio = total > 0 ? done / total : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);
  const complete = total > 0 && done === total;

  const label =
    total === 0 ? 'No tasks today' : complete ? 'All done today' : `${done} of ${total} done`;

  return (
    <Link href="/today" className={styles.wrap} aria-label={`Today, ${label}`}>
      <div className={styles.ring}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle
            className={styles.track}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
          />
          <circle
            className={complete ? styles.progressDone : styles.progress}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </svg>
        <span className={styles.count}>{total > 0 ? `${done}/${total}` : '—'}</span>
      </div>
      <div className={styles.meta}>
        <div className={styles.title}>Today</div>
        <div className={styles.sub}>{label}</div>
      </div>
    </Link>
  );
}
