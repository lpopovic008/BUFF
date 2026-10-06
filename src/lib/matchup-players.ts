// Cross-references a Sleeper roster's players against the KeepTradeCut trade
// values snapshot (src/data/player-values.json) by name — the two sources
// don't share an id, so this normalizes both names (case, punctuation,
// suffixes) before matching. Used to pick the "best" players on each side of
// a matchup for the dashboard.

import { LeagueFormat, PlayerValuesSnapshot, TEPremium, valueFor } from "./player-values";
import { PlayerStatsSnapshot, seasonPointsFor } from "./player-stats";
import { ResolvedPlayer } from "./players";
import { normalizeName } from "./name-match";

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

/** Exported so other callers (e.g. the Draft Room's post-draft team-value summary) can reuse the same name-matched KTC index instead of re-deriving it. */
export function valueIndexFor(snapshot: PlayerValuesSnapshot, metric: ValueMetric): Map<string, number> {
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

// --- Position-scoped ranks (value rank at position; the blended rank shown in the lineup view) ---
//
// The Values page's own `rank` is computed across every position at once
// (see app/(chrome)/values/page.tsx) — not what a lineup row wants, since
// "Chris Olave is dynasty #47 overall" is a meaningless number next to a
// bare position column. These instead rank a player only against others at
// their own position, e.g. Chris Olave -> WR13.

const positionValueRankCache = new Map<string, Map<string, number>>();
let positionRankedValueSnapshot: PlayerValuesSnapshot | null = null;

/** A player's dynasty/fantasy rank among every player at their own position (1 = most valuable), keyed by normalized name. */
export function positionValueRankIndexFor(snapshot: PlayerValuesSnapshot, metric: ValueMetric): Map<string, number> {
  if (positionRankedValueSnapshot !== snapshot) {
    positionValueRankCache.clear();
    positionRankedValueSnapshot = snapshot;
  }
  const key = `${metric.listType}:${metric.format}:${metric.tep}`;
  const cached = positionValueRankCache.get(key);
  if (cached) return cached;

  const list = metric.listType === "dynasty" ? snapshot.dynasty : snapshot.fantasy;
  const byPosition = new Map<string, typeof list>();
  for (const p of list) {
    const group = byPosition.get(p.position);
    if (group) group.push(p);
    else byPosition.set(p.position, [p]);
  }

  const idx = new Map<string, number>();
  for (const group of byPosition.values()) {
    const ranked = [...group].sort((a, b) => valueFor(b, metric.format, metric.tep) - valueFor(a, metric.format, metric.tep));
    ranked.forEach((p, i) => idx.set(normalizeName(p.name), i + 1));
  }
  positionValueRankCache.set(key, idx);
  return idx;
}

/**
 * A player's id-keyed dynasty value under a league's metric, for blending
 * into the lineup rank — KTC lists players by name only, so each is matched
 * to Sleeper's id by position and normalized name (`loadPlayerIdIndex`).
 */
export function valuesByPlayerId(
  snapshot: PlayerValuesSnapshot,
  metric: ValueMetric,
  idIndex: Map<string, string>
): Map<string, number> {
  const list = metric.listType === "dynasty" ? snapshot.dynasty : snapshot.fantasy;
  const out = new Map<string, number>();
  for (const p of list) {
    const id = idIndex.get(`${p.position}-${normalizeName(p.name)}`);
    if (id) out.set(id, valueFor(p, metric.format, metric.tep));
  }
  return out;
}

/**
 * The lineup view's position rank (1 = best RB, say): this season's points,
 * points per game — so a missed game costs less — and, in a dynasty league,
 * dynasty value, each scaled against the position's leader (1 for the top
 * scorer, 0.5 for half as many) and averaged with equal weight. A position
 * KTC doesn't value (K, DEF) blends the first two alone; a player KTC doesn't
 * list counts as no value. Keyed by Sleeper player id; players who haven't
 * played yet aren't ranked.
 */
export function positionBlendRankIndexFor(
  snapshot: PlayerStatsSnapshot,
  scoringSettings?: Record<string, number>,
  dynastyValues?: Map<string, number>
): Map<string, number> {
  const byPosition = new Map<string, typeof snapshot.players>();
  for (const line of snapshot.players) {
    if (line.gamesPlayed <= 0) continue;
    const group = byPosition.get(line.position);
    if (group) group.push(line);
    else byPosition.set(line.position, [line]);
  }

  const idx = new Map<string, number>();
  for (const group of byPosition.values()) {
    const rows = group.map((line) => {
      const points = seasonPointsFor(line, scoringSettings);
      return { id: line.playerId, points, ppg: points / line.gamesPlayed, value: dynastyValues?.get(line.playerId) ?? 0 };
    });
    const top = (pick: (r: (typeof rows)[number]) => number) => Math.max(0, ...rows.map(pick));
    const topPoints = top((r) => r.points);
    const topPpg = top((r) => r.ppg);
    const topValue = top((r) => r.value);
    const share = (n: number, max: number) => (max > 0 ? Math.max(0, n) / max : 0);
    const scored = rows.map((r) => {
      const parts = [share(r.points, topPoints), share(r.ppg, topPpg)];
      if (topValue > 0) parts.push(share(r.value, topValue));
      return { ...r, score: parts.reduce((a, b) => a + b, 0) / parts.length };
    });
    scored.sort((a, b) => b.score - a.score || b.points - a.points);
    scored.forEach((r, i) => idx.set(r.id, i + 1));
  }
  return idx;
}
