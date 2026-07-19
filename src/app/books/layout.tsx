import type { ReactNode } from 'react';
import { BooksProvider } from '@/lib/books-context';

export default function BooksLayout({ children }: { children: ReactNode }) {
  return <BooksProvider>{children}</BooksProvider>;
}
