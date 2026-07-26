'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFire, faListCheck, faLock, faNoteSticky, faTrophy, faWallet } from '@fortawesome/free-solid-svg-icons';
import { useGameData } from '@/lib/use-game-data';
import type { Achievement, Attributes, RecentDay, StreakInfo } from '@/lib/game';
import styles from './stats.module.css';

const ATTRIBUTE_AXES: { key: keyof Attributes; label: string }[] = [
  { key: 'discipline', label: 'Discipline' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'wealth', label: 'Wealth' },
  { key: 'reflection', label: 'Reflection' },
];

export default function StatsPage() {
  const { loading, error, game } = useGameData();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Character</div>
        {game && (
          <>
            <div className={styles.levelRow}>
              <div className={styles.levelBadge}>{game.level}</div>
              <div>
                <h1 className={styles.title}>{game.levelTitle}</h1>
                <div className={styles.xpMeta}>
                  {game.totalXp.toLocaleString()} XP
                  {game.todayXp > 0 && <span className={styles.todayXp}> · +{game.todayXp} today</span>}
                </div>
              </div>
            </div>
            <div className={styles.xpBarTrack}>
              <div className={styles.xpBarFill} style={{ width: `${Math.round(game.xpProgress * 100)}%` }} />
            </div>
            <div className={styles.xpBarLabel}>
              {game.xpIntoLevel} / {game.xpForNextLevel} XP to level {game.level + 1}
            </div>
          </>
        )}
      </header>

      {error && <div className={styles.message}>{error}</div>}
      {!error && loading && <div className={styles.message}>Loading your record…</div>}

      {game && (
        <>
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Attributes</div>
            <div className={styles.attributesCard}>
              <AttributesRadar attributes={game.attributes} />
              <ul className={styles.attributesList}>
                {ATTRIBUTE_AXES.map(({ key, label }) => (
                  <li key={key} className={styles.attributeRow}>
                    <span className={styles.attributeLabel}>{label}</span>
                    <span className={styles.attributeValue}>{game.attributes[key]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionLabel}>Streaks</div>
            <div className={styles.streakGrid}>
              <StreakCard icon={faFire} label="Active" streak={game.streaks.active} />
              <StreakCard icon={faWallet} label="Money logged" streak={game.streaks.money} />
              <StreakCard icon={faNoteSticky} label="Journaling" streak={game.streaks.journal} />
              <StreakCard icon={faListCheck} label="Habits" streak={game.streaks.habit} />
            </div>
            <RecentStrip days={game.recentDays} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionLabel}>
              Achievements ·{' '}
              {game.achievements.filter((a) => a.unlockedAt).length}/{game.achievements.length}
            </div>
            <div className={styles.achievementGrid}>
              {game.achievements.map((a) => (
                <AchievementCard key={a.id} achievement={a} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function AttributesRadar({ attributes }: { attributes: Attributes }) {
  const size = 240;
  const center = size / 2;
  const maxR = 85;
  const values = ATTRIBUTE_AXES.map(({ key }) => attributes[key]);

  const angleOf = (i: number) => (-90 + i * 90) * (Math.PI / 180);
  const pointAt = (i: number, pct: number) => {
    const angle = angleOf(i);
    const r = (pct / 100) * maxR;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };
  const polygonAt = (pct: number) =>
    [0, 1, 2, 3].map((i) => pointAt(i, pct)).map((p) => `${p.x},${p.y}`).join(' ');

  const dataPolygon = values.map((v, i) => pointAt(i, v)).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      className={styles.radar}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={polygonAt(ring)} className={styles.radarRing} />
      ))}
      {[0, 1, 2, 3].map((i) => {
        const p = pointAt(i, 100);
        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} className={styles.radarAxis} />;
      })}
      <polygon points={dataPolygon} className={styles.radarShape} />
      {ATTRIBUTE_AXES.map(({ label }, i) => {
        const p = pointAt(i, 100 + 22);
        const anchor = i === 1 ? 'start' : i === 3 ? 'end' : 'middle';
        const dy = i === 0 ? -2 : i === 2 ? 10 : 4;
        return (
          <text key={label} x={p.x} y={p.y + dy} textAnchor={anchor} className={styles.radarLabel}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function StreakCard({
  icon,
  label,
  streak,
}: {
  icon: typeof faFire;
  label: string;
  streak: StreakInfo;
}) {
  return (
    <div className={styles.streakCard}>
      <FontAwesomeIcon icon={icon} className={styles.streakIcon} />
      <div className={styles.streakBody}>
        <div className={styles.streakLabel}>{label}</div>
        <div className={styles.streakValue}>
          {streak.current} <span className={styles.streakUnit}>day{streak.current === 1 ? '' : 's'}</span>
        </div>
        <div className={styles.streakBest}>best {streak.best}</div>
      </div>
    </div>
  );
}

function RecentStrip({ days }: { days: RecentDay[] }) {
  return (
    <div className={styles.strip}>
      {days.map((d) => (
        <div
          key={d.date}
          className={[styles.stripDay, d.active ? styles.stripDayActive : ''].filter(Boolean).join(' ')}
          title={d.date}
        />
      ))}
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const unlocked = achievement.unlockedAt !== null;
  return (
    <div
      className={[styles.achievement, unlocked ? styles.achievementUnlocked : ''].filter(Boolean).join(' ')}
    >
      <FontAwesomeIcon icon={unlocked ? faTrophy : faLock} className={styles.achievementIcon} />
      <div className={styles.achievementTitle}>{achievement.title}</div>
      <div className={styles.achievementDesc}>{achievement.description}</div>
      {unlocked && achievement.unlockedAt && (
        <div className={styles.achievementDate}>
          {new Date(achievement.unlockedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      )}
    </div>
  );
}
