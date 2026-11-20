// The home page's room (see .grid-room in globals.css): a grid floor hinged at
// the horizon and laid back almost flat under a CSS perspective. Its geometry
// lives here so what stands on the floor can find its lines.

/** How far down the screen the horizon sits: nearer the middle (short of it), for more floor. */
export const HORIZON_SHARE = 0.56;
/**
 * A room whose columns stand on its back wall (see WallRoom, and the League Room on a phone): its horizon low, the back
 * wall most of the screen — the floor in front of it a strip for what stands on it to be reflected in.
 */
export const WALL_SHARE = 0.8;
/** The room's CSS perspective, in px. */
export const PERSPECTIVE_PX = 520;
/** How far the floor is laid back from upright, in degrees — as it lies; the home page lays it back less (looks down
 * on it more) while there are many live games' fields on it (see FloorFields). Every function here takes how far it's
 * laid back (`tilt`), this unless told. */
export const FLOOR_TILT = 80;
/** The floor's grid, in px on the floor. */
export const GRID_PX = 64;

const sinOf = (tilt: number) => Math.sin((tilt * Math.PI) / 180);
const cosOf = (tilt: number) => Math.cos((tilt * Math.PI) / 180);
/** How far back from the hinge the floor may be drawn: just short of the viewer, where the projection turns over. */
const nearestDepth = (tilt: number) => (PERSPECTIVE_PX / sinOf(tilt)) * 0.97;

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

/** How the floor magnifies what's across it `d` px back from the hinge. */
export function floorScale(d: number, tilt = FLOOR_TILT): number {
  return PERSPECTIVE_PX / (PERSPECTIVE_PX - Math.min(d, nearestDepth(tilt)) * sinOf(tilt));
}

/** Where floor point (`across`, `d`) shows on a `width` x `height` screen — past the viewer, held just short of it. */
export function floorPoint(across: number, d: number, width: number, height: number, share = HORIZON_SHARE, tilt = FLOOR_TILT): [number, number] {
  const near = Math.min(d, nearestDepth(tilt));
  return [width / 2 + across * floorScale(near, tilt), floorY(near, height, share, tilt)];
}

/** The floor point (across, back) at screen point (`x`, `y`) — `y` below the horizon. */
export function floorAt(x: number, y: number, width: number, height: number, share = HORIZON_SHARE, tilt = FLOOR_TILT): [number, number] {
  const d = floorDepth(y, height, share, tilt);
  return [(x - width / 2) / floorScale(d, tilt), d];
}

/**
 * Where on a screen `height` px tall, its horizon `share` of the way down, a floor point `d` px back from the
 * horizon's hinge shows, from the top.
 */
export function floorY(d: number, height: number, share = HORIZON_SHARE, tilt = FLOOR_TILT): number {
  return height * share + (d * cosOf(tilt) * PERSPECTIVE_PX) / (PERSPECTIVE_PX - d * sinOf(tilt));
}

/** The floor's lowest across-the-screen grid line on a screen `height` px tall, from the top. */
export function lowestGridLine(height: number, share = HORIZON_SHARE, tilt = FLOOR_TILT): number {
  let y = floorY(0, height, share, tilt);
  for (let n = 1; ; n++) {
    const next = floorY(n * GRID_PX, height, share, tilt);
    // Past the bottom, or past the viewer (where the projection turns over).
    if (n * GRID_PX * sinOf(tilt) >= PERSPECTIVE_PX || next >= height) return y;
    y = next;
  }
}

/**
 * The floor's across-the-screen grid lines on a screen `height` px tall, from the top — the horizon first, at home
 * (where the floor's been moved, `camera`, those from the horizon on).
 */
export function gridRows(height: number, share = HORIZON_SHARE, camera = HOME_CAMERA, tilt = FLOOR_TILT): number[] {
  const rows: number[] = [];
  const step = GRID_PX * camera.zoom;
  for (let n = Math.ceil(-camera.d / step - 1e-9); (n * step + camera.d) * sinOf(tilt) < PERSPECTIVE_PX; n++) {
    const y = floorY(n * step + camera.d, height, share, tilt);
    if (y >= height) break;
    rows.push(y);
  }
  return rows;
}

/** The floor's grid line nearest screen y `y` — the horizon itself above the floor. */
export function nearestRow(height: number, y: number, share = HORIZON_SHARE): number {
  return gridRows(height, share).reduce((best, row) => (Math.abs(row - y) < Math.abs(best - y) ? row : best), floorY(0, height, share));
}

/** How far back from the horizon's hinge a point at screen y `y` (below the horizon) lies on the floor. */
export function floorDepth(y: number, height: number, share = HORIZON_SHARE, tilt = FLOOR_TILT): number {
  const below = y - height * share;
  return (below * PERSPECTIVE_PX) / (cosOf(tilt) * PERSPECTIVE_PX + below * sinOf(tilt));
}

/**
 * The floor's grid lines running back to the horizon, on a screen `width` x `height`: from the horizon to the
 * screen's bottom, spreading out toward you — those that show. At home (`camera`), the screen's middle runs down the
 * middle of a column of boxes.
 */
export function gridColumns(
  width: number,
  height: number,
  share = HORIZON_SHARE,
  camera = HOME_CAMERA,
  tilt = FLOOR_TILT
): { x1: number; y1: number; x2: number; y2: number }[] {
  const scale = floorScale(floorDepth(height, height, share, tilt), tilt);
  const step = GRID_PX * camera.zoom;
  // Those within the screen at the horizon (they only spread out from there).
  const first = Math.ceil((-width / 2 - camera.x) / step - 0.5);
  const last = Math.floor((width / 2 - camera.x) / step - 0.5);
  const lines = [];
  for (let k = first; k <= last; k++) {
    const across = (k + 0.5) * step + camera.x;
    lines.push({ x1: width / 2 + across, y1: height * share, x2: width / 2 + across * scale, y2: height });
  }
  return lines;
}
