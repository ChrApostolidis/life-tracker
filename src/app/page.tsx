'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDay,
  faCalendarDays,
  faCalendarWeek,
  faDiceD20,
  faFire,
  faInbox,
  faNoteSticky,
  faPlus,
  faTrophy,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/lib/app-context';
import { useGameData } from '@/lib/use-game-data';
import { formatTimeLabel, startOfDay, addDays } from '@/lib/date';
import { greetingWord, pickFlavorLine, pickQuote } from '@/lib/home-copy';
import styles from './home.module.css';

// Kept intentionally close to the app's actual name — a single-user app
// doesn't need an account system to say hello.
const USER_NAME = 'Chris';
const ACHIEVEMENT_RECENT_MS = 48 * 60 * 60 * 1000;

export default function HomePage() {
  const { tasks, overdueTasks, openCapture, setRange } = useApp();
  const { game } = useGameData();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Snapshot needs today's window regardless of whatever range another page
  // last set — declare it explicitly, same pattern every other page follows.
  useEffect(() => {
    setRange(startOfDay(now).toISOString(), startOfDay(addDays(now, 1)).toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRange]);

  const scheduled = tasks.filter((t) => t.scheduledAt);
  const unscheduled = tasks.filter((t) => !t.scheduledAt && !t.completedAt);
  const allVisible = [...unscheduled, ...scheduled];
  const doneCount = allVisible.filter((t) => t.completedAt).length;
  const totalCount = allVisible.length;

  const nextUp = scheduled
    .filter((t) => !t.completedAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];

  const activeStreak = game?.streaks.active.current ?? 0;
  const flavorLine = pickFlavorLine(now, activeStreak);
  const quote = pickQuote(now);

  const recentAchievement = game?.achievements
    .filter((a) => a.unlockedAt && now.getTime() - new Date(a.unlockedAt).getTime() <= ACHIEVEMENT_RECENT_MS)
    .sort((a, b) => new Date(b.unlockedAt!).getTime() - new Date(a.unlockedAt!).getTime())[0];

  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYearNum = Math.floor((startOfDay(now).getTime() - startOfYear.getTime()) / 86_400_000) + 1;
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const totalDaysInYear = isLeap(now.getFullYear()) ? 366 : 365;
  const yearPct = Math.round((dayOfYearNum / totalDaysInYear) * 100);

  return (
    <div className={styles.page}>
      <div className={styles.glow} />

      <header className={styles.hero}>
        <div className={styles.eyebrow}>{dateLabel}</div>
        <h1 className={styles.greeting}>
          Good {greetingWord(now)}, {USER_NAME}.
        </h1>
        <p className={styles.flavor}>{flavorLine}</p>
      </header>

      <div className={styles.quoteCard}>
        <p className={styles.quoteText}>&ldquo;{quote.text}&rdquo;</p>
        <div className={styles.quoteAuthor}>— {quote.author}</div>
      </div>

      <Link href="/today" className={styles.snapshotCard}>
        <div className={styles.snapshotHeader}>
          <span className={styles.snapshotLabel}>Today</span>
          <span className={styles.snapshotOpenHint}>open →</span>
        </div>
        <div className={styles.snapshotStats}>
          <span>
            <span className={styles.snapshotDone}>{doneCount}</span> / {totalCount} done
          </span>
          {overdueTasks.length > 0 && (
            <span className={styles.snapshotOverdue}>{overdueTasks.length} overdue</span>
          )}
          {nextUp && (
            <span className={styles.snapshotNext}>
              Next · {formatTimeLabel(nextUp.scheduledAt!)} {nextUp.title}
            </span>
          )}
        </div>
      </Link>

      {game && (
        <Link href="/stats" className={styles.levelStrip}>
          <div className={styles.levelBadge}>{game.level}</div>
          <div className={styles.levelBody}>
            <div className={styles.levelTitle}>{game.levelTitle}</div>
            <div className={styles.levelXpBar}>
              <div className={styles.levelXpFill} style={{ width: `${Math.round(game.xpProgress * 100)}%` }} />
            </div>
          </div>
          {activeStreak > 0 && (
            <div className={styles.streakChip}>
              <FontAwesomeIcon icon={faFire} className={styles.streakIcon} />
              {activeStreak}
            </div>
          )}
          {recentAchievement && (
            <div className={styles.achievementChip}>
              <FontAwesomeIcon icon={faTrophy} className={styles.achievementIcon} />
              {recentAchievement.title}
            </div>
          )}
        </Link>
      )}

      <div className={styles.tiles}>
        <button type="button" className={styles.tile} onClick={() => openCapture()}>
          <FontAwesomeIcon icon={faPlus} className={styles.tileIcon} />
          <span>Add task</span>
        </button>
        <Link href="/today" className={styles.tile}>
          <FontAwesomeIcon icon={faCalendarDay} className={styles.tileIcon} />
          <span>Today</span>
        </Link>
        <Link href="/week" className={styles.tile}>
          <FontAwesomeIcon icon={faCalendarWeek} className={styles.tileIcon} />
          <span>Week</span>
        </Link>
        <Link href="/month" className={styles.tile}>
          <FontAwesomeIcon icon={faCalendarDays} className={styles.tileIcon} />
          <span>Month</span>
        </Link>
        <Link href="/stats" className={styles.tile}>
          <FontAwesomeIcon icon={faDiceD20} className={styles.tileIcon} />
          <span>Stats</span>
        </Link>
        <Link href="/money" className={styles.tile}>
          <FontAwesomeIcon icon={faWallet} className={styles.tileIcon} />
          <span>Money</span>
        </Link>
        <Link href="/notes" className={styles.tile}>
          <FontAwesomeIcon icon={faNoteSticky} className={styles.tileIcon} />
          <span>Notes</span>
        </Link>
      </div>

      <div className={styles.footer}>
        <span>
          Day {dayOfYearNum} · {yearPct}% of {now.getFullYear()}
        </span>
        {unscheduled.length > 0 && (
          <span className={styles.inboxChip}>
            <FontAwesomeIcon icon={faInbox} className={styles.inboxIcon} />
            {unscheduled.length} in inbox
          </span>
        )}
      </div>
    </div>
  );
}
