// The US map on the home page, projected: a beam of light from a single spot in the middle of the room's floor (see
// grid-room.ts) up to a frame floating over the floor, facing you square on, the lower 48 states' outline lit in it.
// Its picture moves inside the frame (a FloorCamera's x and d, in map units from the map's middle) and zooms (its
// zoom), never leaving it; and the whole of it — the spot, the beam and the frame — slides with the floor under it
// (see floor-camera.ts) where the floor's been moved.

import { US_SIMPLE_OUTLINE_PATH } from "./team-cities";
import { cameraShows } from "./floor-camera";
import { FloorCamera, floorDepth, floorPoint, floorScale } from "./grid-room";

const POINT = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
const OUTLINE_POINTS = [...US_SIMPLE_OUTLINE_PATH.matchAll(POINT)].map((m) => [Number(m[1]), Number(m[2])] as const);

/** The lower 48's extent, in map units. */
export const MAP_BOUNDS = {
  minX: Math.min(...OUTLINE_POINTS.map((p) => p[0])),
  maxX: Math.max(...OUTLINE_POINTS.map((p) => p[0])),
  minY: Math.min(...OUTLINE_POINTS.map((p) => p[1])),
  maxY: Math.max(...OUTLINE_POINTS.map((p) => p[1])),
};
const MAP_W = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
const MAP_H = MAP_BOUNDS.maxY - MAP_BOUNDS.minY;
const MAP_MID = [(MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2, (MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2] as const;

/** As far out, and in, as the picture zooms. */
export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 6;
/** How much of the frame the whole map fills at its own size. */
const FILL = 0.9;

export interface ProjectorFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the projector stands: on a `width` x `height` screen, its horizon `share` of the way down. */
export interface ProjectorPlace {
  width: number;
  height: number;
  share: number;
  /** The spot on the floor its beam comes from, on the screen; and where that is on the floor, as it lies. */
  source: [number, number];
  anchor: [number, number];
  /** The frame it lights, floating over the floor (screen px). */
  frame: ProjectorFrame;
}

/**
 * The projector on a `width` x `height` screen (its horizon `share` of the way down): its spot on the floor near the
 * floor's front edge (screen y `bottom`) at screen x `centerX`; its frame floating over the middle of the floor above
 * it, as large as fits under screen y `highest` and within `maxWidth` across.
 */
export function fitProjector({
  width,
  height,
  share,
  centerX,
  bottom,
  maxWidth,
  highest,
}: {
  width: number;
  height: number;
  share: number;
  centerX: number;
  bottom: number;
  maxWidth: number;
  highest: number;
}): ProjectorPlace {
  const horizon = height * share;
  const floor = bottom - horizon;
  const sourceY = horizon + floor * 0.85;
  const frameBottom = horizon + floor * 0.6;
  const aspect = MAP_W / MAP_H;
  const frameW = Math.max(40, Math.min(maxWidth, (frameBottom - highest) * aspect));
  const frameH = frameW / aspect;
  const depth = floorDepth(sourceY, height, share);
  return {
    width,
    height,
    share,
    source: [centerX, sourceY],
    anchor: [(centerX - width / 2) / floorScale(depth), depth],
    frame: { left: centerX - frameW / 2, top: frameBottom - frameH, width: frameW, height: frameH },
  };
}

/** The projector as it shows: its spot and frame on the screen, and its picture — px per map unit, and the map point at the frame's middle. */
export interface ProjectorView {
  source: [number, number];
  frame: ProjectorFrame;
  s: number;
  center: [number, number];
}

/** How many px a map unit is in the frame, zoomed `zoom`. */
function scaleFor(place: ProjectorPlace, zoom: number): number {
  return ((place.frame.width * FILL) / MAP_W) * zoom;
}

/** The projector as it shows: its picture moved and zoomed by `map`, the floor under it moved by `floor`. */
export function projectorView(place: ProjectorPlace, map: FloorCamera, floor?: FloorCamera): ProjectorView {
  let [dx, dy] = [0, 0];
  if (floor) {
    const [across, d] = cameraShows(floor, place.anchor);
    const [sx, sy] = floorPoint(across, d, place.width, place.height, place.share);
    [dx, dy] = [sx - place.source[0], sy - place.source[1]];
  }
  const { left, top, width, height } = place.frame;
  return {
    source: [place.source[0] + dx, place.source[1] + dy],
    frame: { left: left + dx, top: top + dy, width, height },
    s: scaleFor(place, map.zoom),
    center: [MAP_MID[0] + map.x, MAP_MID[1] + map.d],
  };
}

/** Where map point (x, y), in map units, shows on the screen. */
export function projectorPoint(view: ProjectorView, x: number, y: number): [number, number] {
  const { frame, s, center } = view;
  return [frame.left + frame.width / 2 + (x - center[0]) * s, frame.top + frame.height / 2 + (y - center[1]) * s];
}

/** The map point showing at screen point (x, y). */
export function projectorUnder(view: ProjectorView, x: number, y: number): [number, number] {
  const { frame, s, center } = view;
  return [center[0] + (x - frame.left - frame.width / 2) / s, center[1] + (y - frame.top - frame.height / 2) / s];
}

/** An SVG path in map units (absolute x,y pairs), as it shows in the frame. */
export function projectorPath(view: ProjectorView, d: string): string {
  return d.replace(POINT, (_, x: string, y: string) => {
    const [sx, sy] = projectorPoint(view, Number(x), Number(y));
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  });
}

/** The picture kept zoomed no further than it goes, and its middle on the map. */
export function keepMap(camera: FloorCamera): FloorCamera {
  return {
    zoom: Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, camera.zoom)),
    x: Math.min(MAP_W / 2, Math.max(-MAP_W / 2, camera.x)),
    d: Math.min(MAP_H / 2, Math.max(-MAP_H / 2, camera.d)),
  };
}

/** The picture zoomed `zoom`, moved so map point `grab` shows at screen point `at` (kept within how far it goes). */
export function mapPutting(place: ProjectorPlace, grab: [number, number], at: [number, number], zoom: number, floor?: FloorCamera): FloorCamera {
  const z = Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, zoom));
  const { frame } = projectorView(place, { zoom: z, x: 0, d: 0 }, floor);
  const s = scaleFor(place, z);
  const center = [grab[0] - (at[0] - frame.left - frame.width / 2) / s, grab[1] - (at[1] - frame.top - frame.height / 2) / s];
  return keepMap({ zoom: z, x: center[0] - MAP_MID[0], d: center[1] - MAP_MID[1] });
}
