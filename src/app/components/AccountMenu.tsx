'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsisVertical, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { api, LOGIN_PATH } from '@/lib/api';
import styles from './accountMenu.module.css';

// The ⋮ menu next to the sidebar wordmark. Holds account actions, which are
// not places to navigate to and so do not belong among the nav links.
export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // While open: focus the first item, and close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Stop here so Escape closes only this menu, not the mobile drawer around it.
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Leaves only once the server has ended the session; a failed request would
  // otherwise land on /login while still signed in and bounce straight back.
  async function logOut() {
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      await api.logout();
      window.location.assign(LOGIN_PATH);
    } catch {
      setLogoutFailed(true);
      setLoggingOut(false);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <FontAwesomeIcon icon={faEllipsisVertical} />
      </button>

      {open && (
        <div id={menuId} role="menu" className={styles.menu}>
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={logOut}
            disabled={loggingOut}
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
            <span>{loggingOut ? 'Logging out' : 'Log out'}</span>
          </button>
          {logoutFailed && (
            <p className={styles.error} role="alert">
              Could not log out. Try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
