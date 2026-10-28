// The US map laid on the home page's floor (see grid-room.ts), at the front of it, nearest you, and drawn flat on
// the screen where its points fall — so its lines are crisp wires like the grid's. Only so much of the floor's
// perspective is let through it: the map is kept small enough that its far edge shows at no less than
// MIN_FAR_SCALE of its near edge's scale (and narrower still on a narrow screen), so it never smears into a long
// trapezoid — on a tall screen, where the floor near you is magnified the most, that keeps it narrower too.

import { US_SIMPLE_OUTLINE_PATH } from "./team-cities";
import { FLOOR_TILT, HORIZON_SHARE, PERSPECTIVE_PX, floorDepth, floorY } from "./grid-room";

const POINT = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
const SIN = Math.sin((FLOOR_TILT * Math.PI) / 180);

/** How small the map's far edge may show next to its near edge. */
export const MIN_FAR_SCALE = 0.6;

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
 * The map on a `width` x `height` screen (its horizon `share` of the way down): its near edge on screen y
 * `bottom`, its middle across at screen x `centerX` there, as large as it can be with its near edge no wider than
 * `maxWidth` and its far edge at no less than `minFarScale` of its near edge's scale.
 */
export function fitFloorMap({
  width,
  height,
  share = HORIZON_SHARE,
  centerX,
  bottom,
  maxWidth,
  minFarScale = MIN_FAR_SCALE,
}: {
  width: number;
  height: number;
  share?: number;
  centerX: number;
  bottom: number;
  maxWidth: number;
  minFarScale?: number;
}): FloorMapFit {
  const nearDepth = floorDepth(bottom, height, share);
  const near = scaleAt(nearDepth);
  // From the near edge to where the floor would meet the eye; the far edge's scale over the near edge's is that
  // over itself plus the map's depth.
  const toEye = PERSPECTIVE_PX / SIN - nearDepth;
  const deepest = (toEye * (1 - minFarScale)) / minFarScale;
  const k = Math.min(deepest / (MAP_BOUNDS.maxY - MAP_BOUNDS.minY), maxWidth / ((MAP_BOUNDS.maxX - MAP_BOUNDS.minX) * near));
  return { width, height, share, k, nearDepth, across: (centerX - width / 2) / near };
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
