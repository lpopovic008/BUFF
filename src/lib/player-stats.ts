// Season-long per-player scoring (games played + fantasy point rollups),
// fetched server-side by scripts/fetch-player-stats.ts from Sleeper's
// undocumented stats endpoint (same shape/convention as sleeper.ts's own
// projections fetch, just "stats" instead of "projections") and committed
// as JSON — the source for each league's lineup view's "Pos Rk" column (a
// player's rank among others at their position by points-per-game this
// season). Player ids here are Sleeper's own, the same space as this app's
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
 * A player's points-per-game so far this season, scored under a league's own
 * `rec` scoring setting — mirrors sleeper.ts's weighProjection, which picks
 * Sleeper's pts_ppr/pts_half_ppr/pts_std rollup the same way. Returns 0 for a
 * player who hasn't played yet rather than dividing by zero.
 */
export function ppgFor(line: PlayerStatLine, scoringSettings?: Record<string, number>): number {
  if (line.gamesPlayed <= 0) return 0;
  const rec = scoringSettings?.rec ?? 1;
  const total = rec >= 1 ? line.ptsPpr : rec > 0 ? line.ptsHalfPpr : line.ptsStd;
  return total / line.gamesPlayed;
}
