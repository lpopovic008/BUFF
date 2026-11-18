// The player graphs put up on their own as a kickoff window's games start (see the home page): your matchups'
// highest scorers in that window's games — those the starters list shows with "VS" picked, yours and the ones you
// face, not anyone else in the games.

import type { GameStarters } from "./my-starters";

/**
 * The `n` highest scoring of the players in your matchups (yours, and those you face) in the games `gameIds` — by
 * points so far, then (as nobody's scored yet when they kick off) by projection. Each once, with the game they're in.
 */
export function topFacing(listed: GameStarters[], gameIds: Set<string>, n: number): { playerId: string; gameId: string }[] {
  const seen = new Set<string>();
  const rows: { playerId: string; gameId: string; points: number; projected: number }[] = [];
  for (const entry of listed) {
    if (!gameIds.has(entry.game.id)) continue;
    for (const p of entry.everyone ?? entry.players) {
      if (p.side === "other" || seen.has(p.playerId)) continue;
      seen.add(p.playerId);
      rows.push({ playerId: p.playerId, gameId: entry.game.id, points: p.points ?? 0, projected: p.projected ?? -Infinity });
    }
  }
  return rows
    .sort((a, b) => b.points - a.points || b.projected - a.projected)
    .slice(0, n)
    .map(({ playerId, gameId }) => ({ playerId, gameId }));
}
