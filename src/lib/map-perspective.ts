// The dashboard map's 3D view. Every point of the flat 320x200 US map is
// projected through a camera that orbits it: `yaw` spins the map about its
// center, `tilt` rotates it back (pitch), as if seen from a camera low over
// its near edge — the near side sits close and the far side recedes. The
// land is a slab raised a few units off the ground, so the tilt shows its
// camera-facing side wall — that thickness is what sells the perspective.
// The map is interactive (see useMapCamera), so a scene is rebuilt per
// camera change; the paths are only a few thousand points, parsed once here
// so a rebuild is just arithmetic and string joins.

import { US_MAP_VIEWBOX, US_SIMPLE_OUTLINE_PATH, US_SIMPLE_STATE_LINES_PATH } from "./warroom-team-cities";

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
const STATE_LINES = compile(US_SIMPLE_STATE_LINES_PATH);

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

export interface MapView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapScene {
  /** The land's top face (coast and national borders only). */
  outline: string;
  /** Interior state borders, on the top face. */
  stateLines: string;
  /** The side wall, ground level first. */
  wallLayers: string[];
  /** This scene's viewBox — the land fitted with a little padding, always at the default view's aspect ratio so the map never changes size on the page as it turns. */
  view: MapView;
  viewBox: string;
  project: MapProjector;
}

function sceneFor(camera: MapCamera, aspect: number | null): MapScene {
  const project = projector(camera);
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const wallLayers = Array.from({ length: WALL_STEPS }, (_, i) =>
    render(OUTLINE, project, (i * SLAB_HEIGHT) / WALL_STEPS, i === 0 ? bounds : undefined)
  );
  const outline = render(OUTLINE, project, SLAB_HEIGHT, bounds);
  const stateLines = render(STATE_LINES, project, SLAB_HEIGHT);

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
  return { outline, stateLines, wallLayers, view, viewBox, project };
}

/** The opening view, fitted tight — every other view keeps its aspect ratio. */
export const DEFAULT_SCENE = sceneFor(DEFAULT_CAMERA, null);
const ASPECT = DEFAULT_SCENE.view.width / DEFAULT_SCENE.view.height;

export function buildMapScene(camera: MapCamera): MapScene {
  return isDefaultCamera(camera) ? DEFAULT_SCENE : sceneFor(camera, ASPECT);
}
