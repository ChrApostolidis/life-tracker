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
  isActive?: boolean;
};

const navItems: NavItem[] = [
  {
    label: "Today",
    href: "/today",
    icon: faCalendarDay,
  },
  {
    label: "Week",
    href: "/week",
    icon: faCalendarWeek,
  },
  {
    label: "Month",
    href: "/month",
    icon: faCalendarDays,
  },
  {
    label: "Year",
    href: "/year",
    icon: faTableCellsLarge,
  },
  {
    label: "Inbox",
    href: "/inbox",
    icon: faInbox,
  },
  {
    label: "Notes",
    href: "/notes",
    icon: faNoteSticky,
  },
];

export default function NavBar() {
  return (
    <nav className={styles.navBar}>
      <div className={styles.navHeader}>
        <div className={styles.logoBadge} aria-hidden="true">
          L
        </div>
        <span className={styles.logoText}>Life Tracker</span>
      </div>
      <div className={styles.navContent}>
        <ul className={styles.navList}>
          {navItems.map((item) => (
            <li key={item.label}>
              <a
                className={[
                  styles.navItem,
                  item.isActive ? styles.navItemActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                href={item.href}
                aria-current={item.isActive ? "page" : undefined}
              >
                <span className={styles.navIcon} aria-hidden="true">
                  <FontAwesomeIcon icon={item.icon} />
                </span>
                <span className={styles.navLabel}>{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.navFooter}>
        <div className={styles.userAvatar} aria-hidden="true">
          m
        </div>
        <div className={styles.userMeta}>
          <div className={styles.userName}>maya</div>
          <div className={styles.userStatus}>local · synced 2m</div>
        </div>
      </div>
    </nav>
  );
}