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

/** The latest play in a game that one of your players got points on (or lost them). */
export interface LatestScore {
  play: GamePlay;
  /** Each of your players it moved, and by how much. */
  scorers: { playerId: string; delta: number }[];
}

/**
 * Of a game's plays, the latest one that moved any of `candidates`' points —
 * null when none has yet. A play wiped out by a penalty, or one they were only
 * named in (an incompletion thrown their way), doesn't count.
 */
export function latestScoringPlay(plays: GamePlay[], candidates: FeedCandidate[]): LatestScore | null {
  const latestFirst = [...plays].sort((a, b) => b.sequence - a.sequence);
  for (const play of latestFirst) {
    const scorers = playersInPlay(play, candidates)
      .map((c) => ({ playerId: c.playerId, delta: pprPointsForPlay(play, c) }))
      .filter((s) => s.delta !== 0);
    if (scorers.length > 0) return { play, scorers };
  }
  return null;
}
