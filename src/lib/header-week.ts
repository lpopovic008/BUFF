// The week a page is showing, handed up to the page header so its "Week N"
// becomes the picker for it (the league page, the recaps), rather than a
// picker of its own.

import { useSyncExternalStore } from "react";

export interface HeaderWeek {
  /** The week the page shows. */
  week: number;
  /** The NFL's current week. */
  currentWeek: number;
  /** The season's final week (the championship). */
  lastWeek: number;
  /** Weeks after this are the playoffs; null when unknown. */
  regularSeasonWeeks: number | null;
  /** The first week to offer: 1, or 0 for a page with a preseason (the recaps). */
  firstWeek?: number;
  onChange: (week: number) => void;
}

let current: HeaderWeek | null = null;
const listeners = new Set<() => void>();

/** Makes the header's week a picker for `week`, or plain again with null. */
export function setHeaderWeek(week: HeaderWeek | null): void {
  if (week === current) return;
  current = week;
  listeners.forEach((l) => l());
}

/** The week picker the header should show, if a page has handed one up. */
export function useHeaderWeek(): HeaderWeek | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
    () => null
  );
}
