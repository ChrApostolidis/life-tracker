'use client';

import type { RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { navItems, isActivePath } from './nav-items';
import styles from './mobileTopBar.module.css';

function titleFor(pathname: string): string {
  if (pathname.startsWith('/day/')) return 'Day';
  const match = navItems.find((item) => isActivePath(pathname, item.href));
  return match?.label ?? 'Life Tracker';
}

type Props = {
  onMenuClick: () => void;
  navId: string;
  navOpen: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
};

// Compact bar shown only under the mobile breakpoint (hidden ≥768px via CSS).
export default function MobileTopBar({ onMenuClick, navId, navOpen, menuButtonRef }: Props) {
  const pathname = usePathname();

  return (
    <header className={styles.bar}>
      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menuBtn}
        onClick={onMenuClick}
        aria-label="Open navigation"
        aria-expanded={navOpen}
        aria-controls={navId}
      >
        <FontAwesomeIcon icon={faBars} />
      </button>
      <span className={styles.title}>{titleFor(pathname)}</span>
    </header>
  );
}
