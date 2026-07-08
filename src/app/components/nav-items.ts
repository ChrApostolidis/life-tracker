import {
  faCalendarDay,
  faCalendarDays,
  faCalendarWeek,
  faNoteSticky,
  faTableCellsLarge,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type NavItem = {
  label: string;
  href: string;
  icon: IconDefinition;
  badge?: string;
};

// Shared by the sidebar and the mobile top bar so route titles stay in sync.
// Inbox is intentionally omitted until the /inbox route exists.
export const navItems: NavItem[] = [
  { label: "Today", href: "/", icon: faCalendarDay },
  { label: "Week", href: "/week", icon: faCalendarWeek },
  { label: "Month", href: "/month", icon: faCalendarDays },
  { label: "Year", href: "/year", icon: faTableCellsLarge },
  { label: "Notes", href: "/notes", icon: faNoteSticky },
  { label: "Money", href: "/money", icon: faWallet },
];

// Exact match or a nested segment (e.g. /week/… still highlights Week).
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
