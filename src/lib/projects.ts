import type { ProjectItem, ProjectPriority, ProjectStage, ProjectStatus } from './types';
import { toDateInput } from './date';

// Pure helpers shared by the pools, the board and the overview. See PROJECTS_PLAN.md.

export const STATUSES: readonly ProjectStatus[] = ['idea', 'ongoing', 'finished'];

// URL slugs for /projects/[status]. Plural "ideas" reads better in a URL and a title.
export type ProjectStatusSlug = 'ideas' | 'ongoing' | 'finished';

export const STATUS_SLUGS: readonly ProjectStatusSlug[] = ['ideas', 'ongoing', 'finished'];

const SLUG_BY_STATUS: Record<ProjectStatus, ProjectStatusSlug> = {
  idea: 'ideas',
  ongoing: 'ongoing',
  finished: 'finished',
};

export function slugForStatus(status: ProjectStatus): ProjectStatusSlug {
  return SLUG_BY_STATUS[status];
}

// null for anything that isn't a known slug, so the page can render its "No such list" state.
export function statusFromSlug(slug: string): ProjectStatus | null {
  return STATUSES.find((s) => SLUG_BY_STATUS[s] === slug) ?? null;
}

// One project's status (Overview control, breadcrumb chips).
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: 'Idea',
  ongoing: 'Ongoing',
  finished: 'Finished',
};

// A pool's page title — a list of them.
export const POOL_LABELS: Record<ProjectStatus, string> = {
  idea: 'Ideas',
  ongoing: 'Ongoing',
  finished: 'Finished',
};

// Board column order.
export const STAGES: readonly ProjectStage[] = ['todo', 'doing', 'done', 'blocked'];

export const STAGE_LABELS: Record<ProjectStage, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
};

export const PRIORITIES: readonly ProjectPriority[] = ['low', 'normal', 'urgent'];

export const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  urgent: 'Urgent',
};

export const MAX_TECH_STACK = 8;

// Same cap as journal tags, so the filter row on a pool stays short.
export const MAX_PROJECT_TAGS = 5;

// 'YYYY-MM-DD' strings compare correctly as text, so no Date parsing is needed.
export function isOverdue(item: Pick<ProjectItem, 'dueOn' | 'stage'>, today: Date): boolean {
  return item.dueOn !== null && item.stage !== 'done' && item.dueOn < toDateInput(today);
}

// Blocked items count toward the total: they're still work the project owes.
export function progressOf(counts: Record<ProjectStage, number>): {
  done: number;
  total: number;
  ratio: number;
} {
  const total = STAGES.reduce((sum, stage) => sum + counts[stage], 0);
  const done = counts.done;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}
