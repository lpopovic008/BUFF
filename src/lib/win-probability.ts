// Live win probability for a fantasy matchup, from Sleeper's live points and
// projections plus how much of each starter's NFL game is left to play.
//
// Each team's final score is modeled as normal: its points so far plus, for
// every starter, their projection scaled by the share of their game still to
// come — with a spread that shrinks as those games run out. The chance one
// team finishes ahead is then the normal CDF of the gap over the combined
// spread. The same idea as the win-probability lines in the big fantasy apps,
// kept deliberately simple.

/** One starter's outlook: what they've scored, what Sleeper projects for their whole game, and how much of that game is left (1 = not started, 0 = over). */
export interface StarterOutlook {
  points: number;
  projection: number;
  remaining: number;
}

export interface TeamOutlook {
  /** Expected final score. */
  mean: number;
  /** Variance of the final score. */
  variance: number;
}

// A player's spread over a full game, in points: a floor for anyone (even a
// low projection can boom) plus a share of their projection. Calibrated to
// typical weekly fantasy spreads (~8–9 points for a 15-point projection).
const SD_FLOOR = 2.5;
const SD_SHARE = 0.4;

/** A team's expected final score and its variance, from its points so far and its starters' outlooks. */
export function teamOutlook(points: number, starters: StarterOutlook[]): TeamOutlook {
  let mean = points;
  let variance = 0;
  for (const s of starters) {
    const remaining = Math.min(1, Math.max(0, s.remaining));
    if (remaining <= 0) continue;
    const projection = Math.max(0, s.projection);
    mean += projection * remaining;
    const sd = SD_FLOOR + SD_SHARE * projection;
    // Variance grows linearly with the time left, so the spread with its square root.
    variance += sd * sd * remaining;
  }
  return { mean, variance };
}

/** The chance team A finishes ahead of team B (0–1); a dead heat counts as half. */
export function winProbability(a: TeamOutlook, b: TeamOutlook): number {
  const gap = a.mean - b.mean;
  const variance = a.variance + b.variance;
  if (variance < 1e-9) return gap > 0.005 ? 1 : gap < -0.005 ? 0 : 0.5;
  return normalCdf(gap / Math.sqrt(variance));
}

/** The standard normal CDF (Abramowitz & Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** One moment on a matchup's win-probability line: when, team A's chance, and both scores then. */
export interface WinProbPoint {
  /** Epoch ms. */
  t: number;
  /** Team A's chance of winning, 0–1. */
  p: number;
  a: number;
  b: number;
  /** A point that wasn't observed live — the pregame line, drawn dashed up to the first real one. */
  synthetic?: boolean;
}

// Keep a point at most this often while things are moving, and at least this
// often while they're not (so a flat stretch still has its timestamps).
const MIN_RECORD_GAP_MS = 15_000;
const MAX_RECORD_GAP_MS = 5 * 60_000;

/** Whether a fresh reading is worth keeping after the last one kept. */
export function shouldRecord(last: WinProbPoint | undefined, next: WinProbPoint): boolean {
  if (!last) return true;
  const dt = next.t - last.t;
  if (dt <= 0) return false;
  if (dt >= MAX_RECORD_GAP_MS) return true;
  if (dt < MIN_RECORD_GAP_MS) return false;
  return Math.abs(next.p - last.p) >= 0.001 || next.a !== last.a || next.b !== last.b;
}

/** Adds a point, thinning the oldest half when the line grows past `max` points. */
export function appendPoint(history: WinProbPoint[], point: WinProbPoint, max = 1500): WinProbPoint[] {
  const next = [...history, point];
  if (next.length <= max) return next;
  const half = Math.floor(next.length / 2);
  return [...next.slice(0, half).filter((_, i) => i % 2 === 0), ...next.slice(half)];
}

// Stretches with no readings longer than this are between game windows
// (Thursday night to Sunday, overnight): like a stock chart skipping the
// hours the market's closed, each shrinks to a sliver.
const SESSION_GAP_MS = 45 * 60_000;
const BREAK_WIDTH_MS = 6 * 60_000;

export interface Timeline {
  /** Each point's x, 0–1. */
  xs: number[];
  /** Where each skipped stretch sits, 0–1. */
  breaks: number[];
}

/** Lays points out left to right by time, the quiet stretches between game windows shrunk to slivers. */
export function timeline(points: WinProbPoint[]): Timeline {
  if (points.length <= 1) return { xs: points.map(() => 0), breaks: [] };
  const units = [0];
  const breakUnits: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = Math.max(0, points[i].t - points[i - 1].t);
    const prev = units[i - 1];
    if (dt > SESSION_GAP_MS) {
      breakUnits.push(prev + BREAK_WIDTH_MS / 2);
      units.push(prev + BREAK_WIDTH_MS);
    } else {
      units.push(prev + dt);
    }
  }
  const total = units[units.length - 1] || 1;
  return { xs: units.map((u) => u / total), breaks: breakUnits.map((u) => u / total) };
}
