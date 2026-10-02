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

import { US_STATE_SHAPES } from "./us-states";
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
// 0 looks straight down on the map; 90 sees it edge-on, from the side.
export const MIN_TILT = 0;
export const MAX_TILT = 90;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 5;

// Distance from the eye to the near edge, in map units — smaller means a
// stronger perspective squeeze toward the far edge.
export const FOCAL = 400;
/** How high the land's top face (sea level) sits above the ground plane. */
export const SLAB_HEIGHT = 6;
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

/** One level of detail's geometry, as path data in the flat 320x200 map space. */
export interface MapDetailSource {
  outline: string;
  stateLines: string;
  /** Each state's shape, by postal code. */
  states: Record<string, string>;
}

interface MapDetail {
  outline: CompiledPath;
  stateLines: CompiledPath;
  states: { code: string; path: CompiledPath }[];
}

const compileStates = (states: Record<string, string>) =>
  Object.entries(states).map(([code, d]) => ({ code, path: compile(d) }));

function compileDetail(source: MapDetailSource): MapDetail {
  return { outline: compile(source.outline), stateLines: compile(source.stateLines), states: compileStates(source.states) };
}

// Level 0 is the base, always here; finer levels arrive via addMapDetail
// once the map is zoomed in far enough to want them.
const DETAILS: (MapDetail | undefined)[] = [
  { outline: OUTLINE, stateLines: STATE_LINES, states: compileStates(US_STATE_SHAPES) },
];

/** The zoom at which each level of detail takes over. */
export const DETAIL_ZOOMS = [0, 1.5, 3.5];

/** The level of detail worth drawing at a zoom. */
export function detailLevelFor(zoom: number): number {
  let level = 0;
  DETAIL_ZOOMS.forEach((z, i) => {
    if (zoom >= z) level = i;
  });
  return level;
}

/** Registers the finer levels (1, 2, ...) once they've loaded. */
export function addMapDetail(sources: MapDetailSource[]): void {
  sources.forEach((source, i) => {
    DETAILS[i + 1] ??= compileDetail(source);
  });
}

/** The finest loaded level at or below `level`. */
function detail(level: number): MapDetail {
  for (let l = Math.min(level, DETAILS.length - 1); l > 0; l--) {
    const d = DETAILS[l];
    if (d) return d;
  }
  return DETAILS[0]!;
}

/** The given states' shapes on the slab's top face, as one path, for this camera. */
export function buildStatesPath(camera: MapCamera, codes: ReadonlySet<string>, level = 0): string {
  const area = drawnArea(camera);
  return detail(level)
    .states.filter((s) => codes.has(s.code))
    .map((s) => emit(s.path, projectAt(s.path, camera, SLAB_HEIGHT), area))
    .join("");
}

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

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A rectangle in projected space: [left, top, right, bottom]. */
type Rect = [number, number, number, number];

/**
 * One ring of a polygon clipped to `r` (Sutherland–Hodgman, one rectangle
 * edge at a time). Exact for filling inside the rectangle; anything it adds
 * runs along the rectangle's edges, which the caller keeps off-screen.
 */
function clipRing(xs: number[], ys: number[], r: Rect): [number[], number[]] {
  let px = xs;
  let py = ys;
  for (let edge = 0; edge < 4 && px.length; edge++) {
    const inside = (x: number, y: number) =>
      edge === 0 ? x >= r[0] : edge === 1 ? y >= r[1] : edge === 2 ? x <= r[2] : y <= r[3];
    const cross = (ax: number, ay: number, bx: number, by: number): [number, number] => {
      if (edge === 0 || edge === 2) {
        const x = edge === 0 ? r[0] : r[2];
        return [x, ay + ((by - ay) * (x - ax)) / (bx - ax)];
      }
      const y = edge === 1 ? r[1] : r[3];
      return [ax + ((bx - ax) * (y - ay)) / (by - ay), y];
    };
    const nx: number[] = [];
    const ny: number[] = [];
    for (let i = 0; i < px.length; i++) {
      const j = (i + px.length - 1) % px.length;
      const [ax, ay, bx, by] = [px[j], py[j], px[i], py[i]];
      const aIn = inside(ax, ay);
      const bIn = inside(bx, by);
      if (bIn) {
        if (!aIn) {
          const [x, y] = cross(ax, ay, bx, by);
          nx.push(x);
          ny.push(y);
        }
        nx.push(bx);
        ny.push(by);
      } else if (aIn) {
        const [x, y] = cross(ax, ay, bx, by);
        nx.push(x);
        ny.push(y);
      }
    }
    px = nx;
    py = ny;
  }
  return [px, py];
}

interface Projected {
  px: number[];
  py: number[];
}

/** Every point of a path projected at one height — cameraTransform inlined, nothing allocated per point. */
function projectAt(path: CompiledPath, { tilt, yaw }: MapCamera, height: number): Projected {
  const ts = Math.sin((tilt * Math.PI) / 180);
  const tc = Math.cos((tilt * Math.PI) / 180);
  const ysin = Math.sin((yaw * Math.PI) / 180);
  const ycos = Math.cos((yaw * Math.PI) / 180);
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  const { xs, ys } = path;
  const px: number[] = new Array(xs.length);
  const py: number[] = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - cx;
    const dy = ys[i] - cy;
    const back = MAP_H - (cy + dx * ysin + dy * ycos);
    const scale = FOCAL / (FOCAL + back * ts - height * tc);
    px[i] = cx + (dx * ycos - dy * ysin) * scale;
    py[i] = MAP_H - (back * tc + height * ts) * scale;
  }
  return { px, py };
}

