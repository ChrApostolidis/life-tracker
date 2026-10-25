import { redirect } from 'next/navigation';

// The nav group button opens a panel rather than navigating, so a bare /projects
// only comes from a typed URL; Ongoing is the pool worth landing on.
export default function ProjectsIndex() {
  redirect('/projects/ongoing');
}
