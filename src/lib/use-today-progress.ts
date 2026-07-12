'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { startOfDay, addDays } from './date';

export type TodayProgress = { total: number; done: number };

// Today's scheduled-task completion, fetched independently of the page's date
// window so the sidebar ring is correct on every screen. Refetches whenever
// `revision` changes (bumped by task mutations in app-context).
export function useTodayProgress(revision: number): TodayProgress {
  const [progress, setProgress] = useState<TodayProgress>({ total: 0, done: 0 });

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const from = startOfDay(now).toISOString();
    const to = startOfDay(addDays(now, 1)).toISOString();
    api
      .listRange(from, to)
      .then((tasks) => {
        if (cancelled) return;
        setProgress({
          total: tasks.length,
          done: tasks.filter((t) => t.completedAt).length,
        });
      })
      // Ambient widget: keep the last known value rather than surfacing an error.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [revision]);

  return progress;
}
