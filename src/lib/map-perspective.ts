// The dashboard map's 3D view. Every point of the flat 320x200 US map is
// projected through a camera that orbits it: `yaw` spins the map about its
// center, `tilt` rotates it back (pitch), as if seen from a camera low over
// its near edge — the near side sits close and the far side recedes. The
// land is a slab raised a few units off the ground, and on top of it the
// real terrain (see us-terrain.ts) rises in terraces — one per elevation
// band, each lifted to its altitude with its own camera-facing wall — so
// the Rockies, the Sierra and the Appalachians stand up off the plains.
// The map is interactive (see useMapCamera), so a scene is rebuilt per
// camera change; the paths are a few thousand points, parsed once here so a
// rebuild is just arithmetic and string joins.

import { US_MAP_VIEWBOX, US_SIMPLE_OUTLINE_PATH } from "./warroom-team-cities";
import { TERRAIN_BANDS, TERRAIN_RAISED_BORDER, TERRAIN_STATE_LINES, TERRAIN_THRESHOLDS } from "./us-terrain";

const [, , MAP_W, MAP_H] = US_MAP_VIEWBOX.split(" ").map(Number);
/** Height of the flat (untilted) map space that a scene's `project` takes its input in. */
export const FLAT_MAP_HEIGHT = MAP_H;

export interface MapCamera {
  /** Degrees the map is rotated back from straight-down (0). */
  tilt: number;
  /** Degrees the map is spun about its center (0 = north up). */
  yaw: number;
}

/** The view the map always opens on. */
export const DEFAULT_CAMERA: MapCamera = { tilt: 32, yaw: 0 };
export const MIN_TILT = 8;
export const MAX_TILT = 70;

// Distance from the eye to the near edge, in map units — smaller means a
// stronger perspective squeeze toward the far edge.
const FOCAL = 400;
// How high the land's top face sits above the ground plane.
const SLAB_HEIGHT = 6;
// Stacked layers that fill the side wall between ground and top.
const WALL_STEPS = 8;
const PAD = 4;
// Vertical exaggeration: map units of rise per meter of elevation. Real
// relief is invisible at map scale (the Rockies are ~0.1% of the country's
// width), so it's stretched until 3,000 m stands ~15 units tall.
const RISE_PER_METER = 15 / 3000;
// A terrace wall is stacked from layers at most this far apart.
const TERRACE_WALL_STEP = 0.9;

/** The height (map units above the ground plane) of terrain band `k` — 0 is the slab's own top. */
function levelHeight(k: number): number {
  return k <= 0 ? SLAB_HEIGHT : SLAB_HEIGHT + TERRAIN_THRESHOLDS[k - 1] * RISE_PER_METER;
}

export function clampTilt(tilt: number): number {
  return Math.min(MAX_TILT, Math.max(MIN_TILT, tilt));
}

/** `yaw` folded into (-180, 180], so a full turn reads as no turn. */
export function normalizeYaw(yaw: number): number {
  const y = ((yaw % 360) + 360) % 360;
  return y > 180 ? y - 360 : y;
}

export function isDefaultCamera(camera: MapCamera): boolean {
  return (
    Math.abs(camera.tilt - DEFAULT_CAMERA.tilt) < 0.5 &&
    Math.abs(normalizeYaw(camera.yaw - DEFAULT_CAMERA.yaw)) < 0.5
  );
}

/** Projects a flat-map point (x, y in US_MAP_VIEWBOX space), `height` units above the ground, into the view. Defaults to the top face, where everything drawn on the map sits. */
export type MapProjector = (x: number, y: number, height?: number) => [number, number];

/** How far a top-face point sits from the eye along the view direction (larger is farther). */
function depthOf({ tilt, yaw }: MapCamera): (x: number, y: number) => number {
  const ts = Math.sin((tilt * Math.PI) / 180);
  const tc = Math.cos((tilt * Math.PI) / 180);
  const ys = Math.sin((yaw * Math.PI) / 180);
  const yc = Math.cos((yaw * Math.PI) / 180);
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  return (x, y) => {
    const ry = cy + (x - cx) * ys + (y - cy) * yc;
    return (MAP_H - ry) * ts - SLAB_HEIGHT * tc;
  };
}

