// Cross-references a Sleeper roster's players against the KeepTradeCut trade
// values snapshot (src/data/player-values.json) by name — the two sources
// don't share an id, so this normalizes both names (case, punctuation,
// suffixes) before matching. Used to pick the "best" players on each side of
// a matchup for the dashboard.

import { LeagueFormat, PlayerValuesSnapshot, TEPremium, valueFor } from "./player-values";
import { ResolvedPlayer } from "./players";

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (e.g. "e" + combining acute -> "e")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // drop punctuation (periods, apostrophes, hyphens)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "") // suffixes are inconsistent between sources
    .replace(/\s+/g, " ")
    .trim();
}

/** Which of the four KTC value columns to rank players by. */
export interface ValueMetric {
  listType: "dynasty" | "fantasy";
  format: LeagueFormat;
  tep: TEPremium;
}

// Fallback only, used when a caller can't resolve the league's own settings
// (e.g. the league fetch failed). Real callers pass each league's actual
// metric — dynasty/fantasy and 1QB/superflex — derived via sleeper.ts's
// isDynastyLeague/leagueQBFormat, so rankings match what that league's own
// format actually values.
export const DEFAULT_VALUE_METRIC: ValueMetric = { listType: "fantasy", format: "oneQB", tep: "standard" };

const valueIndexCache = new Map<string, Map<string, number>>();
let indexedSnapshot: PlayerValuesSnapshot | null = null;

function valueIndexFor(snapshot: PlayerValuesSnapshot, metric: ValueMetric): Map<string, number> {
  if (indexedSnapshot !== snapshot) {
    valueIndexCache.clear();
    indexedSnapshot = snapshot;
  }
  const key = `${metric.listType}:${metric.format}:${metric.tep}`;
  const cached = valueIndexCache.get(key);
  if (cached) return cached;

  const idx = new Map<string, number>();
  const list = metric.listType === "dynasty" ? snapshot.dynasty : snapshot.fantasy;
  for (const p of list) {
    idx.set(normalizeName(p.name), valueFor(p, metric.format, metric.tep));
  }
  valueIndexCache.set(key, idx);
  return idx;
}

export interface RankedPlayer extends ResolvedPlayer {
  /** KTC trade value under the given metric, or null if this player couldn't be matched (e.g. a kicker/DST KTC doesn't rank). */
  ktcValue: number | null;
  /** This week's live/actual points so far (0 before kickoff), from Sleeper's players_points. */
  livePoints: number;
}

/** Ranks every player by KTC value (highest first); unmatched players (kickers, DST, etc.) sort last. */
export function rankPlayersByValue(
  players: ResolvedPlayer[],
  livePointsById: Record<string, number>,
  snapshot: PlayerValuesSnapshot,
  metric: ValueMetric = DEFAULT_VALUE_METRIC
): RankedPlayer[] {
  const idx = valueIndexFor(snapshot, metric);
  return players
    .map((p) => ({
      ...p,
      ktcValue: idx.get(normalizeName(p.name)) ?? null,
      livePoints: livePointsById[p.playerId] ?? 0,
    }))
    .sort((a, b) => (b.ktcValue ?? -1) - (a.ktcValue ?? -1));
}

/** Same ranking, trimmed to the top `count` — used where only a preview is shown (e.g. the dashboard matchup card). */
export function topPlayersByValue(
  players: ResolvedPlayer[],
  livePointsById: Record<string, number>,
  snapshot: PlayerValuesSnapshot,
  count: number,
  metric: ValueMetric = DEFAULT_VALUE_METRIC
): RankedPlayer[] {
  return rankPlayersByValue(players, livePointsById, snapshot, metric).slice(0, count);
}
