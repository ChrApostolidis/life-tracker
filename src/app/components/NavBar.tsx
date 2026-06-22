'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDay,
  faCalendarDays,
  faCalendarWeek,
  faInbox,
  faNoteSticky,
  faTableCellsLarge,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import styles from "./navBar.module.css";

type NavItem = {
  label: string;
  href: string;
  icon: IconDefinition;
  badge?: string;
};

const navItems: NavItem[] = [
  { label: "Today", href: "/", icon: faCalendarDay },
  { label: "Week", href: "/week", icon: faCalendarWeek },
  { label: "Month", href: "/month", icon: faCalendarDays },
  { label: "Year", href: "/year", icon: faTableCellsLarge },
  { label: "Inbox", href: "/inbox", icon: faInbox },
  { label: "Notes", href: "/notes", icon: faNoteSticky },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className={styles.navBar}>
      <div className={styles.navHeader}>
        <div className={styles.logoBadge} aria-hidden="true">L</div>
        <span className={styles.logoText}>Life Tracker</span>
      </div>
      <div className={styles.navContent}>
        <ul className={styles.navList}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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
