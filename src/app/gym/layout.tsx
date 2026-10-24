import type { ReactNode } from 'react';
import { WorkoutsProvider } from '@/lib/workouts-context';

export default function GymLayout({ children }: { children: ReactNode }) {
  return <WorkoutsProvider>{children}</WorkoutsProvider>;
}
