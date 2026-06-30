'use client';

import { use } from 'react';
import DayView from '@/app/components/DayView';
import { fromDateInput } from '@/lib/date';
import styles from '@/app/components/dayView.module.css';

// `params` is a Promise in the App Router; unwrap it with React's `use`.
export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  const parsed = fromDateInput(date);

  if (Number.isNaN(parsed.getTime())) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>Invalid date.</div>
      </div>
    );
  }

  return <DayView date={parsed} />;
}
