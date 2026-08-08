// Pure "Life RPG" engine: replays your full task/note/money history into XP,
// levels, streaks, attributes, and achievements. No stored game state — every
// number here is re-derived from the same data the rest of the app already
// shows, so there's nothing to desync or cheat.
import type { DayNote, HabitCheck, MoneyEntry, Note, Task } from './types';
import { addDays, fromDateInput, toDateInput } from './date';

// ── XP economy (tune here) ──────────────────────────────────────────────────

export const XP = {
  taskComplete: 10,
  onTimeBonus: 5,
  perfectDay: 25,
  perfectDayMinTasks: 3,
  noteWritten: 5,
  noteXpCapPerDay: 3,
  moneyLoggedDay: 5,
  noSpendDay: 8,
  positiveMonth: 50,
  streak7: 50,
  streak30: 200,
  streak100: 1000,
  habitCheck: 4,
  habitCheckXpCapPerDay: 5, // anti-cheese: 20 habits checked in a day still earns 5×4
  journalEntry: 12, // higher than noteWritten — an entry is more effort, and the schema allows only one per day so no cap is needed
} as const;

const LEVEL_TITLES: { minLevel: number; title: string }[] = [
  { minLevel: 1, title: 'Novice' },
  { minLevel: 5, title: 'Apprentice' },
  { minLevel: 10, title: 'Adept' },
  { minLevel: 15, title: 'Operator' },
  { minLevel: 20, title: 'Veteran' },
  { minLevel: 25, title: 'Master' },
  { minLevel: 30, title: 'Grandmaster' },
  { minLevel: 35, title: 'Ascended' },
];

const ATTRIBUTE_WINDOW_DAYS = 90;

// ── Public types ─────────────────────────────────────────────────────────

export type Attributes = { discipline: number; consistency: number; wealth: number; reflection: number };
export type StreakInfo = { current: number; best: number };

export type AchievementId =
  | 'firstBlood'
  | 'century'
  | 'legion'
  | 'earlyBird'
  | 'nightShift'
  | 'perfectWeek'
  | 'marathon'
  | 'immortal'
  | 'scribe'
  | 'foundMyVoice'
  | 'accountant'
  | 'frugalWeek'
  | 'inTheGreen'
  | 'speedrunner'
  | 'comeback'
  | 'theMachine'
  | 'inboxZero'
  | 'habitFormed'
  | 'ironWill'
  | 'steadyHand'
  | 'dearDiary';

export type Achievement = {
  id: AchievementId;
  title: string;
  description: string;
  unlockedAt: string | null; // ISO instant or a "YYYY-MM-DD" day key; null = locked
};

export type RecentDay = { date: string; active: boolean };

export type GameState = {
  totalXp: number;
  todayXp: number;
  level: number;
  levelTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpProgress: number; // 0–1
  streaks: { active: StreakInfo; money: StreakInfo; journal: StreakInfo; habit: StreakInfo };
  recentDays: RecentDay[]; // last 14 days, oldest first, for the streak strip
  attributes: Attributes;
  achievements: Achievement[];
};

export type GameInput = {
  tasks: Task[];
  notes: Note[];
  money: MoneyEntry[];
  habitChecks: HabitCheck[];
  dayNotes: DayNote[];
  inboxCount: number;
  now: Date;
};

// ── Day-key helpers (all dates are local "YYYY-MM-DD" strings) ─────────────

function nextDayKey(key: string): string {
  return toDateInput(addDays(fromDateInput(key), 1));
}

function dayDiff(a: string, b: string): number {
  return Math.round((fromDateInput(b).getTime() - fromDateInput(a).getTime()) / 86_400_000);
}

function localDayKey(iso: string): string {
  return toDateInput(new Date(iso));
}

type Run = { start: string; end: string; length: number };

