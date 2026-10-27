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

/** Where a floor point shows on the screen. */
export function screenAt(u: number, d: number, { width, height }: Viewport): [number, number] {
  const a = (FLOOR_TILT * Math.PI) / 180;
  const scale = PERSPECTIVE_PX / (PERSPECTIVE_PX - d * Math.sin(a));
  return [width / 2 + (u - width - width / 2) * scale, height * HORIZON_SHARE + d * Math.cos(a) * scale];
}

export interface FloorFit {
  /** World px per map unit. */
  k: number;
  /** Where the map's top-left sits on the floor, in floor px. */
  u: number;
  d: number;
}

/**
 * The largest the map can be laid on the floor with every outline point (`points`: [x0, y0, x1, y1, ...], in map
 * units) still on screen: its far edge on the horizon (a map pushed back only shrinks), centred across the screen,
 * and within `side` px of the screen's sides and `bottom` px of its bottom.
 */
export function fitMap(points: number[], view: Viewport, side: number, bottom: number): FloorFit {
  let [minX, maxX, minY] = [Infinity, -Infinity, Infinity];
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
  }
  const place = (k: number): FloorFit => ({ k, u: view.width * 1.5 - (k * (minX + maxX)) / 2, d: -k * minY });
  const fits = (k: number) => {
    const { u, d } = place(k);
    for (let i = 0; i < points.length; i += 2) {
      const pd = d + k * points[i + 1];
      // Past the viewer, a point's no longer anywhere on the screen.
      if (pd * Math.sin((FLOOR_TILT * Math.PI) / 180) >= PERSPECTIVE_PX) return false;
      const [x, y] = screenAt(u + k * points[i], pd, view);
      if (x < side || x > view.width - side || y > view.height - bottom) return false;
    }
    return true;
  };
  let [lo, hi] = [0, 100];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return place(lo);
}
