// A stadium standing up off the floor map as a clay model (see stadium-models.ts): every part's walls and top, and
// the field down in its middle, solid off-white, shaded by a light from up over the south-west — its rooflines,
// and corners creased a darker clay, and its shadow cast on the floor to the north-east — drawn far bigger
// than it'd be, so it shows. Built once (its faces cut into triangles, shaded and creased), then just projected and
// painted onto a canvas as the floor moves: farthest from you first (in the order it first stood in), so the nearer
// cover the farther.

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
const AMBIENT = 0.38;
/** Its creases: a darker clay. */
const CREASE = `rgb(${CLAY.map((c) => Math.round(c * 0.42)).join(" ")} / 0.75)`;
/** How sharp a turn in an outline is a corner, creased up its wall (radians). */
const CORNER = 0.45;

function normalize(v: number[]): number[] {
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
}

/** Shades of clay a face is put to, so neighbouring faces of a shade are painted as one. */
const SHADES = 14;

const clay = (normal: number[]) => {
  const lit = AMBIENT + (1 - AMBIENT) * Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
  const shade = Math.round(lit * SHADES) / SHADES;
  return `rgb(${CLAY.map((c) => Math.round(c * shade)).join(" ")})`;
};

/** Its outlines simplified to within this many metres, for fewer faces to paint. */
const SIMPLIFY_M = 1.5;

