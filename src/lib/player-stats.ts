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

/** The share of defenses at each end past a scale's ends (see defenseRanks). */
const EDGE = 0.1;

/** How a defense fares against a position: its rank, the points a game it allows, and where that sits from stingy to generous (0 to 1, see defenseRanks). */
export interface DefenseRank {
  rank: number;
  perGame: number;
  share: number;
}

/**
 * Each defense against each position, keyed `${team}-${position}`, by fantasy points allowed a game (under the
 * league's `rec` setting, as seasonPointsFor): its rank, 1 the fewest — the toughest matchup — up to the most; and
 * how many it allows on a scale from stingy (0) to generous (1) — by the points themselves, not the rank, so
 * defenses that allow about as many sit together and a gap between them shows.
 */
export function defenseRanks(snapshot: PlayerStatsSnapshot, scoringSettings?: Record<string, number>): Map<string, DefenseRank> {
  const byPosition = new Map<string, { team: string; perGame: number }[]>();
  for (const line of snapshot.defense ?? []) {
    if (line.games <= 0) continue;
    const perGame = seasonPointsFor({ ...line, playerId: line.team, gamesPlayed: line.games }, scoringSettings) / line.games;
    const group = byPosition.get(line.position) ?? [];
    group.push({ team: line.team, perGame });
    byPosition.set(line.position, group);
  }
  const out = new Map<string, DefenseRank>();
  for (const [position, group] of byPosition) {
    group.sort((a, b) => a.perGame - b.perGame);
    // The scale runs from the 10th percentile to the 90th, so one defense far out on its own (a whole season of
    // tight ends torching one team) sits at the end of it without squeezing every other together.
    const at = (q: number) => {
      const i = q * (group.length - 1);
      const [lo, hi] = [Math.floor(i), Math.ceil(i)];
      return group[lo].perGame + (group[hi].perGame - group[lo].perGame) * (i - lo);
    };
    const [low, high] = [at(EDGE), at(1 - EDGE)];
    group.forEach((d, i) =>
      out.set(`${d.team}-${position}`, { rank: i + 1, perGame: d.perGame, share: high > low ? Math.min(1, Math.max(0, (d.perGame - low) / (high - low))) : 0.5 })
    );
  }
  return out;
}
