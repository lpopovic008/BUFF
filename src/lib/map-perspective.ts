// The dashboard map's 3D camera. Every point of the flat 320x200 US map is
// projected through a camera that orbits it: `yaw` spins the map about its
// center, `tilt` rotates it back (pitch), as if seen from a camera low over
// its near edge — the near side sits close and the far side recedes — and
// `zoom` moves the camera in or out, and the view centers on a `target`
// point of the map — the middle of the country to start, anywhere the user
// pans or zooms toward after that. The scale is fixed for a given zoom:
// turning the map never re-fits it, so parts of it may run past the edge of
// its frame.
//
// The land is a slab a few units thick; the tilt shows its camera-facing
// side wall, which is what sells the perspective.

import { US_MAP_VIEWBOX, US_SIMPLE_OUTLINE_PATH, US_SIMPLE_STATE_LINES_PATH } from "./warroom-team-cities";

export const [, , MAP_W, MAP_H] = US_MAP_VIEWBOX.split(" ").map(Number);
/** Height of the flat (untilted) map space that a projector takes its input in. */
export const FLAT_MAP_HEIGHT = MAP_H;

export interface MapCamera {
  /** Degrees the map is rotated back from straight-down (0). */
  tilt: number;
  /** Degrees the map is spun about its center (0 = north up). */
  yaw: number;
  /** 1 = the opening view; 2 = everything twice as large. */
  zoom: number;
  /** The flat-map point the view is centered on. */
  tx: number;
  ty: number;
}

/** The view the map always opens on. */
export const DEFAULT_CAMERA: MapCamera = { tilt: 32, yaw: 0, zoom: 1, tx: 160, ty: 100 };
export const MIN_TILT = 8;
export const MAX_TILT = 70;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 5;

// Distance from the eye to the near edge, in map units — smaller means a
// stronger perspective squeeze toward the far edge.
export const FOCAL = 400;
/** How high the land's top face (sea level) sits above the ground plane. */
export const SLAB_HEIGHT = 6;
// Stacked layers that fill the slab's side wall.
const WALL_STEPS = 8;
const PAD = 4;

