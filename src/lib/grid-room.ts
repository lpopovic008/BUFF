// The home page's room (see .grid-room in globals.css): a grid floor laid back almost flat under a perspective, running
// back without end to the horizon, where it vanishes. Its geometry lives here so what stands on the floor can find
// its lines. Points on it are `across` the floor's middle and `d` px toward you from its hinge (where it's shown at
// its own size; negative, further back), in floor px.

/** How far down the screen the horizon sits: nearer the middle (short of it), for more floor. */
export const HORIZON_SHARE = 0.56;
/** The room's perspective, in px. */
export const PERSPECTIVE_PX = 345;
/** How far the floor is laid back from upright, in degrees. */
export const FLOOR_TILT = 80;
/** The floor's grid, in px on the floor. */
export const GRID_PX = 64;

const SIN = Math.sin((FLOOR_TILT * Math.PI) / 180);
/** How far below the horizon the floor's hinge shows (its lines at their own size): the perspective's height over it. */
const HINGE_DROP = (Math.cos((FLOOR_TILT * Math.PI) / 180) / SIN) * PERSPECTIVE_PX;
/** How far toward you the floor may be drawn: just short of the viewer, where the projection turns over. */
const NEAREST_DEPTH = (PERSPECTIVE_PX / SIN) * 0.97;
/** How small, far back, the floor's lines are still drawn: past this they're too close together (and too faint) to. */
export const FARTHEST_SCALE = 0.08;
/** How small, far back, what's on the floor is still shown in full: from there it fades away to nothing at the horizon. */
const FADE_SCALE = 1.5;

/** The screen y, on a screen `height` px tall, from which the floor fades back to the horizon (see FADE_SCALE). */
export function floorFadeStart(height: number, share = HORIZON_SHARE): number {
  return height * share + HINGE_DROP * FADE_SCALE;
}

/**
 * Where the floor's been moved to (see floor-camera.ts): a point `D` px back from the hinge and `X` across from the
 * floor's middle shows at `X * zoom + x` across, `D * zoom + d` back. At home, just where it lies.
 */
export interface FloorCamera {
  zoom: number;
  x: number;
  d: number;
}
export const HOME_CAMERA: FloorCamera = { zoom: 1, x: 0, d: 0 };

/** How the floor magnifies what's across it at `d` (toward you; 1 at the hinge, nothing at the horizon). */
export function floorScale(d: number): number {
  return PERSPECTIVE_PX / (PERSPECTIVE_PX - Math.min(d, NEAREST_DEPTH) * SIN);
}

/** Where floor point (`across`, `d`) shows on a `width` x `height` screen — past the viewer, held just short of it. */
export function floorPoint(across: number, d: number, width: number, height: number, share = HORIZON_SHARE): [number, number] {
  const near = Math.min(d, NEAREST_DEPTH);
  return [width / 2 + across * floorScale(near), floorY(near, height, share)];
}

/** The floor point (across, d) at screen point (`x`, `y`) — `y` below the horizon. */
export function floorAt(x: number, y: number, width: number, height: number, share = HORIZON_SHARE): [number, number] {
  const d = floorDepth(y, height, share);
  return [(x - width / 2) / floorScale(d), d];
}

/** Where on a screen `height` px tall, its horizon `share` of the way down, floor point `d` shows, from the top. */
export function floorY(d: number, height: number, share = HORIZON_SHARE): number {
  return height * share + HINGE_DROP * floorScale(d);
}

/** Where on the floor a point at screen y `y` (below the horizon) is: how far toward you. */
export function floorDepth(y: number, height: number, share = HORIZON_SHARE): number {
  const scale = (y - height * share) / HINGE_DROP;
  return (PERSPECTIVE_PX / SIN) * (1 - 1 / scale);
}

/** The floor's lowest across-the-screen grid line on a screen `height` px tall, from the top. */
export function lowestGridLine(height: number, share = HORIZON_SHARE): number {
  return gridRows(height, share).at(-1) ?? height * share;
}

/**
 * The floor's across-the-screen grid lines on a screen `height` px tall, from the top: from as far back as they're
 * drawn (see FARTHEST_SCALE) down to the screen's bottom — where the floor's been moved (`camera`).
 */
export function gridRows(height: number, share = HORIZON_SHARE, camera = HOME_CAMERA): number[] {
  const rows: number[] = [];
  const step = GRID_PX * camera.zoom;
  const farthest = (PERSPECTIVE_PX / SIN) * (1 - 1 / FARTHEST_SCALE);
  for (let n = Math.ceil((farthest - camera.d) / step - 1e-9); (n * step + camera.d) * SIN < PERSPECTIVE_PX; n++) {
    const y = floorY(n * step + camera.d, height, share);
    if (y >= height) break;
    rows.push(y);
  }
  return rows;
}

/** The floor's grid line nearest screen y `y`. */
export function nearestRow(height: number, y: number, share = HORIZON_SHARE): number {
  return gridRows(height, share).reduce((best, row) => (Math.abs(row - y) < Math.abs(best - y) ? row : best), height * share);
}

/**
 * The floor's grid lines running back, on a screen `width` x `height`: from where they vanish, at the horizon's middle,
 * to the screen's bottom, spreading out toward you — those that show (until they're too faint, far back, to). At home
 * (`camera`), the screen's middle runs down the middle of a column of boxes.
 */
export function gridColumns(
  width: number,
  height: number,
  share = HORIZON_SHARE,
  camera = HOME_CAMERA
): { x1: number; y1: number; x2: number; y2: number }[] {
  const scale = floorScale(floorDepth(height, height, share));
  const step = GRID_PX * camera.zoom;
  // Those within the screen where the floor's a quarter its size: further back they've faded away.
  const reach = width / 2 / 0.25;
  const first = Math.ceil((-reach - camera.x) / step - 0.5);
  const last = Math.floor((reach - camera.x) / step - 0.5);
  const lines = [];
  for (let k = first; k <= last; k++) {
    const across = (k + 0.5) * step + camera.x;
    lines.push({ x1: width / 2, y1: height * share, x2: width / 2 + across * scale, y2: height });
  }
  return lines;
}
