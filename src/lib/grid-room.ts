// The home page's room (see .grid-room in globals.css): a grid floor hinged at
// the horizon and laid back almost flat under a CSS perspective. Its geometry
// lives here so what stands on the floor can find its lines.

/** How far down the screen the horizon sits. */
export const HORIZON_SHARE = 0.64;
/** The room's CSS perspective, in px. */
export const PERSPECTIVE_PX = 520;
/** How far the floor is laid back from upright, in degrees. */
export const FLOOR_TILT = 80;
/** The floor's grid, in px on the floor. */
export const GRID_PX = 64;

/** Where on a screen `height` px tall a floor point `d` px back from the horizon's hinge shows, from the top. */
export function floorY(d: number, height: number): number {
  const a = (FLOOR_TILT * Math.PI) / 180;
  return height * HORIZON_SHARE + (d * Math.cos(a) * PERSPECTIVE_PX) / (PERSPECTIVE_PX - d * Math.sin(a));
}

/** The floor's lowest across-the-screen grid line on a screen `height` px tall, from the top. */
export function lowestGridLine(height: number): number {
  let y = floorY(0, height);
  for (let n = 1; ; n++) {
    const next = floorY(n * GRID_PX, height);
    // Past the bottom, or past the viewer (where the projection turns over).
    if (n * GRID_PX * Math.sin((FLOOR_TILT * Math.PI) / 180) >= PERSPECTIVE_PX || next >= height) return y;
    y = next;
  }
}

/** The floor's across-the-screen grid lines on a screen `height` px tall, from the top, horizon first. */
export function gridRows(height: number): number[] {
  const rows: number[] = [];
  for (let n = 0; n * GRID_PX * Math.sin((FLOOR_TILT * Math.PI) / 180) < PERSPECTIVE_PX; n++) {
    const y = floorY(n * GRID_PX, height);
    if (y >= height) break;
    rows.push(y);
  }
  return rows;
}

/** The lowest of the floor's grid lines at or above screen y `limit` — the horizon itself if none is. */
export function rowAtOrAbove(height: number, limit: number): number {
  return gridRows(height).filter((y) => y <= limit).at(-1) ?? floorY(0, height);
}
