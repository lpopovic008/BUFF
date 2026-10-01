// The dashboard map's tilted view. Every point of the flat 320x200 US map is
// projected through a backward tilt (pitch only — no yaw), as if seen from a
// camera low over the southern edge: the south sits near and the north
// recedes. Precomputed once at module load: the paths are only ~1,000 points.

import { US_MAP_VIEWBOX, US_SIMPLE_OUTLINE_PATH, US_SIMPLE_STATE_LINES_PATH } from "./warroom-team-cities";

const [, , MAP_W, MAP_H] = US_MAP_VIEWBOX.split(" ").map(Number);
/** Height of the flat (untilted) map space that projectMapPoint takes its input in. */
export const FLAT_MAP_HEIGHT = MAP_H;

const TILT_DEG = 32;
// Distance from the eye to the near edge, in map units — smaller means a
// stronger perspective squeeze toward the far (north) edge.
const FOCAL = 400;

const SIN = Math.sin((TILT_DEG * Math.PI) / 180);
const COS = Math.cos((TILT_DEG * Math.PI) / 180);

/** Projects a flat-map point (x, y in US_MAP_VIEWBOX space) into the tilted view, rotating the map back about its bottom (southern) edge. */
export function projectMapPoint(x: number, y: number): [number, number] {
  const back = MAP_H - y;
  const up = back * COS;
  const depth = back * SIN;
  const scale = FOCAL / (FOCAL + depth);
  return [MAP_W / 2 + (x - MAP_W / 2) * scale, MAP_H - up * scale];
}

const POINT = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;

function projectPath(d: string): string {
  return d.replace(POINT, (_, x: string, y: string) => {
    const [px, py] = projectMapPoint(Number(x), Number(y));
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  });
}

/** The land (coast and national borders only). */
export const MAP_OUTLINE = projectPath(US_SIMPLE_OUTLINE_PATH);
/** Interior state borders. */
export const MAP_STATE_LINES = projectPath(US_SIMPLE_STATE_LINES_PATH);

function bounds(paths: string[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of paths) {
    for (const [, x, y] of d.matchAll(POINT)) {
      const px = Number(x);
      const py = Number(y);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  return { minX, minY, maxX, maxY };
}

const PAD = 4;
const b = bounds([MAP_OUTLINE]);

/** The tilted map's own viewBox, fitted to the projected land plus a little padding. */
export const MAP_VIEW = {
  x: b.minX - PAD,
  y: b.minY - PAD,
  width: b.maxX - b.minX + PAD * 2,
  height: b.maxY - b.minY + PAD * 2,
};
export const MAP_VIEWBOX = `${MAP_VIEW.x.toFixed(2)} ${MAP_VIEW.y.toFixed(2)} ${MAP_VIEW.width.toFixed(2)} ${MAP_VIEW.height.toFixed(2)}`;
