// A stadium standing up off the floor map as a clay model (see stadium-models.ts): every part's walls and top, and
// the field down in its middle, solid off-white, shaded by a light from up over the south-west — drawn far bigger
// than it'd be, so it shows. Faces are laid down from the farthest from you to the nearest (tops cut into triangles,
// so a big one doesn't paint over what's in front of it), so the nearer cover the farther.

import earcut from "earcut";
import { FloorMapFit, floorMapFloor } from "./floor-map";
import { cameraShows } from "./floor-camera";
import { FLOOR_TILT, PERSPECTIVE_PX } from "./grid-room";
import type { StadiumPart } from "./stadium-models";

/** How big it's drawn: map units a metre (a stadium some 350 m long about 14 units of the map's 300 or so across). */
const UNITS_PER_M = 0.04;
/** Its clay, and the light on it: from up over the south-west (east, north, up), some of it everywhere. */
const CLAY = [238, 234, 226];
const LIGHT = normalize([-0.45, -0.55, 0.7]);
const AMBIENT = 0.5;
/** Shades a face's put to, so faces of a shade next to each other are laid down as one. */
const SHADES = 24;

function normalize(v: number[]): number[] {
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
}

const shadeOf = (normal: number[]) =>
  Math.round((AMBIENT + (1 - AMBIENT) * Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2])) * SHADES) / SHADES;

const area = (ring: [number, number][]) => ring.reduce((a, [x, y], i) => (i ? a + (ring[i - 1][0] * y - x * ring[i - 1][1]) : a), 0) / 2;

/** Its faces as screen paths, each with its clay's shade, farthest first — `at` its middle, in map units. */
export function stadiumClay(fit: FloorMapFit, at: [number, number], parts: StadiumPart[]): { d: string; fill: string }[] {
  const tilt = (FLOOR_TILT * Math.PI) / 180;
  const [sin, cos] = [Math.sin(tilt), Math.cos(tilt)];
  const P = PERSPECTIVE_PX;
  const horizon = fit.height * fit.share;
  const unit = fit.k * (fit.camera?.zoom ?? 1);
  // A point of it in the room, from the horizon's middle (px: across, down, toward you) — `h` m up off the floor.
  const room = (x: number, y: number, h: number): [number, number, number] => {
    const lying = floorMapFloor(fit, at[0] + x * UNITS_PER_M, at[1] - y * UNITS_PER_M);
    const [across, d] = fit.camera ? cameraShows(fit.camera, lying) : lying;
    const up = h * UNITS_PER_M * unit;
    return [across, d * cos - up * sin, d * sin + up * cos];
  };
  const screen = ([x, y, z]: [number, number, number]) => {
    const s = P / Math.max(P - z, 1);
    return `${(fit.width / 2 + x * s).toFixed(1)},${(horizon + y * s).toFixed(1)}`;
  };
  const faces: { points: [number, number, number][]; shade: number }[] = [];
  for (const part of parts) {
    // Its outline the biggest ring; any others, holes in it (the field, in its bowl).
    const rings = [...part.rings].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    for (const ring of rings) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const [a, b] = [ring[i], ring[i + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len === 0) continue;
        // Its side facing you (south, toward the map's bottom).
        let normal = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len, 0];
        if (normal[1] > 0) normal = normal.map((c) => -c);
        faces.push({ points: [room(a[0], a[1], 0), room(b[0], b[1], 0), room(b[0], b[1], part.h), room(a[0], a[1], part.h)], shade: shadeOf(normal) });
      }
    }
    const flat: number[] = [];
    const holes: number[] = [];
    rings.forEach((ring, r) => {
      if (r) holes.push(flat.length / 2);
      for (const [x, y] of ring.slice(0, -1)) flat.push(x, y);
    });
    const corners = earcut(flat, holes);
    const top = shadeOf([0, 0, 1]);
    for (let i = 0; i < corners.length; i += 3) {
      faces.push({ points: [0, 1, 2].map((j) => room(flat[corners[i + j] * 2], flat[corners[i + j] * 2 + 1], part.h)), shade: top });
    }
    // The field, down in the bowl: the floor of each hole, a shade darker.
    for (const hole of rings.slice(1)) {
      const at = hole.slice(0, -1).flatMap(([x, y]) => [x, y]);
      const cut = earcut(at);
      for (let i = 0; i < cut.length; i += 3) {
        faces.push({ points: [0, 1, 2].map((j) => room(at[cut[i + j] * 2], at[cut[i + j] * 2 + 1], 0)), shade: top * 0.82 });
      }
    }
  }
  // Farthest from you first (you're P out from the horizon's middle).
  const far = (f: (typeof faces)[number]) => {
    const n = f.points.length;
    const [x, y, z] = f.points.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    return x * x + y * y + (P - z) * (P - z);
  };
  const sorted = faces.map((f) => ({ f, far: far(f) })).sort((a, b) => b.far - a.far);
  const out: { d: string; fill: string }[] = [];
  for (const { f } of sorted) {
    const fill = `rgb(${CLAY.map((c) => Math.round(c * f.shade)).join(" ")})`;
    const d = `M${f.points.map(screen).join("L")}Z`;
    const last = out.at(-1);
    if (last && last.fill === fill) last.d += d;
    else out.push({ d, fill });
  }
  return out;
}
