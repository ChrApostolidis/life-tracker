'use client';

import { useEffect, useState } from 'react';
import { fromDateInput } from '@/lib/date';

const DELETE_CONFIRM_MS = 4000;

// 'YYYY-MM-DD' → "Fri, Oct 24, 2026".
export function formatDay(date: string): string {
  return fromDateInput(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// The Gym page's two-tap delete: the first tap arms, and it disarms itself if
// the second never comes. confirm() returns true only on the second tap.
export function useTwoTapDelete() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  function confirm(): boolean {
    if (armed) return true;
    setArmed(true);
    return false;
  }

  return { armed, confirm };
}
