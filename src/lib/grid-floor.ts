// The home page's room (see GridRoom): a floor hinged at the horizon and laid
// back almost flat under a CSS perspective, with the US map drawn on it. The
// floor's own coordinates are px on the plane before it's laid back: across
// from its left edge (a screen's width left of the screen, as it runs a
// screen's width out either side), and back from the horizon toward you.

/** How far down the screen the horizon sits. */
export const HORIZON_SHARE = 0.64;
/** The room's CSS perspective, in px. */
export const PERSPECTIVE_PX = 520;
/** How far the floor is laid back from upright, in degrees. */
export const FLOOR_TILT = 80;

export interface Viewport {
  width: number;
  height: number;
}

/**
 * The floor point under a point on the screen, and how much the floor is
 * magnified there (1 at the horizon, more toward you). Null at or above the
 * horizon, where there's no floor.
 */
export function floorAt(screenX: number, screenY: number, { width, height }: Viewport): { u: number; d: number; scale: number } | null {
  const horizon = height * HORIZON_SHARE;
  const below = screenY - horizon;
  if (below <= 0) return null;
  const a = (FLOOR_TILT * Math.PI) / 180;
  // A point d back from the hinge sits d·cos(a) below it and d·sin(a) toward you; seen through the perspective,
  // below = d·cos(a)·p / (p − d·sin(a)). Solved for d:
  const d = (below * PERSPECTIVE_PX) / (Math.cos(a) * PERSPECTIVE_PX + below * Math.sin(a));
  const scale = PERSPECTIVE_PX / (PERSPECTIVE_PX - d * Math.sin(a));
  // Across, the perspective spreads points out from the middle of the screen; the floor starts a screen's width left.
  const u = width / 2 + (screenX - width / 2) / scale + width;
  return { u, d, scale };
}

/** Where a floor point shows on the screen (the inverse of floorAt). */
export function screenAt(u: number, d: number, { width, height }: Viewport): [number, number] {
  const a = (FLOOR_TILT * Math.PI) / 180;
  const scale = PERSPECTIVE_PX / (PERSPECTIVE_PX - d * Math.sin(a));
  return [width / 2 + (u - width - width / 2) * scale, height * HORIZON_SHARE + d * Math.cos(a) * scale];
}

export interface FloorFraming {
  /** The world's offset on the floor, in floor px. */
  x: number;
  y: number;
  /** The world's scale on the floor. */
  zoom: number;
}

/** The framing that puts world point (wx, wy) — in world px — on floor point (u, d), at a zoom. */
export function frameOn(wx: number, wy: number, u: number, d: number, zoom: number): FloorFraming {
  return { x: u - wx * zoom, y: d - wy * zoom, zoom };
}

/** The stops a camera tour of the week's games makes, in order: every game, by kickoff, then id. */
export function tourStops<T extends { id: string; kickoff: string }>(games: T[]): T[] {
  return games
    .slice()
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime() || a.id.localeCompare(b.id));
}
