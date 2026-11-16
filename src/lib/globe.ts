// The globe standing on the home page's floor (see grid-room.ts), a little over it, in the middle: the land of the
// western hemisphere outlined on it, and the US. Seen a little from above, as the floor is — so what's on its face
// toward you stands up off it, not straight at you. It turns (a FloorCamera's x and d, longitude and latitude from
// facing the US) only so far, never round to the eastern hemisphere, and zooms (its zoom) in and out; and slides with
// the floor under it (see floor-camera.ts) where the floor's been moved.

import { cameraShows } from "./floor-camera";
import { FloorCamera, floorDepth, floorPoint, floorScale } from "./grid-room";

/** Where the globe faces at home: the middle of the US. */
export const GLOBE_LON = -96;
export const GLOBE_LAT = 38;
/** How far down on it you look (degrees): what it faces sits this far up from its middle. */
const VIEW_TILT = 28;
/** How far it turns from facing the US, at most (degrees), each way: west, east, south and north. */
const TURN = { west: 60, east: 50, south: 40, north: 25 };
/** As far out, and in, as it zooms. */
export const GLOBE_MIN_ZOOM = 0.8;
export const GLOBE_MAX_ZOOM = 3;

const RAD = Math.PI / 180;

/** Where the globe stands: on a `width` x `height` screen, its horizon `share` of the way down. */
export interface GlobePlace {
  width: number;
  height: number;
  share: number;
  /** Where on the floor it stands over, as the floor lies: [across, back] in floor px. */
  anchor: [number, number];
  /** Its radius at its own size, and how far over the floor it floats (px). */
  r: number;
  lift: number;
}

/**
 * The globe on a `width` x `height` screen (its horizon `share` of the way down): in the middle of the floor across at
 * screen x `centerX`, the floor's front edge at screen y `bottom` — standing over a spot most of the way to the front,
 * floating a little over it, as large as fits between there and just under the horizon (and the screen's sides).
 */
export function fitGlobe({ width, height, share, centerX, bottom }: { width: number; height: number; share: number; centerX: number; bottom: number }): GlobePlace {
  const horizon = height * share;
  const floor = bottom - horizon;
  const spotY = horizon + floor * 0.9;
  const depth = floorDepth(spotY, height, share);
  const lift = Math.max(8, floor * 0.04);
  const r = Math.max(24, Math.min((spotY - lift - (horizon + floor * 0.03)) / 2, width * 0.44));
  return { width, height, share, anchor: [(centerX - width / 2) / floorScale(depth), depth], r, lift };
}

/** The globe as it shows: its middle and radius on the screen (px), and where it faces. */
export interface GlobeView {
  cx: number;
  cy: number;
  R: number;
  /** The spot on the floor it floats over, on the screen. */
  spot: [number, number];
  // The orientation, as sines and cosines: the point at the disc's middle.
  lon0: number;
  sinLat0: number;
  cosLat0: number;
}

/** The globe turned as far as it goes at most, and zoomed no further than it goes. */
export function keepGlobe(camera: FloorCamera): FloorCamera {
  return {
    zoom: Math.min(GLOBE_MAX_ZOOM, Math.max(GLOBE_MIN_ZOOM, camera.zoom)),
    x: Math.min(TURN.east, Math.max(-TURN.west, camera.x)),
    d: Math.min(TURN.north, Math.max(-TURN.south, camera.d)),
  };
}

/** Where it faces: longitude and latitude. */
export function globeFacing(camera: FloorCamera): [number, number] {
  return [GLOBE_LON + camera.x, GLOBE_LAT + camera.d];
}

/** The globe turned to face `lon`, `lat`, zoomed `zoom` (kept within how far it goes). */
export function globeFacingCamera(lon: number, lat: number, zoom: number): FloorCamera {
  return keepGlobe({ zoom, x: lon - GLOBE_LON, d: lat - GLOBE_LAT });
}

/** The globe as it shows: turned and zoomed by `globe`, the floor under it moved by `floor`. */
export function globeView(place: GlobePlace, globe: FloorCamera, floor?: FloorCamera): GlobeView {
  const lying = floor ? cameraShows(floor, place.anchor) : place.anchor;
  const spot = floorPoint(lying[0], lying[1], place.width, place.height, place.share);
  const R = place.r * globe.zoom;
  const [lon, lat] = globeFacing(globe);
  const lat0 = (lat - VIEW_TILT) * RAD;
  return { cx: spot[0], cy: spot[1] - place.lift - R, R, spot, lon0: lon * RAD, sinLat0: Math.sin(lat0), cosLat0: Math.cos(lat0) };
}

