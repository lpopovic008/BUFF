// The US map laid on the home page's floor (see grid-room.ts), at the front of it, nearest you, and drawn flat on
// the screen where its points fall — so its lines are crisp wires like the grid's. Its near edge on the screen's
// bottom (a phone's tab bar), it reaches back no further than a given grid line (the third from the front), and is
// as large as fits between them, its land no wider than it's let be. Where the floor's been moved (see
// floor-camera.ts), it moves with it.

import { US_SIMPLE_OUTLINE_PATH } from "./team-cities";
import { FloorCamera, HORIZON_SHARE, floorDepth, floorPoint, floorScale } from "./grid-room";
import { cameraShows } from "./floor-camera";

const POINT = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;

const OUTLINE_POINTS = [...US_SIMPLE_OUTLINE_PATH.matchAll(POINT)].map((m) => [Number(m[1]), Number(m[2])] as const);
/** The mainland's extent, in map units. */
export const MAP_BOUNDS = {
  minX: Math.min(...OUTLINE_POINTS.map((p) => p[0])),
  maxX: Math.max(...OUTLINE_POINTS.map((p) => p[0])),
  minY: Math.min(...OUTLINE_POINTS.map((p) => p[1])),
  maxY: Math.max(...OUTLINE_POINTS.map((p) => p[1])),
};

export interface FloorMapFit {
  width: number;
  height: number;
  share: number;
  /** Floor px per map unit. */
  k: number;
  /** How far back on the floor the map's near edge lies, and how far across from the floor's middle its middle. */
  nearDepth: number;
  across: number;
  /** Where the floor's been moved — none, where it lies. */
  camera?: FloorCamera;
}

/**
 * The map on a `width` x `height` screen (its horizon `share` of the way down), its middle across at screen x
 * `centerX`: its near edge at screen y `bottom`, as large as it can be with its far edge no further back than screen
 * y `farthest`, and its land within `maxWidth` about its middle.
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
  const near = floorDepth(bottom, height, share);
  const across = (centerX - width / 2) / floorScale(near);
  const byDepth = (near - floorDepth(farthest, height, share)) / (MAP_BOUNDS.maxY - MAP_BOUNDS.minY);
  const at = (k: number): FloorMapFit => ({ width, height, share, k, nearDepth: near, across });
  // As deep as it may go, unless that's too wide somewhere: the floor's magnified more toward you, so each point of
  // the land is checked where it falls, the largest that fits found by halving.
  const fits = (k: number) =>
    OUTLINE_POINTS.every(([x, y]) => Math.abs(floorMapPoint(at(k), x, y)[0] - centerX) <= maxWidth / 2 + 1e-6);
  if (fits(byDepth)) return at(byDepth);
  let [lo, hi] = [0, byDepth];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return at(lo);
}

/** Where on the floor, as it lies, map point (x, y) in map units is: [across, back] in floor px. */
export function floorMapFloor(fit: FloorMapFit, x: number, y: number): [number, number] {
  const midX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2;
  return [fit.across + (x - midX) * fit.k, fit.nearDepth - (MAP_BOUNDS.maxY - y) * fit.k];
}

/** Where map point (x, y), in map units, shows on the screen. */
export function floorMapPoint(fit: FloorMapFit, x: number, y: number): [number, number] {
  const lying = floorMapFloor(fit, x, y);
  const [across, d] = fit.camera ? cameraShows(fit.camera, lying) : lying;
  return floorPoint(across, d, fit.width, fit.height, fit.share);
}

/** Where map point (x, y) shows on the screen, and how many screen px a map unit stands up off the floor there. */
export function floorMapStanding(fit: FloorMapFit, x: number, y: number): [number, number, number] {
  const lying = floorMapFloor(fit, x, y);
  const [across, d] = fit.camera ? cameraShows(fit.camera, lying) : lying;
  const [sx, sy] = floorPoint(across, d, fit.width, fit.height, fit.share);
  return [sx, sy, fit.k * (fit.camera?.zoom ?? 1) * floorScale(d)];
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
