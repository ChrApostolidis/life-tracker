import Link from 'next/link';
import { formatRelativeTime } from '@/lib/date';
import { progressOf } from '@/lib/projects';
import { parseTags, type ProjectSummary } from '@/lib/types';
import styles from './pool.module.css';

export default function ProjectCard({ summary }: { summary: ProjectSummary }) {
  const { project, counts, lastActivityAt } = summary;
  const progress = progressOf(counts);
  const tags = parseTags(project.tags);
  const body = (
    <>
      <div className={styles.cardName}>{project.name}</div>
      {project.pitch && <div className={styles.cardPitch}>{project.pitch}</div>}
      {tags.length > 0 && (
        <div className={styles.cardTags}>
          {tags.map((tag) => (
            <span key={tag} className={styles.cardTag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {progress.total > 0 && (
        <div className={styles.progress}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress.ratio * 100}%` }} />
          </div>
          <span className={styles.progressLabel}>
            {progress.done} of {progress.total} done
          </span>
        </div>
      )}

      <div className={styles.cardFooter}>
        {counts.blocked > 0 && <span className={styles.blockedChip}>{counts.blocked} blocked</span>}
        <span className={styles.activity}>{formatRelativeTime(lastActivityAt)}</span>
      </div>
    </>
  );

  // Until the create returns, the id is the provider's placeholder and would link to a not-found page.
  if (project.id.startsWith('temp-')) return <div className={styles.card}>{body}</div>;
  return (
    <Link href={`/project/${project.id}`} className={styles.card}>
      {body}
    </Link>
  );
}
