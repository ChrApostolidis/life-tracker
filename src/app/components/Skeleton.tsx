import type { CSSProperties } from 'react';
import styles from './skeleton.module.css';

type SkeletonProps = {
  /** Any CSS length. Defaults to filling the parent. */
  width?: string | number;
  height?: string | number;
  /** 999 for circles/pills; 8 matches inputs and small buttons. */
  radius?: number;
  /** Extra class for layout the primitive shouldn't know about (grid area, margin). */
  className?: string;
  style?: CSSProperties;
};

/**
 * One grey block standing in for content that hasn't loaded. Callers size it to
 * match the real element so nothing shifts when the data arrives — that's the
 * whole point, so prefer passing the same dimensions the real node uses (or
 * reusing the page's own layout classes) over eyeballing a value.
 *
 * Purely decorative: the surrounding SkeletonBlock carries the a11y role.
 */
export default function Skeleton({ width, height, radius = 8, className, style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={[styles.skeleton, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/**
 * Wraps a set of Skeletons so screen readers announce one "Loading" instead of
 * narrating every block. Use it once per loading region.
 */
export function SkeletonBlock({
  children,
  className,
  label = 'Loading',
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={className}>
      {children}
    </div>
  );
}
