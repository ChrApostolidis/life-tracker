import {
  faBook,
  faCalendar,
  faCalendarDay,
  faCalendarDays,
  faCalendarWeek,
  faDiceD20,
  faDumbbell,
  faFilm,
  faHouse,
  faListCheck,
  faNoteSticky,
  faPenNib,
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

// A sidebar entry that opens a sub-panel of links instead of navigating.
export type NavGroup = {
  label: string;
  icon: IconDefinition;
  items: NavItem[];
  // Routes that belong to the group without being one of its links (/day/…).
  alsoMatches?: string[];
};

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// The sidebar's top level. Inbox is intentionally omitted until the /inbox route exists.
export const navEntries: NavEntry[] = [
  { label: "Home", href: "/", icon: faHouse },
  {
    label: "Calendar",
    icon: faCalendar,
    items: [
      { label: "Today", href: "/today", icon: faCalendarDay },
      { label: "Week", href: "/week", icon: faCalendarWeek },
      { label: "Month", href: "/month", icon: faCalendarDays },
      { label: "Year", href: "/year", icon: faTableCellsLarge },
    ],
    alsoMatches: ["/day"],
  },
  { label: "Habits", href: "/habits", icon: faListCheck },
  { label: "Gym", href: "/gym", icon: faDumbbell },
  { label: "Journal", href: "/journal", icon: faPenNib },
  { label: "Notes", href: "/notes", icon: faNoteSticky },
  { label: "Money", href: "/money", icon: faWallet },
  { label: "Books", href: "/books", icon: faBook },
  { label: "Watchlist", href: "/watchlist", icon: faFilm },
  { label: "Stats", href: "/stats", icon: faDiceD20 },
];

// Every link, groups flattened — the mobile top bar reads route titles from here.
export const navItems: NavItem[] = navEntries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));

// Exact match or a nested segment (e.g. /week/… still highlights Week).
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

// The group the current route lives in, if any — the sidebar opens it on arrival.
export function groupForPath(pathname: string): NavGroup | null {
  for (const entry of navEntries) {
    if (!isNavGroup(entry)) continue;
    const paths = [...entry.items.map((item) => item.href), ...(entry.alsoMatches ?? [])];
    if (paths.some((path) => isActivePath(pathname, path))) return entry;
  }
  return null;
}
