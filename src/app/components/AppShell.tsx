'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import NavBar from './NavBar';
import MobileTopBar from './MobileTopBar';
import styles from './appShell.module.css';

export default function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  const navId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavOpen(false);
  }, [pathname]);

  // Escape closes the drawer, mirroring the modal behaviour.
  useEffect(() => {
    if (!navOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navOpen]);

  // Return focus to the hamburger when the drawer closes after being opened.
  useEffect(() => {
    if (!navOpen && wasOpen.current) menuButtonRef.current?.focus();
    wasOpen.current = navOpen;
  }, [navOpen]);

  return (
    <div className={styles.shell}>
      <MobileTopBar
        onMenuClick={() => setNavOpen(true)}
        navOpen={navOpen}
        navId={navId}
        menuButtonRef={menuButtonRef}
      />
      <NavBar id={navId} open={navOpen} onClose={() => setNavOpen(false)} />
      <div
        className={[styles.backdrop, navOpen ? styles.backdropOpen : ''].filter(Boolean).join(' ')}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
