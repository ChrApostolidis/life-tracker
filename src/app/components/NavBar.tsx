'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { navEntries, isActivePath, isNavGroup, groupForPath, type NavItem } from "./nav-items";
import TodayRing from "./TodayRing";
import AccountMenu from "./AccountMenu";
import styles from "./navBar.module.css";

type Props = {
  id?: string;
  open?: boolean;
  onClose?: () => void;
};

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = isActivePath(pathname, item.href);
  return (
    <Link
      className={[styles.navItem, isActive ? styles.navItemActive : ""].filter(Boolean).join(" ")}
      href={item.href}
      aria-current={isActive ? "page" : undefined}
    >
      <span className={styles.navIcon} aria-hidden="true">
        <FontAwesomeIcon icon={item.icon} />
      </span>
      <span className={styles.navLabel}>{item.label}</span>
      {item.badge && <span className={styles.navBadge}>{item.badge}</span>}
    </Link>
  );
}

export default function NavBar({ id, open = false, onClose }: Props) {
  const pathname = usePathname();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const groupBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocus = useRef<"back" | "group" | null>(null);

  // `drilled` slides the sub-panel in; `shownGroup` stays set after Back so
  // the panel keeps its content while it slides out.
  const routeGroup = groupForPath(pathname)?.label ?? null;
  const [drilled, setDrilled] = useState(routeGroup !== null);
  const [shownGroup, setShownGroup] = useState<string | null>(routeGroup);
  const [seenPath, setSeenPath] = useState(pathname);

  // Arriving on a route follows it: a calendar page opens the Calendar panel,
  // anything else shows the top level. Adjusted during render, not in an effect.
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setDrilled(routeGroup !== null);
    if (routeGroup) setShownGroup(routeGroup);
  }

  const group = navEntries.find((e) => isNavGroup(e) && e.label === shownGroup);
  const shown = group && isNavGroup(group) ? group : null;

  // When the drawer opens on mobile, move focus into it.
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  // Keyboard users land where the slide took them: Back after opening a
  // group, the group's own button after leaving it.
  useEffect(() => {
    if (pendingFocus.current === "back") backBtnRef.current?.focus({ preventScroll: true });
    if (pendingFocus.current === "group" && shownGroup) groupBtnRefs.current[shownGroup]?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [drilled, shownGroup]);

  function openGroup(label: string) {
    pendingFocus.current = "back";
    setShownGroup(label);
    setDrilled(true);
  }

  function closeGroup() {
    pendingFocus.current = "group";
    setDrilled(false);
  }

  return (
    <nav
      id={id}
      className={[styles.navBar, open ? styles.navBarOpen : ""].filter(Boolean).join(" ")}
    >
      <div className={styles.navHeader}>
        <span className={styles.logoText}>
          Life<span className={styles.logoAccent}>Tracker</span>
        </span>
        <AccountMenu />
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
        <div className={[styles.panels, drilled ? styles.panelsDrilled : ""].filter(Boolean).join(" ")}>
          <div className={styles.panel} inert={drilled}>
            <ul className={styles.navList}>
              {navEntries.map((entry) => {
                if (!isNavGroup(entry)) {
                  return (
                    <li key={entry.label}>
                      <NavLink item={entry} pathname={pathname} />
                    </li>
                  );
                }
                // Highlighted like an active link while you're on one of its pages.
                const isActive = routeGroup === entry.label;
                return (
                  <li key={entry.label}>
                    <button
                      ref={(el) => {
                        groupBtnRefs.current[entry.label] = el;
                      }}
                      type="button"
                      className={[styles.navItem, styles.groupBtn, isActive ? styles.navItemActive : ""]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => openGroup(entry.label)}
                      aria-expanded={drilled && shownGroup === entry.label}
                    >
                      <span className={styles.navIcon} aria-hidden="true">
                        <FontAwesomeIcon icon={entry.icon} />
                      </span>
                      <span className={styles.navLabel}>{entry.label}</span>
                      <span className={styles.groupChevron} aria-hidden="true">
                        <FontAwesomeIcon icon={faChevronRight} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={styles.panel} inert={!drilled}>
            {shown && (
              <>
                <button ref={backBtnRef} type="button" className={styles.backBtn} onClick={closeGroup}>
                  <span className={styles.backIcon} aria-hidden="true">
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </span>
                  Back
                </button>
                <div className={styles.panelTitle}>{shown.label}</div>
                <ul className={styles.navList}>
                  {shown.items.map((item) => (
                    <li key={item.label}>
                      <NavLink item={item} pathname={pathname} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
      <div className={styles.navFooter}>
        <TodayRing />
      </div>
    </nav>
  );
}