function projector({ tilt, yaw }: MapCamera): MapProjector {
  const ts = Math.sin((tilt * Math.PI) / 180);
  const tc = Math.cos((tilt * Math.PI) / 180);
  const ys = Math.sin((yaw * Math.PI) / 180);
  const yc = Math.cos((yaw * Math.PI) / 180);
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  return (x, y, height = SLAB_HEIGHT) => {
    // Spin about the map's center, then rotate back about the near edge: a
    // raised point lifts slightly toward the viewer and up the screen, which
    // is what exposes the slab's camera-facing wall.
    const dx = x - cx;
    const dy = y - cy;
    const rx = cx + dx * yc - dy * ys;
    const ry = cy + dx * ys + dy * yc;
    const back = MAP_H - ry;
    const up = back * tc + height * ts;
    const depth = back * ts - height * tc;
    const scale = FOCAL / (FOCAL + depth);
    return [cx + (rx - cx) * scale, MAP_H - up * scale];
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
const BANDS = TERRAIN_BANDS.map(compile);

const POINT_3D = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+)/g;

/** A path whose vertices each carry their own terrain band, so it can ride the terrain. */
interface CompiledPath3D extends CompiledPath {
  ks: number[];
}

function compile3d(d: string): CompiledPath3D {
  const parts = d.split(POINT_3D);
  const glue: string[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const ks: number[] = [];
  for (let i = 0; i + 3 < parts.length; i += 4) {
    glue.push(parts[i]);
    xs.push(Number(parts[i + 1]));
    ys.push(Number(parts[i + 2]));
    ks.push(Number(parts[i + 3]));
  }
  glue.push(parts[parts.length - 1]);
  return { glue, xs, ys, ks };
}

const STATE_LINES = compile3d(TERRAIN_STATE_LINES);
const RAISED_BORDER = compile3d(TERRAIN_RAISED_BORDER);

/** Each band's rings as flat [x0, y0, x1, y1, ...] arrays, for point-in-band tests. */
const BAND_RINGS: number[][][] = TERRAIN_BANDS.map((d) =>
  d
    .split("M")
    .filter(Boolean)
    .map((ring) => [...ring.matchAll(POINT)].flatMap((m) => [Number(m[1]), Number(m[2])]))
);

function inBand(rings: number[][], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i];
      const yi = r[i + 1];
      const xj = r[j];
      const yj = r[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** The terrain's surface height (map units above the ground plane) at a flat-map point — where a game's stem should start. */
export function surfaceHeight(x: number, y: number): number {
  let k = 0;
  for (let b = 0; b < BAND_RINGS.length; b++) if (inBand(BAND_RINGS[b], x, y)) k = b + 1;
  return levelHeight(k);
}

/** How many terrain bands there are above the slab — for coloring them. */
export const TERRAIN_LEVELS = TERRAIN_THRESHOLDS.length;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function render(path: CompiledPath, project: MapProjector, height: number, bounds?: Bounds): string {
  let out = "";
  for (let i = 0; i < path.xs.length; i++) {
    const [px, py] = project(path.xs[i], path.ys[i], height);
    out += `${path.glue[i]}${px.toFixed(2)},${py.toFixed(2)}`;
    if (bounds) {
      if (px < bounds.minX) bounds.minX = px;
      if (px > bounds.maxX) bounds.maxX = px;
      if (py < bounds.minY) bounds.minY = py;
      if (py > bounds.maxY) bounds.maxY = py;
    }
  }
  return out + path.glue[path.xs.length];
}

function render3d(path: CompiledPath3D, project: MapProjector, bounds?: Bounds): string {
  let out = "";
  for (let i = 0; i < path.xs.length; i++) {
    const [px, py] = project(path.xs[i], path.ys[i], levelHeight(path.ks[i]));
    out += `${path.glue[i]}${px.toFixed(2)},${py.toFixed(2)}`;
    if (bounds) {
      if (px < bounds.minX) bounds.minX = px;
      if (px > bounds.maxX) bounds.maxX = px;
      if (py < bounds.minY) bounds.minY = py;
      if (py > bounds.maxY) bounds.maxY = py;
    }
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
  /** The land's top face (coast and national borders only). */
  outline: string;
  /** Interior state borders, riding the terrain. */
  stateLines: string;
  /** The slab's side wall, ground level first. */
  wallLayers: string[];
  /** The terrain's terraces, lowest first: each band's wall layers (bottom up), then its top face. */
  terraces: { walls: string[]; top: string }[];
  /** The stretches of the national border/coast that rise above the slab, riding the terrain. */
  raisedBorder: string;
  /** This scene's viewBox — the land fitted with a little padding, always at the default view's aspect ratio so the map never changes size on the page as it turns. */
  view: MapView;
  viewBox: string;
  project: MapProjector;
  /** A flat-map point's distance from the camera, 0 at the land's nearest point to 1 at its farthest. */
  depth: (x: number, y: number) => number;
}

function sceneFor(camera: MapCamera, aspect: number | null): MapScene {
  const project = projector(camera);
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const wallLayers = Array.from({ length: WALL_STEPS }, (_, i) =>
    render(OUTLINE, project, (i * SLAB_HEIGHT) / WALL_STEPS, i === 0 ? bounds : undefined)
  );
  const outline = render(OUTLINE, project, SLAB_HEIGHT, bounds);
  const terraces = BANDS.map((band, b) => {
    const floor = levelHeight(b);
    const top = levelHeight(b + 1);
    const steps = Math.max(1, Math.ceil((top - floor) / TERRACE_WALL_STEP));
    return {
      walls: Array.from({ length: steps }, (_, i) => render(band, project, floor + ((top - floor) * i) / steps)),
      top: render(band, project, top, bounds),
    };
  });
  const stateLines = render3d(STATE_LINES, project);
  const raisedBorder = render3d(RAISED_BORDER, project, bounds);

  let width = bounds.maxX - bounds.minX + PAD * 2;
  let height = bounds.maxY - bounds.minY + PAD * 2;
  if (aspect !== null) {
    // Grow whichever side is short so the land stays centered at a fixed aspect.
    if (width / height > aspect) height = width / aspect;
    else width = height * aspect;
  }
  const view = {
    x: (bounds.minX + bounds.maxX) / 2 - width / 2,
    y: (bounds.minY + bounds.maxY) / 2 - height / 2,
    width,
    height,
  };
  const viewBox = `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.width.toFixed(2)} ${view.height.toFixed(2)}`;

  const rawDepth = depthOf(camera);
  let near = Infinity;
  let far = -Infinity;
  for (let i = 0; i < OUTLINE.xs.length; i++) {
    const d = rawDepth(OUTLINE.xs[i], OUTLINE.ys[i]);
    if (d < near) near = d;
    if (d > far) far = d;
  }
  const span = far - near || 1;
  const depth = (x: number, y: number) => Math.min(1, Math.max(0, (rawDepth(x, y) - near) / span));
  return { outline, stateLines, wallLayers, terraces, raisedBorder, view, viewBox, project, depth };
}

/** The opening view, fitted tight — every other view keeps its aspect ratio. */
export const DEFAULT_SCENE = sceneFor(DEFAULT_CAMERA, null);
const ASPECT = DEFAULT_SCENE.view.width / DEFAULT_SCENE.view.height;

export function buildMapScene(camera: MapCamera): MapScene {
  return isDefaultCamera(camera) ? DEFAULT_SCENE : sceneFor(camera, ASPECT);
}
