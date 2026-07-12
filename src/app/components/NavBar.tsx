'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { navItems, isActivePath } from "./nav-items";
import styles from "./navBar.module.css";

type Props = {
  id?: string;
  open?: boolean;
  onClose?: () => void;
};

export default function NavBar({ id, open = false, onClose }: Props) {
  const pathname = usePathname();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // When the drawer opens on mobile, move focus into it.
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  return (
    <nav
      id={id}
      className={[styles.navBar, open ? styles.navBarOpen : ""].filter(Boolean).join(" ")}
    >
      <div className={styles.navHeader}>
        <span className={styles.logoText}>
          Life<span className={styles.logoAccent}>Tracker</span>
        </span>
        <button
          ref={closeBtnRef}
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close navigation"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
      <div className={styles.navContent}>
        <ul className={styles.navList}>
          {navItems.map((item) => {
            const isActive = isActivePath(pathname, item.href);
            return (
              <li key={item.label}>
                <Link
                  className={[styles.navItem, isActive ? styles.navItemActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={[styles.navIcon, isActive ? styles.navIconActive : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-hidden="true"
                  >
                    <FontAwesomeIcon icon={item.icon} />
                  </span>
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.badge && (
                    <span className={styles.navBadge}>{item.badge}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={styles.navFooter}>
        <div className={styles.userAvatar} aria-hidden="true">X</div>
        <div className={styles.userMeta}>
          <div className={styles.userName}>Xristos</div>
          <div className={styles.userStatus}>local · synced 2m</div>
        </div>
      </div>
    </nav>
  );
}
