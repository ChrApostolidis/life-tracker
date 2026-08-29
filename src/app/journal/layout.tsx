import { JournalProvider } from '@/lib/journal-context';

// Route-scoped provider, same pattern as /money, /books and /watchlist.
export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return <JournalProvider>{children}</JournalProvider>;
}
