'use client';

import DayView from '../components/DayView';

// Today is just the Day view anchored to the current date.
export default function TodayPage() {
  return <DayView date={new Date()} />;
}
