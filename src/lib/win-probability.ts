// Live win probability for a fantasy matchup, from Sleeper's live points and
// projections plus how much of each starter's NFL game is left to play.
//
// Each team's final score is modeled as normal: its points so far plus, for
// every starter, their projection scaled by the share of their game still to
// come, with a spread proportional to those points still to come (so it
// shrinks to nothing as the games run out). The chance one team finishes
// ahead is then the normal CDF of the gap over the combined spread.
//
// Calibrated to Sleeper's own app (which publishes its win chances nowhere
// we can read them), from every win chance it showed for a week of
// matchups, before kickoff and mid-game (2026 week 4, Epstein Island — see
// the tests): with Sleeper's projections, the spread is 29.6% of each team's
// points still to come before kickoff, growing to 40% once the matchup is
// well underway (see spreadShare).
//
// Shared by the league page (live, in the browser) and the game-day
// recorder (scripts/record-win-prob.ts, every 5 minutes in GitHub Actions),
// so both draw the same line.

import { gameFractionRemaining, NFLGame } from "./nfl-schedule";

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

// A team's spread, as a share of the points it's projected to add from here:
// 29.6% before kickoff (any share from 29.2% to 30.0% rounds to every one of
// Sleeper's pregame numbers), rising to 40% as the matchup is played — the
// fewer players a team has left, the bigger each one's swing is next to
// what's left. Fitted to Sleeper's numbers before kickoff and mid-game.
const PREGAME_SHARE = 0.296;
const LIVE_SHARE = 0.4;
const SHARE_RAMP_FROM = 0.05;
const SHARE_RAMP_TO = 0.4;

/** The spread share once `played` (0–1) of the matchup's projected points have been played. */
export function spreadShare(played: number): number {
  const t = Math.min(1, Math.max(0, (played - SHARE_RAMP_FROM) / (SHARE_RAMP_TO - SHARE_RAMP_FROM)));
  return PREGAME_SHARE + (LIVE_SHARE - PREGAME_SHARE) * t;
}

/** The points a team's starters are projected to add from here. */
export function pointsToCome(starters: StarterOutlook[]): number {
  let toCome = 0;
  for (const s of starters) toCome += Math.max(0, s.projection) * Math.min(1, Math.max(0, s.remaining));
  return toCome;
}

/** A team's expected final score and its variance, from its points so far, its starters' outlooks, and the spread share (see spreadShare; pregame by default). */
export function teamOutlook(points: number, starters: StarterOutlook[], share = PREGAME_SHARE): TeamOutlook {
  const toCome = pointsToCome(starters);
  const sd = share * toCome;
  return { mean: points + toCome, variance: sd * sd };
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

/** What a matchup reading needs of an NFL game. */
export type GameClock = Pick<NFLGame, "state" | "period" | "clockSeconds" | "kickoff">;

/** One fantasy team in a matchup: its live total and its starters (player id, NFL team, points so far). */
export interface MatchupSide {
  points: number;
  starters: { playerId: string; team: string | null; points: number }[];
}

export interface MatchupReading {
  /** Side A's chance now. */
  p: number;
  /** Side A's chance from projections alone, before any game. */
  pregameP: number;
  /** Some starter's game has kicked off. */
  started: boolean;
  /** Some starter's game is being played right now. */
  live: boolean;
  /** Every starter's game is over. */
  allDone: boolean;
  /** The first kickoff among both teams' starters (epoch ms), or null if none is scheduled. */
  firstKickoff: number | null;
}

/** A matchup's win chances, now and pregame, from both lineups, the week's projections (by player id, in the league's scoring) and each NFL team's game. Starters without a game this week (byes) have nothing left to add. */
export function readMatchup(a: MatchupSide, b: MatchupSide, projections: Record<string, number>, gameByTeam: Map<string, GameClock>): MatchupReading {
  const games = [a, b].flatMap((side) => side.starters.map((s) => (s.team ? gameByTeam.get(s.team) : undefined)).filter((g): g is GameClock => !!g));
  const starters = (side: MatchupSide, pregame: boolean): StarterOutlook[] =>
    side.starters.map((s) => {
      const game = s.team ? gameByTeam.get(s.team) : undefined;
      return { points: s.points, projection: projections[s.playerId] ?? 0, remaining: !game ? 0 : pregame ? 1 : gameFractionRemaining(game) };
    });
  // How much of the matchup's projected points have been played, for the spread.
  const full = pointsToCome(starters(a, true)) + pointsToCome(starters(b, true));
  const left = pointsToCome(starters(a, false)) + pointsToCome(starters(b, false));
  const share = spreadShare(full > 0 ? 1 - left / full : 0);
  const kickoffs = games.map((g) => new Date(g.kickoff).getTime()).filter((t) => Number.isFinite(t));
  return {
    p: winProbability(teamOutlook(a.points, starters(a, false), share), teamOutlook(b.points, starters(b, false), share)),
    pregameP: winProbability(teamOutlook(0, starters(a, true)), teamOutlook(0, starters(b, true))),
    started: games.some((g) => g.state !== "pre"),
    live: games.some((g) => g.state === "in"),
    allDone: games.length > 0 && games.every((g) => g.state === "post"),
    firstKickoff: kickoffs.length ? Math.min(...kickoffs) : null,
  };
}

/** The line with a new reading added if it's worth keeping: while games are on (see shouldRecord), and the final one once they're over. Null when nothing changes. */
export function withReading(history: WinProbPoint[], point: WinProbPoint, live: boolean, allDone: boolean): WinProbPoint[] | null {
  const last = history.at(-1);
  const finalChanged = allDone && (!last || Math.abs(last.p - point.p) > 0.0005 || last.a !== point.a || last.b !== point.b);
  return (live && shouldRecord(last, point)) || finalChanged ? appendPoint(history, point) : null;
}

/** Two recordings of the same line (this browser's and the game-day recorder's) as one, in time order, dropping readings within 20s of the one before. */
export function mergeLines(a: WinProbPoint[], b: WinProbPoint[]): WinProbPoint[] {
  const all = [...a, ...b].filter((pt) => !pt.synthetic).sort((x, y) => x.t - y.t);
  const out: WinProbPoint[] = [];
  for (const pt of all) if (!out.length || pt.t - out[out.length - 1].t >= 20_000) out.push(pt);
  return out;
}

/** Compact storage form: [seconds since epoch, p × 10000, a × 100, b × 100]. */
export type PackedPoint = [number, number, number, number];

export function packLine(points: WinProbPoint[]): PackedPoint[] {
  return points
    .filter((pt) => !pt.synthetic)
    .map((pt) => [Math.round(pt.t / 1000), Math.round(pt.p * 10000), Math.round(pt.a * 100), Math.round(pt.b * 100)]);
}

export function unpackLine(packed: unknown): WinProbPoint[] {
  if (!Array.isArray(packed)) return [];
  return packed
    .filter((x): x is PackedPoint => Array.isArray(x) && x.length === 4 && x.every((n) => typeof n === "number"))
    .map(([t, p, a, b]) => ({ t: t * 1000, p: p / 10000, a: a / 100, b: b / 100 }));
}

/** The two roster ids, low first, as one key — the same either way round. */
export function matchupKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
