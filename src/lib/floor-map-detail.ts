// The map on the floor in finer detail as it's zoomed in: the coast and borders of us-detail.ts (the dashboard map's
// finer levels, a sizable download, loaded only once they're wanted), and the plain ones until then. Each path read
// once into numbers, then laid on the floor (see floor-map.ts) every time it moves — skipping what's off the screen
// and points too close together to tell apart, so even the finest stays quick to redraw.

import { US_SIMPLE_OUTLINE_PATH, US_SIMPLE_STATE_LINES_PATH } from "./team-cities";
import { US_STATE_SHAPES } from "./us-states";
import type { MapDetailSource } from "./map-perspective";
import { FloorMapFit, floorMapPoint } from "./floor-map";

/** The floor's zoom from which each level of detail is drawn. */
const LEVEL_ZOOMS = [0, 1.5, 3];
/** How far apart, on the screen, two points of a line must be to both be drawn (px). */
const STEP_PX = 0.75;
/** How far off the screen's edges a line's still drawn as it is (px). */
const MARGIN_PX = 16;

interface Ring {
  /** x0, y0, x1, y1, ... in map units. */
  pts: Float64Array;
  closed: boolean;
  /** Its extent: min x, min y, max x, max y. */
  box: [number, number, number, number];
}
type Compiled = Ring[];

interface Level {
  outline: Compiled;
  lines: Compiled;
  states: Map<string, Compiled>;
}

/** An SVG path of absolute M, L and Z commands, read into rings of points. */
function compile(d: string): Compiled {
  const rings: Compiled = [];
  let pts: number[] = [];
  const end = (closed: boolean) => {
    if (pts.length >= 4) {
      const xs = pts.filter((_, i) => i % 2 === 0);
      const ys = pts.filter((_, i) => i % 2 === 1);
      rings.push({ pts: Float64Array.from(pts), closed, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
    pts = [];
  };
  for (const [, cmd, args] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (cmd === "M") end(false);
    if (cmd === "Z") {
      end(true);
      continue;
    }
    for (const n of args.split(/[ ,]+/).filter(Boolean)) pts.push(Number(n));
  }
  end(false);
  return rings;
}

function level(source: MapDetailSource): Level {
  return {
    outline: compile(source.outline),
    lines: compile(source.stateLines),
    states: new Map(Object.entries(source.states).map(([code, d]) => [code, compile(d)])),
  };
}

const LEVELS: Level[] = [level({ outline: US_SIMPLE_OUTLINE_PATH, stateLines: US_SIMPLE_STATE_LINES_PATH, states: US_STATE_SHAPES })];
let loading: Promise<void> | null = null;

/** The level of detail worth drawing at the floor's zoom. */
export function floorDetailWanted(zoom: number): number {
  return LEVEL_ZOOMS.reduce((level, z, i) => (zoom >= z ? i : level), 0);
}

/** How many levels are loaded. */
export function floorDetailLoaded(): number {
  return LEVELS.length;
}

/** Loads the finer levels, once. */
export function loadFloorDetail(): Promise<void> {
  loading ??= import("./us-detail").then(({ US_DETAIL_LEVELS }) => {
    for (const source of US_DETAIL_LEVELS) LEVELS.push(level(source));
  });
  return loading;
}

/** Which sides of the screen (with a margin) a point's off: a bit each. */
function outside(x: number, y: number, fit: FloorMapFit): number {
  const top = fit.height * fit.share;
  return (x < -MARGIN_PX ? 1 : 0) | (x > fit.width + MARGIN_PX ? 2 : 0) | (y < top - MARGIN_PX ? 4 : 0) | (y > fit.height + MARGIN_PX ? 8 : 0);
}

/**
 * Rings laid on the floor as a screen path. A ring all off one side of the screen is left out; within one, a run of
 * points off the same side as the points either side of them is cut short (which changes nothing on the screen,
 * filled or not), and a point too near the last one drawn is skipped.
 */
function draw(fit: FloorMapFit, rings: Compiled): string {
  let out = "";
  for (const ring of rings) {
    const [x0, y0, x1, y1] = ring.box;
    const corners = [floorMapPoint(fit, x0, y0), floorMapPoint(fit, x1, y0), floorMapPoint(fit, x0, y1), floorMapPoint(fit, x1, y1)];
    if (corners.reduce((all, [x, y]) => all & outside(x, y, fit), 15)) continue;
    const { pts } = ring;
    const n = pts.length / 2;
    const screen = new Float64Array(pts.length);
    const codes = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y] = floorMapPoint(fit, pts[2 * i], pts[2 * i + 1]);
      screen[2 * i] = x;
      screen[2 * i + 1] = y;
      codes[i] = outside(x, y, fit);
    }
    let lastX = 0;
    let lastY = 0;
    // The sides every point since the last drawn (and it) is off.
    let run = 0;
    for (let i = 0; i < n; i++) {
      const x = screen[2 * i];
      const y = screen[2 * i + 1];
      const ends = i === 0 || i === n - 1;
      if (!ends) {
        const shared = run & codes[i] & codes[i + 1];
        if (shared) {
          run = shared;
          continue;
        }
        if (Math.abs(x - lastX) < STEP_PX && Math.abs(y - lastY) < STEP_PX) {
          run &= codes[i];
          continue;
        }
      }
      out += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      lastX = x;
      lastY = y;
      run = codes[i];
    }
    if (ring.closed) out += "Z";
  }
  return out;
}

/** The map's coast, its state lines and the given states' shapes, at a level of detail (the finest loaded up to it), laid on the floor. */
export function floorMapDetailPaths(fit: FloorMapFit, levelWanted: number, states: string[]): { outline: string; lines: string; states: string[] } {
  const l = LEVELS[Math.min(levelWanted, LEVELS.length - 1)];
  return {
    outline: draw(fit, l.outline),
    lines: draw(fit, l.lines),
    states: states.flatMap((code) => {
      const shape = l.states.get(code);
      return shape ? [draw(fit, shape)] : [];
    }),
  };
}
