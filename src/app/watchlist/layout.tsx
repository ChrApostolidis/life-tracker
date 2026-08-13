import type { ReactNode } from 'react';
import { WatchProvider } from '@/lib/watch-context';

export default function WatchlistLayout({ children }: { children: ReactNode }) {
  return <WatchProvider>{children}</WatchProvider>;
}
