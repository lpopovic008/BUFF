// Cross-references a Sleeper roster's players against the KeepTradeCut trade
// values snapshot (src/data/player-values.json) by name — the two sources
// don't share an id, so this normalizes both names (case, punctuation,
// suffixes) before matching. Used to pick the "best" players on each side of
// a matchup for the dashboard.

import { PlayerValuesSnapshot } from "./player-values";
import { ResolvedPlayer } from "./players";

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (e.g. "e" + combining acute -> "e")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // drop punctuation (periods, apostrophes, hyphens)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "") // suffixes are inconsistent between sources
    .replace(/\s+/g, " ")
    .trim();
}

// Redraft ("fantasy") values, not dynasty — a matchup card is about this
// week's quality, not long-term asset value.
let valueIndex: Map<string, number> | null = null;
let indexedSnapshot: PlayerValuesSnapshot | null = null;

function valueIndexFor(snapshot: PlayerValuesSnapshot): Map<string, number> {
  if (valueIndex && indexedSnapshot === snapshot) return valueIndex;
  const idx = new Map<string, number>();
  for (const p of snapshot.fantasy) {
    idx.set(normalizeName(p.name), p.values.oneQBStandard);
  }
  valueIndex = idx;
  indexedSnapshot = snapshot;
  return idx;
}

export interface RankedPlayer extends ResolvedPlayer {
  /** KTC redraft trade value, or null if this player couldn't be matched (e.g. a kicker/DST KTC doesn't rank). */
  ktcValue: number | null;
  /** This week's live/actual points so far (0 before kickoff), from Sleeper's players_points. */
  livePoints: number;
}

/** Ranks every player by KTC value (highest first); unmatched players (kickers, DST, etc.) sort last. */
export function rankPlayersByValue(
  players: ResolvedPlayer[],
  livePointsById: Record<string, number>,
  snapshot: PlayerValuesSnapshot
): RankedPlayer[] {
  const idx = valueIndexFor(snapshot);
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
  count: number
): RankedPlayer[] {
  return rankPlayersByValue(players, livePointsById, snapshot).slice(0, count);
}
