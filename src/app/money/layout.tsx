import type { ReactNode } from 'react';
import { MoneyProvider } from '@/lib/money-context';

export default function MoneyLayout({ children }: { children: ReactNode }) {
  return <MoneyProvider>{children}</MoneyProvider>;
}
