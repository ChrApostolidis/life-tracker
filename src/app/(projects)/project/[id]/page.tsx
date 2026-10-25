'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { useProjects } from '@/lib/projects-context';
import { useProjectItems } from '@/lib/use-project-items';
import { POOL_LABELS, STAGES, slugForStatus } from '@/lib/projects';
import type { ProjectItem, ProjectStage } from '@/lib/types';
import Skeleton, { SkeletonBlock } from '../../../components/Skeleton';
import Board from '../Board';
import Overview from '../Overview';
import Updates from '../Updates';
import styles from './project.module.css';

const TABS = [
  { key: 'board', label: 'Board' },
  { key: 'overview', label: 'Overview' },
  { key: 'updates', label: 'Updates' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function countByStage(items: ProjectItem[]): Record<ProjectStage, number> {
  const counts = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<ProjectStage, number>;
  for (const item of items) counts[item.stage] += 1;
  return counts;
}

// `params` is a Promise in the App Router; unwrap it with React's `use`.
export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Keyed so moving between projects never carries tab or board state across.
  return <ProjectScreen key={id} id={id} />;
}

function ProjectScreen({ id }: { id: string }) {
  const { summaries, loading, error, refresh } = useProjects();
  const board = useProjectItems(id);
  const [tab, setTab] = useState<TabKey>('board');

  // The board changes counts the provider can't see; catch the pools up once on the way out.
  useEffect(() => () => void refresh(), [refresh]);

  const summary = summaries.find((s) => s.project.id === id);
  // Live counts once the board has loaded, so the header follows every move.
  const counts = useMemo(
    () => (board.loading || !summary ? summary?.counts : countByStage(board.items)),
    [board.loading, board.items, summary],
  );

  if (!summary) {
    if (loading) return <ProjectSkeleton />;
    return (
      <div className={styles.page}>
        <Link href="/projects" className={styles.back}>
          <FontAwesomeIcon icon={faChevronLeft} />
          Projects
        </Link>
        <p className={styles.message}>{error ?? 'This project no longer exists.'}</p>
      </div>
    );
  }

  const { project } = summary;
  const pool = POOL_LABELS[project.status];
  const open = counts ? counts.todo + counts.doing + counts.blocked : 0;

  return (
    <div className={styles.page}>
      <Link href={`/projects/${slugForStatus(project.status)}`} className={styles.back}>
        <FontAwesomeIcon icon={faChevronLeft} />
        {pool}
        <span className={styles.crumbSep}>›</span>
        <span className={styles.crumbName}>{project.name}</span>
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>{project.name}</h1>
        {counts && (
          <div className={styles.meta}>
            {open} open · <span className={styles.done}>{counts.done} done</span>
          </div>
        )}
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Project views">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'board' && <Board board={board} />}
        {tab === 'overview' && <Overview project={project} counts={counts ?? summary.counts} />}
        {tab === 'updates' && <Updates projectId={id} />}
      </div>
    </div>
  );
}

// The header and tabs reuse the real classes so the swap doesn't shift anything.
function ProjectSkeleton() {
  return (
    <div className={styles.page}>
      <SkeletonBlock label="Loading project">
        <div className={styles.back}>
          <Skeleton height={12} width={140} radius={4} />
        </div>
        <header className={styles.header}>
          <Skeleton height={44} width="50%" radius={6} />
          <Skeleton height={14} width={120} radius={4} style={{ marginTop: 12 }} />
        </header>
        <div className={styles.tabs}>
          <Skeleton height={36} width={240} radius={8} />
        </div>
      </SkeletonBlock>
    </div>
  );
}
