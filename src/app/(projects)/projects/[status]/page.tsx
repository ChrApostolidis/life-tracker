'use client';

import { use, useMemo, useState } from 'react';
import { useProjects } from '@/lib/projects-context';
import { POOL_LABELS, statusFromSlug } from '@/lib/projects';
import { parseTags, type ProjectStatus, type ProjectSummary } from '@/lib/types';
import AddButton from '../../../components/AddButton';
import Skeleton, { SkeletonBlock } from '../../../components/Skeleton';
import NewProjectModal from './NewProjectModal';
import ProjectCard from './ProjectCard';
import styles from './pool.module.css';

const SKELETON_CARDS = 4;

const EMPTY_COPY: Record<ProjectStatus, string> = {
  idea: 'No ideas yet. Write the first one down.',
  ongoing: 'Nothing in progress. Pick something from your ideas.',
  finished: 'Nothing shipped yet.',
};

type TagCount = { key: string; label: string; count: number };

// Grouped case-insensitively, so "Work" on one card and "work" on another are one filter.
function countTags(pool: ProjectSummary[]): TagCount[] {
  const byKey = new Map<string, TagCount>();
  for (const { project } of pool) {
    for (const tag of parseTags(project.tags)) {
      const key = tag.toLowerCase();
      const entry = byKey.get(key) ?? { key, label: tag, count: 0 };
      entry.count += 1;
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function hasTag(summary: ProjectSummary, key: string): boolean {
  return parseTags(summary.project.tags).some((tag) => tag.toLowerCase() === key);
}

// Same .grid/.card geometry as the real cards, so nothing shifts on load.
function PoolSkeleton() {
  return (
    <SkeletonBlock className={styles.grid} label="Loading projects">
      {Array.from({ length: SKELETON_CARDS }, (_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton height={16} width="50%" radius={4} />
          <Skeleton height={14} width="90%" radius={4} style={{ marginTop: 8 }} />
          <Skeleton height={14} width="60%" radius={4} style={{ marginTop: 8 }} />
          <div className={styles.cardFooter}>
            <Skeleton height={12} width={56} radius={4} style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      ))}
    </SkeletonBlock>
  );
}

function Pool({ status }: { status: ProjectStatus }) {
  const { summaries, loading, error } = useProjects();
  const [creating, setCreating] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const pool = useMemo(() => summaries.filter((s) => s.project.status === status), [summaries, status]);
  const tags = useMemo(() => countTags(pool), [pool]);
  // A filter whose last project was retagged or moved away falls back to All.
  const activeTag = tags.some((t) => t.key === tagFilter) ? tagFilter : null;
  const shown = activeTag ? pool.filter((s) => hasTag(s, activeTag)) : pool;
  const coldLoad = loading && summaries.length === 0 && !error;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.eyebrow}>Projects</div>
          <h1 className={styles.title}>{POOL_LABELS[status]}</h1>
          <div className={styles.meta}>
            {coldLoad ? (
              <Skeleton height={14} width={80} radius={4} />
            ) : (
              `${pool.length} ${pool.length === 1 ? 'project' : 'projects'}`
            )}
          </div>
        </div>
        <AddButton label={status === 'idea' ? 'New idea' : 'New project'} onClick={() => setCreating(true)} />
      </header>

      {error && <div className={styles.message}>{error}</div>}

      {tags.length > 0 && (
        <div className={styles.filterRow} role="group" aria-label="Filter by tag">
          <button
            type="button"
            aria-pressed={activeTag === null}
            className={`${styles.filterPill} ${activeTag === null ? styles.filterPillActive : ''}`}
            onClick={() => setTagFilter(null)}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag.key}
              type="button"
              aria-pressed={activeTag === tag.key}
              className={`${styles.filterPill} ${activeTag === tag.key ? styles.filterPillActive : ''}`}
              onClick={() => setTagFilter(activeTag === tag.key ? null : tag.key)}
            >
              {tag.label}
              <span className={styles.filterCount}>{tag.count}</span>
            </button>
          ))}
        </div>
      )}

      {coldLoad ? (
        <PoolSkeleton />
      ) : shown.length > 0 ? (
        <div className={styles.grid}>
          {shown.map((summary) => (
            <ProjectCard key={summary.project.id} summary={summary} />
          ))}
        </div>
      ) : (
        !loading && !error && <div className={styles.empty}>{EMPTY_COPY[status]}</div>
      )}

      <NewProjectModal status={status} open={creating} onOpenChange={setCreating} />
    </div>
  );
}

// `params` is a Promise in the App Router; unwrap it with React's `use`.
export default function PoolPage({ params }: { params: Promise<{ status: string }> }) {
  const { status: slug } = use(params);
  const status = statusFromSlug(slug);

  if (!status) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>Projects</div>
        </header>
        <div className={styles.empty}>No such list.</div>
      </div>
    );
  }

  // Keyed so a half-typed draft or a tag filter doesn't follow you to another pool.
  return <Pool key={status} status={status} />;
}
