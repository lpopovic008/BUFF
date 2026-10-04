// Season-long per-player scoring (games played + fantasy point rollups),
// fetched server-side by scripts/fetch-player-stats.ts from Sleeper's
// undocumented stats endpoint (same shape/convention as sleeper.ts's own
// projections fetch, just "stats" instead of "projections") and committed
// as JSON — the source for each league's lineup view's season position rank
// (a player's rank among others at their position by fantasy points scored
// this season). Player ids here are Sleeper's own, the same space as this app's
// ResolvedPlayer.playerId, so lookups are direct — no name-matching needed
// (unlike the KTC value snapshot).

export interface PlayerStatLine {
  playerId: string;
  position: string;
  gamesPlayed: number;
  ptsPpr: number;
  ptsHalfPpr: number;
  ptsStd: number;
}

export interface PlayerStatsSnapshot {
  /** ISO timestamp of the last successful fetch, or null if never populated. */
  updatedAt: string | null;
  season: string | null;
  /** Last week's stats folded into this snapshot, inclusive. */
  throughWeek: number | null;
  players: PlayerStatLine[];
}

export const EMPTY_PLAYER_STATS: PlayerStatsSnapshot = {
  updatedAt: null,
  season: null,
  throughWeek: null,
  players: [],
};

/**
 * A player's fantasy points so far this season, scored under a league's own
 * `rec` scoring setting — mirrors sleeper.ts's weighProjection, which picks
 * Sleeper's pts_ppr/pts_half_ppr/pts_std rollup the same way.
 */
export function seasonPointsFor(line: PlayerStatLine, scoringSettings?: Record<string, number>): number {
  const rec = scoringSettings?.rec ?? 1;
  return rec >= 1 ? line.ptsPpr : rec > 0 ? line.ptsHalfPpr : line.ptsStd;
}