// Consecutive-day runs within a set of day keys, sorted chronologically.
function computeRuns(dates: Set<string>): Run[] {
  const sorted = [...dates].sort();
  const runs: Run[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  for (const d of sorted) {
    if (!(prev && nextDayKey(prev) === d)) {
      if (start && prev) runs.push({ start, end: prev, length: dayDiff(start, prev) + 1 });
      start = d;
    }
    prev = d;
  }
  if (start && prev) runs.push({ start, end: prev, length: dayDiff(start, prev) + 1 });
  return runs;
}

function currentStreakFromRuns(runs: Run[], todayKey: string): number {
  const yesterdayKey = toDateInput(addDays(fromDateInput(todayKey), -1));
  const run = runs.find((r) => r.end === todayKey || r.end === yesterdayKey);
  return run ? run.length : 0;
}

function bestStreakFromRuns(runs: Run[]): number {
  return runs.reduce((max, r) => Math.max(max, r.length), 0);
}

// Current + best consecutive-day streak over a set of local 'YYYY-MM-DD' keys.
export function computeStreak(dayKeys: Set<string>, todayKey: string): StreakInfo {
  const runs = computeRuns(dayKeys);
  return { current: currentStreakFromRuns(runs, todayKey), best: bestStreakFromRuns(runs) };
}

// ── Level curve ──────────────────────────────────────────────────────────

function cumulativeXpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.round((100 * Math.pow(level, 1.5)) / 10) * 10;
}

function levelForXp(xp: number): number {
  let level = 1;
  while (cumulativeXpForLevel(level + 1) <= xp) level += 1;
  return level;
}

function titleForLevel(level: number): string {
  let title = LEVEL_TITLES[0].title;
  for (const t of LEVEL_TITLES) {
    if (level >= t.minLevel) title = t.title;
  }
  return title;
}

// ── Main computation ─────────────────────────────────────────────────────

