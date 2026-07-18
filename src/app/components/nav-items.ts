import {
  faBook,
  faCalendarDay,
  faCalendarDays,
  faCalendarWeek,
  faDiceD20,
  faHouse,
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
  { label: "Home", href: "/", icon: faHouse },
  { label: "Today", href: "/today", icon: faCalendarDay },
  { label: "Week", href: "/week", icon: faCalendarWeek },
  { label: "Month", href: "/month", icon: faCalendarDays },
  { label: "Year", href: "/year", icon: faTableCellsLarge },
  { label: "Notes", href: "/notes", icon: faNoteSticky },
  { label: "Money", href: "/money", icon: faWallet },
  { label: "Books", href: "/books", icon: faBook },
  { label: "Stats", href: "/stats", icon: faDiceD20 },
];

// Exact match or a nested segment (e.g. /week/… still highlights Week).
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
