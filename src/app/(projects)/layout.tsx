import type { ReactNode } from 'react';
import { ProjectsProvider } from '@/lib/projects-context';

// A route group so the pools (/projects/…) and a project (/project/…) share one
// provider: moving between them never refetches the list.
export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return <ProjectsProvider>{children}</ProjectsProvider>;
}
