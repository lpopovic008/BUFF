// The US map laid on the home page's floor (see grid-room.ts), at the front of it, nearest you, and drawn flat on
// the screen where its points fall — so its lines are crisp wires like the grid's. It reaches no further back than a
// given grid line (the third from the front), and no nearer than the screen's bottom (a phone's tab bar), and is as
// large as fits between them, no wider than it's let be: where the floor near you is magnified too much for that
// (a phone's narrow screen), it sits a little back from the bottom so it can be bigger.

import { US_SIMPLE_OUTLINE_PATH } from "./team-cities";
import { FLOOR_TILT, HORIZON_SHARE, PERSPECTIVE_PX, floorDepth, floorY } from "./grid-room";

const POINT = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
const SIN = Math.sin((FLOOR_TILT * Math.PI) / 180);

const OUTLINE_POINTS = [...US_SIMPLE_OUTLINE_PATH.matchAll(POINT)].map((m) => [Number(m[1]), Number(m[2])] as const);
/** The mainland's extent, in map units. */
export const MAP_BOUNDS = {
  minX: Math.min(...OUTLINE_POINTS.map((p) => p[0])),
  maxX: Math.max(...OUTLINE_POINTS.map((p) => p[0])),
  minY: Math.min(...OUTLINE_POINTS.map((p) => p[1])),
  maxY: Math.max(...OUTLINE_POINTS.map((p) => p[1])),
};

/** How the floor magnifies a point `d` px back from the horizon's hinge. */
function scaleAt(d: number): number {
  return PERSPECTIVE_PX / (PERSPECTIVE_PX - d * SIN);
}

export interface FloorMapFit {
  width: number;
  height: number;
  share: number;
  /** Floor px per map unit. */
  k: number;
  /** How far back on the floor the map's near edge lies, and how far across from the floor's middle its middle. */
  nearDepth: number;
  across: number;
}

/**
 * The map on a `width` x `height` screen (its horizon `share` of the way down), its middle across at screen x
 * `centerX`: as large as it can be with its far edge no further back than screen y `farthest`, its near edge no
 * nearer than screen y `bottom`, and no wider than `maxWidth` there.
 */
export function fitFloorMap({
  width,
  height,
  share = HORIZON_SHARE,
  centerX,
  bottom,
  farthest,
  maxWidth,
}: {
  width: number;
  height: number;
  share?: number;
  centerX: number;
  bottom: number;
  farthest: number;
  maxWidth: number;
}): FloorMapFit {
  const far = floorDepth(farthest, height, share);
  const deep = MAP_BOUNDS.maxY - MAP_BOUNDS.minY;
  const wide = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
  // As deep as the room between the far line and the near edge allows, and as wide as the width allows there: the
  // first grows as the near edge comes forward, the second shrinks (the floor's magnified more), so the largest map
  // has its near edge where they meet — or at the bottom, if they don't.
  const byDepth = (near: number) => (near - far) / deep;
  const byWidth = (near: number) => maxWidth / (wide * scaleAt(near));
  let near = floorDepth(bottom, height, share);
  if (byDepth(near) > byWidth(near)) {
    let [lo, hi] = [far, near];
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (byDepth(mid) > byWidth(mid)) hi = mid;
      else lo = mid;
    }
    near = lo;
  }
  const k = Math.min(byDepth(near), byWidth(near));
  return { width, height, share, k, nearDepth: near, across: (centerX - width / 2) / scaleAt(near) };
}

/** Where map point (x, y), in map units, shows on the screen, and how magnified the floor is there. */
export function floorMapPoint(fit: FloorMapFit, x: number, y: number): [number, number, number] {
  const midX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2;
  const d = fit.nearDepth - (MAP_BOUNDS.maxY - y) * fit.k;
  const scale = scaleAt(d);
  return [fit.width / 2 + (fit.across + (x - midX) * fit.k) * scale, floorY(d, fit.height, fit.share), scale];
}

/** An SVG path in map units (absolute x,y pairs), laid on the floor in screen px. */
export function floorMapPath(fit: FloorMapFit, d: string): string {
  return d.replace(POINT, (_, x: string, y: string) => {
    const [sx, sy] = floorMapPoint(fit, Number(x), Number(y));
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  });
}

/** A circle on the floor around map point (x, y), its radius in map units, as a screen path. */
export function floorMapRing(fit: FloorMapFit, x: number, y: number, radius: number, segments = 32): string {
  let d = "";
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const [sx, sy] = floorMapPoint(fit, x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    d += `${i ? "L" : "M"}${sx.toFixed(1)},${sy.toFixed(1)}`;
  }
  return d + "Z";
}

/** The screen y of the top of the map's land — its far edge. */
export function floorMapTop(fit: FloorMapFit): number {
  return Math.min(...OUTLINE_POINTS.map(([x, y]) => floorMapPoint(fit, x, y)[1]));
}
