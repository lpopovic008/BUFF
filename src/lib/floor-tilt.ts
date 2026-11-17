// How far the home page's floor is laid back (see grid-room's FLOOR_TILT) — less, looked down on more, the more live
// games' fields there are on it (see FloorFields), so the fields farther back don't flatten out to nothing. The floor
// stays hinged at the horizon, so the horizon never moves. Shared by what draws the floor (FloorGrid) and what's laid
// on it (FloorFields), so they keep to the same floor as it eases from one to the next.

import { FLOOR_TILT } from "./grid-room";

/** How far the floor's laid back with the most fields on it (degrees). */
export const MOST_FIELDS_TILT = 70;
/** As many fields as the floor holds (see field-layout's MOST_FIELDS): laid back that much less from there. */
const MOST = 9;

/** How far the floor's laid back for `count` fields on it: as it lies for one (or none), less with each more. */
export function tiltFor(count: number): number {
  const n = Math.max(1, Math.min(MOST, Math.floor(count)));
  return FLOOR_TILT - ((FLOOR_TILT - MOST_FIELDS_TILT) * (n - 1)) / (MOST - 1);
}

/** How far the floor's laid back now, for whatever's drawing it to follow. */
export interface FloorTiltStore {
  get: () => number;
  set: (tilt: number) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createFloorTiltStore(initial = FLOOR_TILT): FloorTiltStore {
  let tilt = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => tilt,
    set: (next) => {
      if (Math.abs(next - tilt) < 1e-6) return;
      tilt = next;
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
