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