export function clampTilt(tilt: number): number {
  return Math.min(MAX_TILT, Math.max(MIN_TILT, tilt));
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Keeps the view's target on the map, so it can't be panned off into empty space. */
export function clampTarget(tx: number, ty: number): [number, number] {
  return [Math.min(MAP_W, Math.max(0, tx)), Math.min(MAP_H, Math.max(0, ty))];
}

/** `yaw` folded into (-180, 180], so a full turn reads as no turn. */
export function normalizeYaw(yaw: number): number {
  const y = ((yaw % 360) + 360) % 360;
  return y > 180 ? y - 360 : y;
}

export function isDefaultCamera(camera: MapCamera): boolean {
  return (
    Math.abs(camera.tilt - DEFAULT_CAMERA.tilt) < 0.5 &&
    Math.abs(normalizeYaw(camera.yaw - DEFAULT_CAMERA.yaw)) < 0.5 &&
    Math.abs(camera.zoom - DEFAULT_CAMERA.zoom) < 0.01 &&
    Math.abs(camera.tx - DEFAULT_CAMERA.tx) < 0.5 &&
    Math.abs(camera.ty - DEFAULT_CAMERA.ty) < 0.5
  );
}

/** Projects a flat-map point (x, y in US_MAP_VIEWBOX space), `height` units above the ground, into the view. Defaults to the slab's top face. */
export type MapProjector = (x: number, y: number, height?: number) => [number, number];

/**
 * The projection itself: [screenX, screenY, perspectiveScale] for a point.
 * The map spins about its center, then rotates back about its near edge; a
 * raised point lifts slightly toward the viewer and up the screen, which is
 * what exposes the slab's camera-facing wall.
 */
export function cameraTransform({ tilt, yaw }: MapCamera): (x: number, y: number, height: number) => [number, number, number] {
  const ts = Math.sin((tilt * Math.PI) / 180);
  const tc = Math.cos((tilt * Math.PI) / 180);
  const ys = Math.sin((yaw * Math.PI) / 180);
  const yc = Math.cos((yaw * Math.PI) / 180);
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  return (x, y, height) => {
    const dx = x - cx;
    const dy = y - cy;
    const rx = cx + dx * yc - dy * ys;
    const ry = cy + dx * ys + dy * yc;
    const back = MAP_H - ry;
    const up = back * tc + height * ts;
    const depth = back * ts - height * tc;
    const scale = FOCAL / (FOCAL + depth);
    return [cx + (rx - cx) * scale, MAP_H - up * scale, scale];
  };
}

/**
 * The inverse of cameraTransform: the flat-map point that lands at projected
 * position (sx, sy) when lifted `height` units — what's under the user's
 * finger or cursor, for zooming toward it and dragging the map around.
 */
export function unproject({ tilt, yaw }: MapCamera, sx: number, sy: number, height = SLAB_HEIGHT): [number, number] {
  const ts = Math.sin((tilt * Math.PI) / 180);
  const tc = Math.cos((tilt * Math.PI) / 180);
  const ys = Math.sin((yaw * Math.PI) / 180);
  const yc = Math.cos((yaw * Math.PI) / 180);
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  // Solve the tilt for how far back the point sits, then undo the spin.
  const u = MAP_H - sy;
  const back = (FOCAL * height * ts - u * FOCAL + u * height * tc) / (u * ts - FOCAL * tc);
  const depth = back * ts - height * tc;
  const scale = FOCAL / (FOCAL + depth);
  const rx = cx + (sx - cx) / scale;
  const ry = MAP_H - back;
  const dx = rx - cx;
  const dy = ry - cy;
  return [cx + dx * yc + dy * ys, cy - dx * ys + dy * yc];
}

const POINT = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;

/** A path split into its x,y pairs and the command text between them, so re-projecting it never re-parses. */
interface CompiledPath {
  glue: string[];
  xs: number[];
  ys: number[];
}

function compile(d: string): CompiledPath {
  const parts = d.split(POINT);
  const glue: string[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 2 < parts.length; i += 3) {
    glue.push(parts[i]);
    xs.push(Number(parts[i + 1]));
    ys.push(Number(parts[i + 2]));
  }
  glue.push(parts[parts.length - 1]);
  return { glue, xs, ys };
}

const OUTLINE = compile(US_SIMPLE_OUTLINE_PATH);
const STATE_LINES = compile(US_SIMPLE_STATE_LINES_PATH);

/** The mainland outline as [x0, y0, x1, y1, ...], for point-in-US tests. */
export const OUTLINE_POINTS: number[] = OUTLINE.xs.flatMap((x, i) => [x, OUTLINE.ys[i]]);

/** Whether a flat-map point is on US land. */
export function insideUS(x: number, y: number): boolean {
  const r = OUTLINE_POINTS;
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i];
    const yi = r[i + 1];
    const xj = r[j];
    const yj = r[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(path: CompiledPath, project: MapProjector, height: number): string {
  let out = "";
  for (let i = 0; i < path.xs.length; i++) {
    const [px, py] = project(path.xs[i], path.ys[i], height);
    out += `${path.glue[i]}${px.toFixed(2)},${py.toFixed(2)}`;
  }
  return out + path.glue[path.xs.length];
}

export interface MapView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapScene {
  /** The view's rectangle in projected space — centered on the camera's target, sized by zoom. */
  view: MapView;
  viewBox: string;
  project: MapProjector;
  /** How much a spot is magnified by perspective (larger is nearer the camera). */
  scaleAt: (x: number, y: number, height?: number) => number;
  /** The perspective magnification at the land's farthest point from the camera. */
  farScale: number;
}

/** The slab's paths for one camera view. */
export interface SlabPaths {
  /** The land's top face (coast and national borders only). */
  outline: string;
  /** Interior state borders, on the top face. */
  stateLines: string;
  /** The side wall, ground level first. */
  wallLayers: string[];
}

const CENTER: [number, number] = [MAP_W / 2, MAP_H / 2];

function projectorFor(camera: MapCamera): { project: MapProjector; scaleAt: MapScene["scaleAt"] } {
  const t = cameraTransform(camera);
  return {
    project: (x, y, height = SLAB_HEIGHT) => {
      const [px, py] = t(x, y, height);
      return [px, py];
    },
    scaleAt: (x, y, height = SLAB_HEIGHT) => t(x, y, height)[2],
  };
}

// The opening view's half-size around the map's projected center: wide
// enough for the whole country, plus room above for the mountains. Every
// view is this, divided by its zoom.
const BASE = (() => {
  const { project } = projectorFor(DEFAULT_CAMERA);
  const [cx, cy] = project(CENTER[0], CENTER[1]);
  let halfW = 0;
  let up = 0;
  let down = 0;
  for (let i = 0; i < OUTLINE.xs.length; i++) {
    for (const h of [0, SLAB_HEIGHT]) {
      const [px, py] = project(OUTLINE.xs[i], OUTLINE.ys[i], h);
      halfW = Math.max(halfW, Math.abs(px - cx));
      up = Math.max(up, cy - py);
      down = Math.max(down, py - cy);
    }
  }
  return { halfW: halfW + PAD, halfH: Math.max(up, down) + PAD };
})();

/** The map's fixed width-to-height ratio on the page. */
export const MAP_ASPECT = BASE.halfW / BASE.halfH;

export function buildMapScene(camera: MapCamera): MapScene {
  const { project, scaleAt } = projectorFor(camera);
  const [cx, cy] = project(camera.tx, camera.ty);
  const halfW = BASE.halfW / camera.zoom;
  const halfH = BASE.halfH / camera.zoom;
  const view = { x: cx - halfW, y: cy - halfH, width: halfW * 2, height: halfH * 2 };
  const viewBox = `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.width.toFixed(2)} ${view.height.toFixed(2)}`;
  let farScale = Infinity;
  for (let i = 0; i < OUTLINE.xs.length; i++) farScale = Math.min(farScale, scaleAt(OUTLINE.xs[i], OUTLINE.ys[i]));
  return { view, viewBox, project, scaleAt, farScale };
}

export function buildSlabPaths(camera: MapCamera): SlabPaths {
  const { project } = projectorFor(camera);
  return {
    outline: render(OUTLINE, project, SLAB_HEIGHT),
    stateLines: render(STATE_LINES, project, SLAB_HEIGHT),
    wallLayers: Array.from({ length: WALL_STEPS }, (_, i) => render(OUTLINE, project, (i * SLAB_HEIGHT) / WALL_STEPS)),
  };
}

export const DEFAULT_SCENE = buildMapScene(DEFAULT_CAMERA);

/**
 * Perspective magnification at the opening view, for sizing and fading the
 * game tags by how close they are to the camera: the map's middle, and the
 * nearest and farthest points of the land.
 */
export const DEFAULT_SCALES = (() => {
  const { scaleAt } = projectorFor(DEFAULT_CAMERA);
  let near = 0;
  let far = Infinity;
  for (let i = 0; i < OUTLINE.xs.length; i++) {
    const s = scaleAt(OUTLINE.xs[i], OUTLINE.ys[i]);
    near = Math.max(near, s);
    far = Math.min(far, s);
  }
  return { center: scaleAt(CENTER[0], CENTER[1]), near, far };
})();