export function computeGameState({ tasks, notes, money, habitChecks, dayNotes, inboxCount, now }: GameInput): GameState {
  const todayKey = toDateInput(now);

  const liveTasks = tasks.filter((t) => !t.deletedAt);
  const liveNotes = notes.filter((n) => !n.deletedAt);
  const liveMoney = money.filter((m) => !m.deletedAt);
  const liveDayNotes = dayNotes.filter((d) => !d.deletedAt);
  const journalEntryDays = new Set(liveDayNotes.map((d) => d.entryDate));

  // ── Day/month buckets ──
  const scheduledByDay = new Map<string, { total: number; completed: number }>();
  const completedByDay = new Map<string, Task[]>();
  const notesByDay = new Map<string, number>();
  const moneyByDay = new Map<string, { count: number; spentCents: number; earnedCents: number }>();
  const moneyByMonth = new Map<string, { spentCents: number; earnedCents: number }>();
  const habitChecksByDay = new Map<string, number>();
  const checksByHabit = new Map<string, Set<string>>();

  for (const c of habitChecks) {
    habitChecksByDay.set(c.checkedOn, (habitChecksByDay.get(c.checkedOn) ?? 0) + 1);
    const habitDayKeys = checksByHabit.get(c.habitId) ?? new Set<string>();
    habitDayKeys.add(c.checkedOn);
    checksByHabit.set(c.habitId, habitDayKeys);
  }
  const habitDays = new Set(habitChecksByDay.keys());

  for (const t of liveTasks) {
    if (t.scheduledAt) {
      const key = localDayKey(t.scheduledAt);
      const bucket = scheduledByDay.get(key) ?? { total: 0, completed: 0 };
      bucket.total += 1;
      if (t.completedAt) bucket.completed += 1;
      scheduledByDay.set(key, bucket);
    }
    if (t.completedAt) {
      const key = localDayKey(t.completedAt);
      const list = completedByDay.get(key) ?? [];
      list.push(t);
      completedByDay.set(key, list);
    }
  }

  for (const n of liveNotes) {
    const key = localDayKey(n.createdAt);
    notesByDay.set(key, (notesByDay.get(key) ?? 0) + 1);
  }

  for (const m of liveMoney) {
    const key = m.occurredOn;
    const bucket = moneyByDay.get(key) ?? { count: 0, spentCents: 0, earnedCents: 0 };
    bucket.count += 1;
    if (m.type === 'expense') bucket.spentCents += m.amountCents;
    else bucket.earnedCents += m.amountCents;
    moneyByDay.set(key, bucket);

    const monthKey = key.slice(0, 7);
    const mBucket = moneyByMonth.get(monthKey) ?? { spentCents: 0, earnedCents: 0 };
    if (m.type === 'expense') mBucket.spentCents += m.amountCents;
    else mBucket.earnedCents += m.amountCents;
    moneyByMonth.set(monthKey, mBucket);
  }

  const perfectDays = new Set<string>();
  scheduledByDay.forEach((bucket, key) => {
    if (bucket.total >= XP.perfectDayMinTasks && bucket.completed === bucket.total) {
      perfectDays.add(key);
    }
  });

  const activeDays = new Set(completedByDay.keys());
  const moneyDays = new Set(moneyByDay.keys());
  // Union, not a switch to day-notes-only — this preserves the streak history
  // the 14 existing standalone notes already earned.
  const journalDays = new Set([...notesByDay.keys(), ...journalEntryDays]);
  const noSpendDays = new Set(
    [...moneyByDay.entries()].filter(([, b]) => b.spentCents === 0).map(([k]) => k),
  );

  // ── XP events ──
  const xpByDay = new Map<string, number>();
  const addXp = (dateKey: string, amount: number) => {
    xpByDay.set(dateKey, (xpByDay.get(dateKey) ?? 0) + amount);
  };

  completedByDay.forEach((dayTasks, key) => {
    for (const t of dayTasks) {
      let amount = XP.taskComplete;
      if (t.scheduledAt && localDayKey(t.scheduledAt) === key) amount += XP.onTimeBonus;
      addXp(key, amount);
    }
  });
  perfectDays.forEach((key) => addXp(key, XP.perfectDay));
  notesByDay.forEach((count, key) => addXp(key, Math.min(count, XP.noteXpCapPerDay) * XP.noteWritten));
  moneyByDay.forEach((bucket, key) => {
    addXp(key, XP.moneyLoggedDay);
    if (bucket.spentCents === 0) addXp(key, XP.noSpendDay);
  });
  moneyByMonth.forEach((bucket, monthKey) => {
    if (bucket.earnedCents > bucket.spentCents) addXp(`${monthKey}-01`, XP.positiveMonth);
  });
  habitChecksByDay.forEach((count, key) => addXp(key, Math.min(count, XP.habitCheckXpCapPerDay) * XP.habitCheck));
  journalEntryDays.forEach((key) => addXp(key, XP.journalEntry));
  // One milestone award per streak run, at its highest tier reached.
  computeRuns(activeDays).forEach((run) => {
    const tier = run.length >= 100 ? XP.streak100 : run.length >= 30 ? XP.streak30 : run.length >= 7 ? XP.streak7 : 0;
    if (tier > 0) addXp(run.end, tier);
  });

  let totalXp = 0;
  xpByDay.forEach((amount) => {
    totalXp += amount;
  });
  const todayXp = xpByDay.get(todayKey) ?? 0;

  const level = levelForXp(totalXp);
  const levelFloor = cumulativeXpForLevel(level);
  const levelCeil = cumulativeXpForLevel(level + 1);

  // ── Streaks ──
  const activeRuns = computeRuns(activeDays);
  const moneyRuns = computeRuns(moneyDays);
  const habitRuns = computeRuns(habitDays);

  const streaks = {
    active: computeStreak(activeDays, todayKey),
    money: computeStreak(moneyDays, todayKey),
    journal: computeStreak(journalDays, todayKey),
    habit: computeStreak(habitDays, todayKey),
  };

  const recentDays: RecentDay[] = Array.from({ length: 14 }, (_, i) => {
    const date = toDateInput(addDays(now, i - 13));
    return { date, active: activeDays.has(date) };
  });

  // ── Attributes (last 90 days) ──
  const windowStart = toDateInput(addDays(now, -(ATTRIBUTE_WINDOW_DAYS - 1)));
  const inWindow = (key: string) => key >= windowStart && key <= todayKey;

  let schedTotal = 0;
  let schedCompleted = 0;
  scheduledByDay.forEach((b, key) => {
    if (inWindow(key)) {
      schedTotal += b.total;
      schedCompleted += b.completed;
    }
  });
  const discipline = schedTotal > 0 ? Math.round((schedCompleted / schedTotal) * 100) : 0;

  const consistencyDays = new Set([...activeDays, ...habitDays]);
  const consistencyDaysInWindow = [...consistencyDays].filter(inWindow).length;
  const consistency = Math.round(Math.min(100, (consistencyDaysInWindow / ATTRIBUTE_WINDOW_DAYS) * 100));

  const moneyDaysInWindow = [...moneyDays].filter(inWindow).length;
  const moneyCoverage = Math.min(100, (moneyDaysInWindow / ATTRIBUTE_WINDOW_DAYS) * 100);
  let windowSpent = 0;
  let windowEarned = 0;
  moneyByDay.forEach((b, key) => {
    if (inWindow(key)) {
      windowSpent += b.spentCents;
      windowEarned += b.earnedCents;
    }
  });
  const savingsScore =
    windowSpent + windowEarned === 0
      ? 50
      : ((windowEarned - windowSpent) / (windowEarned + windowSpent)) * 50 + 50;
  const wealth = Math.round(Math.max(0, Math.min(100, (moneyCoverage + savingsScore) / 2)));

  let notesInWindow = 0;
  notesByDay.forEach((count, key) => {
    if (inWindow(key)) notesInWindow += count;
  });
  const journalEntriesInWindow = [...journalEntryDays].filter(inWindow).length;
  const reflection = Math.round(Math.min(100, ((notesInWindow + journalEntriesInWindow) / 30) * 100));

  const attributes: Attributes = { discipline, consistency, wealth, reflection };

  // ── Achievements ──
  const completedSorted = [...liveTasks]
    .filter((t) => t.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1));
  const notesSorted = [...liveNotes].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const earlyBirdTask = completedSorted.find((t) => new Date(t.completedAt!).getHours() < 8);
  const nightShiftTask = completedSorted.find((t) => new Date(t.completedAt!).getHours() >= 23);

  const perfectWeekRun = computeRuns(perfectDays).find((r) => r.length >= 7);
  const marathonRun = activeRuns.find((r) => r.length >= 30);
  const immortalRun = activeRuns.find((r) => r.length >= 100);
  const accountantRun = moneyRuns.find((r) => r.length >= 30);
  const frugalRun = computeRuns(noSpendDays).find((r) => r.length >= 7);

  const positiveMonthKeys = [...moneyByMonth.entries()]
    .filter(([, b]) => b.earnedCents > b.spentCents)
    .map(([k]) => k)
    .sort();
  const inTheGreenMonth = positiveMonthKeys.find((_, i) => {
    if (i < 2) return false;
    const [y1, m1] = positiveMonthKeys[i - 2].split('-').map(Number);
    const [y2, m2] = positiveMonthKeys[i].split('-').map(Number);
    return (y2 * 12 + m2) - (y1 * 12 + m1) === 2;
  });

  let speedrunnerDay: string | null = null;
  let theMachineDay: string | null = null;
  [...completedByDay.keys()].sort().forEach((key) => {
    const dayTasks = completedByDay.get(key)!;
    if (!speedrunnerDay && dayTasks.filter((t) => new Date(t.completedAt!).getHours() < 12).length >= 5) {
      speedrunnerDay = key;
    }
    if (!theMachineDay && dayTasks.length >= 10) theMachineDay = key;
  });

  const comebackRun = activeRuns.length > 1 ? activeRuns.find((r, i) => i > 0 && r.length >= 7) : undefined;

  // Per-habit streaks: earliest qualifying run across all habits, for a
  // stable unlock date (chronologically first time any single habit hit it).
  let habitFormedDay: string | null = null;
  let ironWillDay: string | null = null;
  checksByHabit.forEach((dayKeys) => {
    const runs = computeRuns(dayKeys);
    const formedRun = runs.find((r) => r.length >= 21);
    if (formedRun && (!habitFormedDay || formedRun.end < habitFormedDay)) habitFormedDay = formedRun.end;
    const ironRun = runs.find((r) => r.length >= 100);
    if (ironRun && (!ironWillDay || ironRun.end < ironWillDay)) ironWillDay = ironRun.end;
  });
  const steadyHandRun = habitRuns.find((r) => r.length >= 30);

  // Specifically day-journal entries, not the journalDays union — this
  // achievement is about the journal feature itself, not notes in general.
  const dearDiaryRun = computeRuns(journalEntryDays).find((r) => r.length >= 30);

  const voiceCandidates = [
    ...liveTasks.filter((t) => t.source === 'voice').map((t) => t.createdAt),
    ...liveNotes.filter((n) => n.source === 'voice').map((n) => n.createdAt),
  ].sort();

  const achievements: Achievement[] = [
    {
      id: 'firstBlood',
      title: 'First Blood',
      description: 'Complete your first task',
      unlockedAt: completedSorted[0]?.completedAt ?? null,
    },
    {
      id: 'century',
      title: 'Century',
      description: 'Complete 100 tasks',
      unlockedAt: completedSorted[99]?.completedAt ?? null,
    },
    {
      id: 'legion',
      title: 'Legion',
      description: 'Complete 500 tasks',
      unlockedAt: completedSorted[499]?.completedAt ?? null,
    },
    {
      id: 'earlyBird',
      title: 'Early Bird',
      description: 'Complete a task before 08:00',
      unlockedAt: earlyBirdTask?.completedAt ?? null,
    },
    {
      id: 'nightShift',
      title: 'Night Shift',
      description: 'Complete a task after 23:00',
      unlockedAt: nightShiftTask?.completedAt ?? null,
    },
    {
      id: 'perfectWeek',
      title: 'Perfect Week',
      description: '7 consecutive Perfect Days',
      unlockedAt: perfectWeekRun?.end ?? null,
    },
    {
      id: 'marathon',
      title: 'Marathon',
      description: '30-day streak',
      unlockedAt: marathonRun?.end ?? null,
    },
    {
      id: 'immortal',
      title: 'Immortal',
      description: '100-day streak',
      unlockedAt: immortalRun?.end ?? null,
    },
    {
      id: 'scribe',
      title: 'Scribe',
      description: 'Write 50 notes',
      unlockedAt: notesSorted[49]?.createdAt ?? null,
    },
    {
      id: 'foundMyVoice',
      title: 'Found My Voice',
      description: 'Capture a task or note by voice',
      unlockedAt: voiceCandidates[0] ?? null,
    },
    {
      id: 'accountant',
      title: 'Accountant',
      description: '30 consecutive days logging money',
      unlockedAt: accountantRun?.end ?? null,
    },
    {
      id: 'frugalWeek',
      title: 'Frugal Week',
      description: '7-day no-spend streak',
      unlockedAt: frugalRun?.end ?? null,
    },
    {
      id: 'inTheGreen',
      title: 'In the Green',
      description: '3 consecutive positive months',
      unlockedAt: inTheGreenMonth ? `${inTheGreenMonth}-01` : null,
    },
    {
      id: 'speedrunner',
      title: 'Speedrunner',
      description: '5 tasks completed before noon in one day',
      unlockedAt: speedrunnerDay,
    },
    {
      id: 'comeback',
      title: 'Comeback',
      description: 'Restart a 7+ day streak after breaking one',
      unlockedAt: comebackRun?.end ?? null,
    },
    {
      id: 'theMachine',
      title: 'The Machine',
      description: '10 tasks completed in one day',
      unlockedAt: theMachineDay,
    },
    {
      id: 'inboxZero',
      title: 'Inbox Zero',
      description: 'Clear every item out of the inbox',
      unlockedAt: inboxCount === 0 ? now.toISOString() : null,
    },
    {
      id: 'habitFormed',
      title: 'Habit Formed',
      description: '21-day streak on a single habit',
      unlockedAt: habitFormedDay,
    },
    {
      id: 'ironWill',
      title: 'Iron Will',
      description: '100-day streak on a single habit',
      unlockedAt: ironWillDay,
    },
    {
      id: 'steadyHand',
      title: 'Steady Hand',
      description: '30 days in a row checking at least one habit',
      unlockedAt: steadyHandRun?.end ?? null,
    },
    {
      id: 'dearDiary',
      title: 'Dear Diary',
      description: '30 days in a row with a journal entry',
      unlockedAt: dearDiaryRun?.end ?? null,
    },
  ];

  return {
    totalXp,
    todayXp,
    level,
    levelTitle: titleForLevel(level),
    xpIntoLevel: totalXp - levelFloor,
    xpForNextLevel: levelCeil - levelFloor,
    xpProgress: levelCeil > levelFloor ? (totalXp - levelFloor) / (levelCeil - levelFloor) : 0,
    streaks,
    recentDays,
    attributes,
    achievements,
  };
}