/** Where `lon`, `lat` shows: screen x and y, and how far it faces you (above 0, on the near side; 1, straight at you). */
export function globePoint(view: GlobeView, lon: number, lat: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const phi = lat * RAD;
  const dl = lon * RAD - view.lon0;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosDl = Math.cos(dl);
  const x = cosPhi * Math.sin(dl);
  const y = view.cosLat0 * sinPhi - view.sinLat0 * cosPhi * cosDl;
  out[0] = view.cx + view.R * x;
  out[1] = view.cy - view.R * y;
  out[2] = view.sinLat0 * sinPhi + view.cosLat0 * cosPhi * cosDl;
  return out;
}

/** Where a line `px` long standing straight out of the globe at `lon`, `lat` ends, on the screen. */
export function globeStemTip(view: GlobeView, lon: number, lat: number, px: number): [number, number] {
  const [x, y] = globePoint(view, lon, lat);
  const out = 1 + px / view.R;
  return [view.cx + (x - view.cx) * out, view.cy + (y - view.cy) * out];
}

/** The point `degrees` away from `lon`, `lat` (along the globe) at bearing `bearing` (radians). */
function destination(lon: number, lat: number, degrees: number, bearing: number): [number, number] {
  const phi = lat * RAD;
  const delta = degrees * RAD;
  const sinPhi2 = Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(bearing);
  const phi2 = Math.asin(sinPhi2);
  const lambda2 = lon * RAD + Math.atan2(Math.sin(bearing) * Math.sin(delta) * Math.cos(phi), Math.cos(delta) - Math.sin(phi) * sinPhi2);
  return [lambda2 / RAD, phi2 / RAD];
}

/** A circle on the globe `degrees` round `lon`, `lat`, as a screen path — what of it's on the near side. */
export function globeRing(view: GlobeView, lon: number, lat: number, degrees: number, segments = 32): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) pts.push(destination(lon, lat, degrees, (i / segments) * Math.PI * 2));
  return globeLine(view, pts.flat(), false);
}

/** A ring (or line) of points on the globe, lon, lat, lon, lat …, read from "lon,lat lon,lat …". */
export function readRing(text: string): Float64Array {
  return Float64Array.from(text.split(/[ ,]/).map(Number));
}

/**
 * A ring (`closed`) or line of points on the globe — `pts` lon, lat, lon, lat … — as a screen path: what of it's on
 * the near side, cut off where it goes round the edge, and points closer together on the screen than `step` px drawn
 * as one.
 */
export function globeLine(view: GlobeView, pts: ArrayLike<number>, closed: boolean, step = 0.75): string {
  const n = pts.length / 2;
  if (n < 2) return "";
  let d = "";
  let drawing = false;
  let [lx, ly] = [0, 0];
  const p: [number, number, number] = [0, 0, 0];
  let prev: [number, number, number] | null = null;
  // Where the line between two points, one on each side, goes over the edge.
  const edge = (a: [number, number, number], b: [number, number, number]): [number, number] => {
    const t = a[2] / (a[2] - b[2]);
    const x = a[0] + (b[0] - a[0]) * t - view.cx;
    const y = a[1] + (b[1] - a[1]) * t - view.cy;
    const len = Math.hypot(x, y) || 1;
    return [view.cx + (x / len) * view.R, view.cy + (y / len) * view.R];
  };
  const count = closed ? n + 1 : n;
  for (let k = 0; k < count; k++) {
    const i = k % n;
    globePoint(view, pts[2 * i], pts[2 * i + 1], p);
    const here: [number, number, number] = [p[0], p[1], p[2]];
    if (here[2] > 0) {
      if (!drawing) {
        const [sx, sy] = prev && prev[2] <= 0 ? edge(prev, here) : [here[0], here[1]];
        d += `M${sx.toFixed(1)},${sy.toFixed(1)}`;
        [lx, ly] = [sx, sy];
        drawing = true;
      }
      if (Math.abs(here[0] - lx) + Math.abs(here[1] - ly) >= step || k === count - 1) {
        d += `L${here[0].toFixed(1)},${here[1].toFixed(1)}`;
        [lx, ly] = [here[0], here[1]];
      }
    } else if (drawing) {
      const [sx, sy] = edge(prev!, here);
      d += `L${sx.toFixed(1)},${sy.toFixed(1)}`;
      drawing = false;
    }
    prev = here;
  }
  return d;
}