/** A closed ring with points that barely bend it dropped (Douglas–Peucker), to within `tolerance`. */
function simplify(ring: [number, number][], tolerance: number): [number, number][] {
  if (ring.length < 5) return ring;
  const keep = new Array(ring.length).fill(false);
  keep[0] = keep[ring.length - 1] = true;
  // A closed ring: split at its farthest point from the first, so each half is a line to simplify.
  let split = 1;
  ring.forEach(([x, y], i) => {
    if (Math.hypot(x - ring[0][0], y - ring[0][1]) > Math.hypot(ring[split][0] - ring[0][0], ring[split][1] - ring[0][1])) split = i;
  });
  keep[split] = true;
  const stack: [number, number][] = [[0, split], [split, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [[ax, ay], [bx, by]] = [ring[a], ring[b]];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let [far, at] = [0, -1];
    for (let i = a + 1; i < b; i++) {
      const off = Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / len;
      if (off > far) [far, at] = [off, i];
    }
    if (far > tolerance) {
      keep[at] = true;
      stack.push([a, at], [at, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const area = (ring: [number, number][]) => ring.reduce((a, [x, y], i) => (i ? a + (ring[i - 1][0] * y - x * ring[i - 1][1]) : a), 0) / 2;

/** A point of it: m east, m north, m up. */
type Point = [number, number, number];

/**
 * A stadium built: its points (each once: m east, north, up), its faces (filled) and creases (lines) as indices into
 * them, and its shadow's pieces on the floor likewise.
 */
interface ClayModel {
  points: Float64Array;
  prims: { at: number[]; fill?: string }[];
  shadow: number[][];
  /** The order its faces are painted in, farthest first — worked out where it first stands. */
  order: number[] | null;
}

const built = new WeakMap<StadiumPart[], ClayModel>();

function build(parts: StadiumPart[]): ClayModel {
  const prims: { points: Point[]; fill?: string }[] = [];
  const shadow: [number, number][][] = [];
  // Where the light casts a point `h` m up onto the floor (m east, north).
  const cast = (h: number) => [(-LIGHT[0] / LIGHT[2]) * h, (-LIGHT[1] / LIGHT[2]) * h];
  const top = clay([0, 0, 1]);
  for (const part of parts) {
    // Its outline the biggest ring; any others, holes in it (the field, in its bowl).
    const rings = part.rings.map((ring) => simplify(ring, SIMPLIFY_M)).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    // Its shadow: its outline where it stands, where the light casts its top, and between.
    const [cx, cy] = cast(part.h);
    const outline = rings[0];
    shadow.push(outline.map(([x, y]) => [x, y]), outline.map(([x, y]) => [x + cx, y + cy]));
    for (let i = 0; i + 1 < outline.length; i++) {
      const [[x, y], [x2, y2]] = [outline[i], outline[i + 1]];
      shadow.push([[x, y], [x2, y2], [x2 + cx, y2 + cy], [x + cx, y + cy]]);
    }
    for (const ring of rings) {
      const n = ring.length - 1;
      for (let i = 0; i < n; i++) {
        const [a, b, c] = [ring[(i - 1 + n) % n], ring[i], ring[i + 1]];
        // Its wall, its side facing you (south, toward the map's bottom) lit.
        const len = Math.hypot(c[0] - b[0], c[1] - b[1]);
        if (len > 0) {
          let normal = [(c[1] - b[1]) / len, -(c[0] - b[0]) / len, 0];
          if (normal[1] > 0) normal = normal.map((v) => -v);
          prims.push({ points: [[b[0], b[1], 0], [c[0], c[1], 0], [c[0], c[1], part.h], [b[0], b[1], part.h]], fill: clay(normal) });
        }
        // Its creases: the roofline all round, and up the corners.
        prims.push({ points: [[b[0], b[1], part.h], [c[0], c[1], part.h]] });
        let turn = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]));
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if (turn > CORNER) prims.push({ points: [[b[0], b[1], 0], [b[0], b[1], part.h]] });
      }
    }
    // Its top, cut into triangles.
    const flat: number[] = [];
    const holes: number[] = [];
    rings.forEach((ring, r) => {
      if (r) holes.push(flat.length / 2);
      for (const [x, y] of ring.slice(0, -1)) flat.push(x, y);
    });
    const corners = earcut(flat, holes);
    for (let i = 0; i < corners.length; i += 3) {
      prims.push({ points: [0, 1, 2].map((j) => [flat[corners[i + j] * 2], flat[corners[i + j] * 2 + 1], part.h] as Point), fill: top });
    }
    // The field, down in the bowl: each hole's floor, a shade darker.
    for (const hole of rings.slice(1)) {
      const xy = hole.slice(0, -1).flatMap(([x, y]) => [x, y]);
      const cut = earcut(xy);
      const field = clay([0, 0, 0.8]);
      for (let i = 0; i < cut.length; i += 3) {
        prims.push({ points: [0, 1, 2].map((j) => [xy[cut[i + j] * 2], xy[cut[i + j] * 2 + 1], 0] as Point), fill: field });
      }
    }
  }
  // Each point once, the faces and creases and shadow pointing at them.
  const index = new Map<string, number>();
  const flatPoints: number[] = [];
  const at = ([x, y, h]: Point) => {
    const key = `${x},${y},${h}`;
    let i = index.get(key);
    if (i === undefined) {
      index.set(key, (i = flatPoints.length / 3));
      flatPoints.push(x, y, h);
    }
    return i;
  };
  return {
    prims: prims.map(({ points, fill }) => ({ at: points.map(at), fill })),
    shadow: shadow.map((piece) => piece.map(([x, y]) => at([x, y, 0]))),
    points: Float64Array.from(flatPoints),
    order: null,
  };
}

/** A stadium where it's shown: its model, and its points on the screen (CSS px), and how far each is from you. */
export interface PlacedStadium {
  model: ClayModel;
  xs: Float64Array;
  ys: Float64Array;
  /** Their bounds on the screen: left, top, right, bottom. */
  box: [number, number, number, number];
}

/** The stadium (`parts`) standing `at` its middle (map units) on the floor map as it's shown (`fit`, moved with the floor). */
export function placeStadium(fit: FloorMapFit, at: [number, number], parts: StadiumPart[]): PlacedStadium {
  let model = built.get(parts);
  if (!model) built.set(parts, (model = build(parts)));
  const tilt = (FLOOR_TILT * Math.PI) / 180;
  const [sin, cos] = [Math.sin(tilt), Math.cos(tilt)];
  const P = PERSPECTIVE_PX;
  const horizon = fit.height * fit.share;
  const unit = fit.k * (fit.camera?.zoom ?? 1);
  const n = model.points.length / 3;
  const [xs, ys, far] = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  const box: PlacedStadium["box"] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const [x, y, h] = [model.points[i * 3], model.points[i * 3 + 1], model.points[i * 3 + 2]];
    // In the room, from the horizon's middle (px: across, down, toward you); then on the screen.
    const lying = floorMapFloor(fit, at[0] + x * UNITS_PER_M, at[1] - y * UNITS_PER_M);
    const [across, d] = fit.camera ? cameraShows(fit.camera, lying) : lying;
    const up = h * UNITS_PER_M * unit;
    const [rx, ry, rz] = [across, d * cos - up * sin, d * sin + up * cos];
    const s = P / Math.max(P - rz, 1);
    xs[i] = fit.width / 2 + rx * s;
    ys[i] = horizon + ry * s;
    far[i] = rx * rx + ry * ry + (P - rz) * (P - rz);
    box[0] = Math.min(box[0], xs[i]);
    box[1] = Math.min(box[1], ys[i]);
    box[2] = Math.max(box[2], xs[i]);
    box[3] = Math.max(box[3], ys[i]);
  }
  if (!model.order) {
    const key = model.prims.map(({ at, fill }) => at.reduce((sum, i) => sum + far[i], 0) / at.length - (fill ? 0 : 16));
    model.order = key.map((_, i) => i).sort((a, b) => key[b] - key[a]);
  }
  return { model, xs, ys, box };
}

/** Paints a placed stadium onto `ctx` (in CSS px) — `wire` one device pixel — none of it over the horizon. */
export function paintStadium(ctx: CanvasRenderingContext2D, { model, xs, ys }: PlacedStadium, width: number, horizon: number, wire: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizon, width, 1e5);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Its shadow: its pieces as one shape (each wound the same way, so where they overlap it's no darker).
  ctx.beginPath();
  for (const piece of model.shadow) {
    const signed = piece.reduce((a, p, i) => {
      const q = piece[(i + 1) % piece.length];
      return a + (xs[q] - xs[p]) * (ys[q] + ys[p]);
    }, 0);
    const pts = signed > 0 ? [...piece].reverse() : piece;
    pts.forEach((p, i) => (i ? ctx.lineTo(xs[p], ys[p]) : ctx.moveTo(xs[p], ys[p])));
    ctx.closePath();
  }
  ctx.fillStyle = "rgb(0 0 0 / 0.28)";
  ctx.fill("nonzero");
  // Its faces and its creases — those in a row of a kind painted at once, as one shape (so no seam shows between them).
  let style: string | undefined | null = null;
  const flush = () => {
    if (style === null) return;
    if (style) {
      ctx.fillStyle = style;
      ctx.fill();
    } else {
      ctx.strokeStyle = CREASE;
      ctx.lineWidth = wire;
      ctx.stroke();
    }
  };
  for (const i of model.order!) {
    const { at, fill } = model.prims[i];
    if (fill !== style) {
      flush();
      style = fill;
      ctx.beginPath();
    }
    at.forEach((p, j) => (j ? ctx.lineTo(xs[p], ys[p]) : ctx.moveTo(xs[p], ys[p])));
    if (fill) ctx.closePath();
  }
  flush();
  ctx.restore();
}
