// The next-kickoff countdown, handed up to the page header while the
// dashboard's own clock is scrolled out of sight, so it's never off screen.

import { useSyncExternalStore } from "react";

let target: number | null = null;
const listeners = new Set<() => void>();

/** Shows a countdown to `kickoff` (ms) in the header, or clears it with null. */
export function setHeaderKickoff(kickoff: number | null): void {
  if (kickoff === target) return;
  target = kickoff;
  listeners.forEach((l) => l());
}

/** The kickoff the header should count down to, if any. */
export function useHeaderKickoff(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => target,
    () => null
  );
}
