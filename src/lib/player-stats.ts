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

/** What a defense has given up to one position this season: the fantasy points of every player at it who's faced them. */
export interface DefenseAllowedLine {
  /** The defense's NFL team. */
  team: string;
  position: string;
  /** Games the defense has played. */
  games: number;
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
  /** What each defense has allowed each position — missing from a snapshot written before it was kept. */
  defense?: DefenseAllowedLine[];
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

/**
 * Each defense's rank against each position, keyed `${team}-${position}`: by fantasy points allowed a game
 * (under the league's `rec` setting, as seasonPointsFor), 1 the fewest — the toughest matchup — up to the most.
 */
export function defenseRanks(snapshot: PlayerStatsSnapshot, scoringSettings?: Record<string, number>): Map<string, number> {
  const byPosition = new Map<string, { team: string; perGame: number }[]>();
  for (const line of snapshot.defense ?? []) {
    if (line.games <= 0) continue;
    const perGame = seasonPointsFor({ ...line, playerId: line.team, gamesPlayed: line.games }, scoringSettings) / line.games;
    const group = byPosition.get(line.position) ?? [];
    group.push({ team: line.team, perGame });
    byPosition.set(line.position, group);
  }
  const out = new Map<string, number>();
  for (const [position, group] of byPosition) {
    group.sort((a, b) => a.perGame - b.perGame);
    group.forEach((d, i) => out.set(`${d.team}-${position}`, i + 1));
  }
  return out;
}
