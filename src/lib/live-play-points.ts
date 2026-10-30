// Points from the Red Zone's play-by-play that Sleeper hasn't caught up to
// yet. ESPN's plays usually land before Sleeper's matchup points move, so the
// starters list shows Sleeper's number plus each play since Sleeper last
// changed. As soon as Sleeper's number moves, it's taken to include those
// plays and stands on its own again.

import { FeedCandidate, GamePlay, playersInPlay } from "./play-by-play";
import { PlayStats, PPR_SCORING, pprPointsForPlay, scoreStats, statsForPlay } from "./play-points";

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
 * graph draws. Points are their league's (`scoring`, Sleeper's
 * scoring_settings; standard PPR without one), worked out on their running
 * stat line so yardage bonuses land on the play that crossed the mark. A
 * defense's points-allowed bracket moving as the other side scores is a step
 * of its own (given the game's `teams`). Plays ESPN gave no time for count
 * toward the next play that has one.
 */
export function pointsTimeline(
  plays: GamePlay[],
  candidate: FeedCandidate,
  scoring: Record<string, number> = PPR_SCORING,
  teams?: { home: string; away: string }
): PointsStep[] {
  const out: PointsStep[] = [];
  const running: PlayStats = {};
  let allowed: number | null = null;
  // Their points as of the last step drawn: from plays, and with the points-allowed bracket on top.
  let drawnPlays = 0;
  let drawnAll = 0;
  let total = 0;
  for (const play of [...plays].sort((a, b) => a.sequence - b.sequence)) {
    if (candidate.position === "DEF" && teams && play.score) {
      if (candidate.team === teams.home) allowed = play.score.away;
      else if (candidate.team === teams.away) allowed = play.score.home;
    }
    if (playersInPlay(play, [candidate]).length > 0) {
      for (const [key, n] of Object.entries(statsForPlay(play, candidate))) running[key] = (running[key] ?? 0) + n;
    }
    if (play.at === null) continue;
    const fromPlays = scoreStats(running, scoring, candidate.position);
    const all = allowed === null ? fromPlays : scoreStats({ ...running, pts_allow: allowed }, scoring, candidate.position);
    const playDelta = Math.round((fromPlays - drawnPlays) * 100) / 100;
    const allowedDelta = Math.round((all - fromPlays - (drawnAll - drawnPlays)) * 100) / 100;
    const base = { at: play.at, period: play.period, clock: play.clock };
    if (playDelta !== 0) {
      total = Math.round((total + playDelta) * 100) / 100;
      out.push({ ...base, playId: play.id, text: play.text, delta: playDelta, total });
    }
    if (allowedDelta !== 0) {
      total = Math.round((total + allowedDelta) * 100) / 100;
      out.push({ ...base, playId: `${play.id}:allowed`, text: `${candidate.team ?? ""} D/ST — ${allowed} points allowed`.trim(), delta: allowedDelta, total });
    }
    drawnPlays = fromPlays;
    drawnAll = all;
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

/**
 * How far along a game is, 0–1, as a player graph's pace line reads it: from
 * kickoff (or its first play, if earlier) to about when it should end —
 * `gameMs` on, or later should it run past that — with halftime left out (from the moment it starts, with `halfOver`:
 * the scoreboard saying the half's over).
 * A player's on pace while their points are at least this share of their
 * projection.
 */
export function paceShare(kickoff: number, plays: GamePlay[], now: number, gameMs: number, halfOver = false): number {
  const times = plays.map((p) => p.at).filter((t): t is number => t !== null);
  const start = Math.min(Number.isNaN(kickoff) ? Infinity : kickoff, ...times);
  if (!Number.isFinite(start)) return 0;
  const end = Math.max(start + gameMs, ...times, now);
  const ht = halftimeSpan(plays, halfOver ? now : null);
  const beforeHalftimeEnds = (t: number) => (ht ? Math.max(0, Math.min(t, ht.to) - ht.from) : 0);
  const playing = end - start - beforeHalftimeEnds(end);
  return playing > 0 ? Math.min(1, Math.max(0, (now - start - beforeHalftimeEnds(now)) / playing)) : 0;
}

/**
 * Whether a player is on pace for their projection: their points at least
 * `share` of it (see paceShare; 1 once the game's over, so whether they beat
 * it). Null with no projection, or nothing to measure.
 */
export function onPace(points: number | null, projected: number | null | undefined, share: number | undefined): boolean | null {
  if (points === null || share === undefined || projected == null || projected <= 0) return null;
  return points >= projected * share;
}

/**
 * Halftime, from the 2nd quarter's last play to the 3rd's first — or, the half over (the scoreboard says so) and the
 * 3rd not begun yet, to `ongoingUntil` (now): halftime from the moment it starts. Null before then.
 */
export function halftimeSpan(plays: GamePlay[], ongoingUntil: number | null = null): { from: number; to: number } | null {
  let from = -Infinity;
  let to = Infinity;
  for (const play of plays) {
    if (play.at === null) continue;
    if (play.period === 2) from = Math.max(from, play.at);
    if (play.period === 3) to = Math.min(to, play.at);
  }
  if (!Number.isFinite(from)) return null;
  if (Number.isFinite(to)) return to > from ? { from, to } : null;
  return ongoingUntil !== null ? { from, to: Math.max(from, ongoingUntil) } : null;
}
