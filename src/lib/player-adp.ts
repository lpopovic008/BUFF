// Shared shape for a real-players-only draft pool ranking, fetched
// server-side by scripts/fetch-adp.ts — not KeepTradeCut's trade-value
// chart. KTC's dynasty chart mixes real players with future-pick assets for
// trade-evaluation purposes, which don't belong in a draft pool (nobody
// "drafts" a future pick in an actual startup/redraft draft). Split exactly
// along the four axes the Draft Room already exposes: dynasty vs redraft
// ("fantasy"), 1QB vs superflex.
//
// The two axes currently come from two different real sources: redraft
// ("fantasy") 1QB/superflex from 4for4's public ADP pages (literal
// crowd-sourced average draft position, aggregated across real platforms);
// dynasty 1QB/superflex still from FantasyCalc's value-based rank (no real
// dynasty ADP source has been found yet). `source` is "mixed" while that
// split holds.

export interface AdpEntry {
  name: string;
  position: string;
  team: string | null;
  /**
   * Draft-order rank within this mode's pool, lowest = drafted earliest.
   * For the redraft ("fantasy") modes this is 4for4's real ADP column —
   * literal crowd-sourced average draft position. For the dynasty modes
   * it's FantasyCalc's `overallRank`/`positionRank` (computed fresh per
   * mode) instead, a value-based rank rather than literal ADP — FantasyCalc's
   * own ADP field exists but is unpopulated, and no real dynasty ADP source
   * has been found yet (Underdog is bot-protected; FantasyPros and
   * DraftSharks load their ADP tables client-side via JS). Null if the
   * source didn't rank this player at all for this mode.
   */
  adp: number | null;
}

export interface AdpSnapshot {
  updatedAt: string | null;
  source: "mixed";
  dynastyOneQB: AdpEntry[];
  dynastySuperflex: AdpEntry[];
  fantasyOneQB: AdpEntry[];
  fantasySuperflex: AdpEntry[];
}

export const EMPTY_ADP: AdpSnapshot = {
  updatedAt: null,
  source: "mixed",
  dynastyOneQB: [],
  dynastySuperflex: [],
  fantasyOneQB: [],
  fantasySuperflex: [],
};
