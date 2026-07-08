'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './moneyTabs.module.css';

const tabs = [
  { label: 'Day', href: '/money' },
  { label: 'Stats', href: '/money/stats' },
];

// Day | Stats switch shared by the /money pages.
export default function MoneyTabs() {
  const pathname = usePathname();
  return (
    <nav className={styles.tabs} aria-label="Money views">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[styles.tab, isActive ? styles.tabActive : ''].filter(Boolean).join(' ')}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
