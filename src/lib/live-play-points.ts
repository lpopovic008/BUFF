// Points from the Red Zone's play-by-play that Sleeper hasn't caught up to
// yet. ESPN's plays usually land before Sleeper's matchup points move, so the
// starters list shows Sleeper's number plus each play since Sleeper last
// changed. As soon as Sleeper's number moves, it's taken to include those
// plays and stands on its own again.

import { FeedCandidate, GamePlay, playersInPlay } from "./play-by-play";
import { pprPointsForPlay } from "./play-points";

/** A play, and when this page first saw it — 0 for plays already there when the game's play-by-play first loaded. */
export interface SeenPlay {
  play: GamePlay;
  seenAt: number;
}

/**
 * How long a play's points count on their own while Sleeper's number for
 * the player stays put. Past this, either Sleeper already had them or scores
 * the play differently, and its number is the one to show.
 */
export const PENDING_PLAY_MS = 5 * 60_000;

/**
 * The points each player has coming from plays seen after Sleeper's number
 * for them last changed (`sleeperChangedAt`, when this page saw it change),
 * by player id. A player whose Sleeper number hasn't been seen yet has
 * nothing pending.
 */
export function pendingPlayPoints(
  plays: SeenPlay[],
  candidates: FeedCandidate[],
  sleeperChangedAt: Map<string, number>,
  now: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { play, seenAt } of plays) {
    if (seenAt <= 0 || now - seenAt >= PENDING_PLAY_MS) continue;
    for (const c of playersInPlay(play, candidates)) {
      const changedAt = sleeperChangedAt.get(c.playerId);
      if (changedAt === undefined || seenAt <= changedAt) continue;
      const delta = pprPointsForPlay(play, c);
      if (delta !== 0) out[c.playerId] = Math.round(((out[c.playerId] ?? 0) + delta) * 100) / 100;
    }
  }
  return out;
}

/** A player's latest play that moved their points: when it was, and what it was worth. */
export interface LastAction {
  at: number | null;
  delta: number;
}

/**
 * Each of `candidates`' latest play that moved their points (or cost them),
 * by player id — none for someone it hasn't happened to yet. A play wiped out
 * by a penalty, or one they were only named in (an incompletion thrown their
 * way), doesn't count.
 */
export function lastActions(plays: GamePlay[], candidates: FeedCandidate[]): Record<string, LastAction> {
  const out: Record<string, LastAction> = {};
  for (const play of [...plays].sort((a, b) => a.sequence - b.sequence)) {
    for (const c of playersInPlay(play, candidates)) {
      const delta = pprPointsForPlay(play, c);
      if (delta !== 0) out[c.playerId] = { at: play.at, delta };
    }
  }
  return out;
}

/** One play that moved a player's points, and where it left them. */
export interface PointsStep {
  playId: string;
  at: number;
  period: number;
  clock: string;
  text: string;
  delta: number;
  /** Their points through this play. */
  total: number;
}

/**
 * A player's game, play by play: each play that moved their points (or cost
 * them), in game order, with their running total — what a points-over-time
 * graph draws. Plays ESPN gave no time for are left out.
 */
export function pointsTimeline(plays: GamePlay[], candidate: FeedCandidate): PointsStep[] {
  const out: PointsStep[] = [];
  let total = 0;
  for (const play of [...plays].sort((a, b) => a.sequence - b.sequence)) {
    if (play.at === null || playersInPlay(play, [candidate]).length === 0) continue;
    const delta = pprPointsForPlay(play, candidate);
    if (delta === 0) continue;
    total = Math.round((total + delta) * 100) / 100;
    out.push({ playId: play.id, at: play.at, period: play.period, clock: play.clock, text: play.text, delta, total });
  }
  return out;
}

/** When each quarter (and overtime) started, by its first play's time. */
export function periodStarts(plays: GamePlay[]): { period: number; at: number }[] {
  const out: { period: number; at: number }[] = [];
  for (const play of [...plays].sort((a, b) => a.sequence - b.sequence)) {
    if (play.at === null || play.period < 1) continue;
    if (!out.some((p) => p.period === play.period)) out.push({ period: play.period, at: play.at });
  }
  return out;
}

/** A stretch of a points line where it holds one value — and whether that's on pace for the projection there. */
export interface PacePiece {
  from: number;
  to: number;
  value: number;
  /** At or above the pace line the whole stretch; null with no projection to measure against. */
  onPace: boolean | null;
}

/**
 * A step line's flat stretches, from `start` to `lineEnd`, each split where
 * it crosses the pace line — a straight climb from 0 at `start` to
 * `projected` at `paceEnd` — so each piece is wholly on pace or behind it.
 */
export function pacePieces(
  steps: { at: number; total: number }[],
  start: number,
  lineEnd: number,
  paceEnd: number,
  projected: number | null
): PacePiece[] {
  const flats: { from: number; to: number; value: number }[] = [];
  let from = start;
  let value = 0;
  for (const s of steps) {
    if (s.at > from) flats.push({ from, to: s.at, value });
    from = Math.max(from, s.at);
    value = s.total;
  }
  if (lineEnd > from) flats.push({ from, to: lineEnd, value });
  if (projected === null || projected <= 0 || paceEnd <= start) return flats.map((f) => ({ ...f, onPace: null }));
  const out: PacePiece[] = [];
  for (const f of flats) {
    // The pace line climbs, so a flat stretch is on pace up to where pace catches it, and behind after.
    const caught = start + (f.value / projected) * (paceEnd - start);
    if (caught >= f.to) out.push({ ...f, onPace: true });
    else if (caught <= f.from) out.push({ ...f, onPace: false });
    else out.push({ ...f, to: caught, onPace: true }, { ...f, from: caught, onPace: false });
  }
  return out;
}

/** Halftime, from the 2nd quarter's last play to the 3rd's first — null until the 3rd quarter's begun. */
export function halftimeSpan(plays: GamePlay[]): { from: number; to: number } | null {
  let from = -Infinity;
  let to = Infinity;
  for (const play of plays) {
    if (play.at === null) continue;
    if (play.period === 2) from = Math.max(from, play.at);
    if (play.period === 3) to = Math.min(to, play.at);
  }
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null;
}
