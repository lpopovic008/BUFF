// The dashboard map's 3D camera. Every point of the flat 320x200 US map is
// projected through a camera that orbits it: `yaw` spins the map about its
// center, `tilt` rotates it back (pitch), as if seen from a camera low over
// its near edge — the near side sits close and the far side recedes — and
// `zoom` moves the camera in or out. The view always stays centered on the
// middle of the map at a fixed scale for a given zoom: turning the map never
// re-fits it, so parts of it may run past the edge of its frame.
//
// The land is a slab a few units thick with the real terrain on top (see
// TerrainCanvas, which runs this same math on the GPU); the SVG paths here
// are the flat slab, the fallback when WebGL isn't available.

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
}

/** The view the map always opens on. */
export const DEFAULT_CAMERA: MapCamera = { tilt: 32, yaw: 0, zoom: 1 };
export const MIN_TILT = 8;
export const MAX_TILT = 70;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 5;

// Distance from the eye to the near edge, in map units — smaller means a
// stronger perspective squeeze toward the far edge.
export const FOCAL = 400;
/** How high the land's top face (sea level) sits above the ground plane. */
export const SLAB_HEIGHT = 6;
// Vertical exaggeration: map units of rise per meter of elevation. Real
// relief is invisible at map scale (the Rockies are ~0.1% of the country's
// width), so it's stretched until 3,000 m stands ~15 units tall.
export const RISE_PER_METER = 15 / 3000;
// Stacked layers that fill the slab's side wall in the SVG fallback.
const WALL_STEPS = 8;
const PAD = 4;

export function clampTilt(tilt: number): number {
  return Math.min(MAX_TILT, Math.max(MIN_TILT, tilt));
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
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
    Math.abs(camera.zoom - DEFAULT_CAMERA.zoom) < 0.01
  );
}

/** Projects a flat-map point (x, y in US_MAP_VIEWBOX space), `height` units above the ground, into the view. Defaults to the slab's top face. */
export type MapProjector = (x: number, y: number, height?: number) => [number, number];

/**
 * The projection itself: [screenX, screenY, perspectiveScale] for a point.
 * The map spins about its center, then rotates back about its near edge; a
 * raised point lifts slightly toward the viewer and up the screen, which is
 * what exposes the land's camera-facing walls. Mirrored in TerrainCanvas's
 * vertex shader — keep the two in step.
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

/** The mainland outline as [x0, y0, x1, y1, ...], for point-in-US tests and the GPU mask. */
export const OUTLINE_POINTS: number[] = OUTLINE.xs.flatMap((x, i) => [x, OUTLINE.ys[i]]);

/** The state borders as polylines of [x0, y0, x1, y1, ...], for the GPU line pass. */
export const STATE_LINE_POLYLINES: number[][] = US_SIMPLE_STATE_LINES_PATH.split("M")
  .filter(Boolean)
  .map((seg) => [...seg.matchAll(POINT)].flatMap((m) => [Number(m[1]), Number(m[2])]));

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
  /** The view's rectangle in projected space — centered on the map's middle, sized by zoom. */
  view: MapView;
  viewBox: string;
  project: MapProjector;
  /** How much a spot is magnified by perspective (larger is nearer the camera). */
  scaleAt: (x: number, y: number, height?: number) => number;
}

/** The flat slab — the SVG fallback for when the WebGL terrain can't draw. */
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
  const [cx, cy] = project(CENTER[0], CENTER[1]);
  const halfW = BASE.halfW / camera.zoom;
  const halfH = BASE.halfH / camera.zoom;
  const view = { x: cx - halfW, y: cy - halfH, width: halfW * 2, height: halfH * 2 };
  const viewBox = `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.width.toFixed(2)} ${view.height.toFixed(2)}`;
  return { view, viewBox, project, scaleAt };
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