/** Each subpath of a path (an "M" and what follows it): its point range and whether it closes. */
function subpaths({ glue, xs }: CompiledPath): { start: number; end: number; closed: boolean }[] {
  const out = [];
  for (let start = 0; start < xs.length; ) {
    let end = start + 1;
    while (end < xs.length && !glue[end].includes("M")) end++;
    out.push({ start, end, closed: (end < xs.length ? glue[end] : glue[xs.length]).includes("Z") });
    start = end;
  }
  return out;
}

/**
 * Projected points as path data. With `clip`, only what falls inside it is
 * written out: closed rings are clipped to it, open lines keep just the
 * segments that touch it. Zoomed in on the detailed coast that's a small
 * slice of thousands of points, and turning numbers into path text is most
 * of the cost of a frame.
 */
function emit(path: CompiledPath, { px, py }: Projected, clip?: Rect): string {
  let out = "";
  for (const { start, end, closed } of subpaths(path)) out += subpath(px, py, start, end, closed, clip);
  return out;
}

/**
 * The slab's side wall: one quad per coast segment, from its foot (`bottom`)
 * up to the top face. With the top face over them that's the solid's whole
 * silhouette — the footprint never shows outside the two. Every quad is
 * wound the same way, so drawn as one path (nonzero fill) overlapping quads
 * add up instead of cancelling, and adjacent ones leave no seams. With
 * `clip`, only the quads with a corner inside it.
 */
function wallQuads(path: CompiledPath, bottom: Projected, top: Projected, clip?: Rect): string {
  const inside = (x: number, y: number) => !clip || (x >= clip[0] && x <= clip[2] && y >= clip[1] && y <= clip[3]);
  let out = "";
  for (const { start, end, closed } of subpaths(path)) {
    const last = closed ? end : end - 1;
    for (let i = start; i < last; i++) {
      const j = i + 1 < end ? i + 1 : start;
      if (!inside(bottom.px[i], bottom.py[i]) && !inside(bottom.px[j], bottom.py[j]) && !inside(top.px[i], top.py[i]) && !inside(top.px[j], top.py[j])) continue;
      const qx = [bottom.px[i], bottom.px[j], top.px[j], top.px[i]];
      const qy = [bottom.py[i], bottom.py[j], top.py[j], top.py[i]];
      let twice = 0;
      for (let k = 0; k < 4; k++) twice += qx[k] * qy[(k + 1) % 4] - qx[(k + 1) % 4] * qy[k];
      const order = twice < 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
      out +=
        "M" + round2(qx[order[0]]) + "," + round2(qy[order[0]]) +
        "L" + round2(qx[order[1]]) + "," + round2(qy[order[1]]) +
        "L" + round2(qx[order[2]]) + "," + round2(qy[order[2]]) +
        "L" + round2(qx[order[3]]) + "," + round2(qy[order[3]]) + "Z";
    }
  }
  return out;
}

function subpath(px: number[], py: number[], start: number, end: number, closed: boolean, clip?: Rect): string {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = start; i < end; i++) {
    if (px[i] < x0) x0 = px[i];
    if (px[i] > x1) x1 = px[i];
    if (py[i] < y0) y0 = py[i];
    if (py[i] > y1) y1 = py[i];
  }
  const all = (xs: ArrayLike<number>, ys: ArrayLike<number>, from: number, to: number) => {
    let d = "";
    for (let i = from; i < to; i++) d += (i === from ? "M" : "L") + round2(xs[i]) + "," + round2(ys[i]);
    return d;
  };
  if (!clip || (x0 >= clip[0] && y0 >= clip[1] && x1 <= clip[2] && y1 <= clip[3])) {
    return all(px, py, start, end) + (closed ? "Z" : "");
  }
  if (x1 < clip[0] || y1 < clip[1] || x0 > clip[2] || y0 > clip[3]) return "";
  if (closed) {
    const [cx, cy] = clipRing(px.slice(start, end), py.slice(start, end), clip);
    return cx.length ? all(cx, cy, 0, cx.length) + "Z" : "";
  }
  // An open line: keep each segment with an end inside, as runs.
  const inside = (i: number) => px[i] >= clip[0] && px[i] <= clip[2] && py[i] >= clip[1] && py[i] <= clip[3];
  let d = "";
  let drawing = false;
  for (let i = start; i < end; i++) {
    const keep = inside(i) || (i > start && inside(i - 1)) || (i + 1 < end && inside(i + 1));
    if (keep) {
      d += (drawing ? "L" : "M") + round2(px[i]) + "," + round2(py[i]);
      drawing = true;
    } else drawing = false;
  }
  return d;
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
  /** The side wall, from ground level up to the top face. */
  wall: string;
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

/**
 * Where the map can show, with margin: the view, widened a tenth each side
 * and half its height above, since the land may show in the frame's headroom
 * for the tags. Anything clipped at its edges is out of sight. Only worth it
 * zoomed in — at the opening zoom the whole country is in view anyway.
 */
function drawnArea(camera: MapCamera): Rect | undefined {
  if (camera.zoom < DETAIL_ZOOMS[1]) return undefined;
  const { view } = buildMapScene(camera);
  const mx = view.width * 0.1;
  return [view.x - mx, view.y - view.height * 0.5, view.x + view.width + mx, view.y + view.height * 1.1];
}

/** The slab at a level of detail (see detailLevelFor) — the finest loaded at or below it. */
export function buildSlabPaths(camera: MapCamera, level = 0): SlabPaths {
  const { outline, stateLines } = detail(level);
  const area = drawnArea(camera);
  const top = projectAt(outline, camera, SLAB_HEIGHT);
  const foot = projectAt(outline, camera, 0);
  return {
    outline: emit(outline, top, area),
    stateLines: emit(stateLines, projectAt(stateLines, camera, SLAB_HEIGHT), area),
    wall: wallQuads(outline, foot, top, area),
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
