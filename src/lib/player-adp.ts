// Shared shape for a real-players-only draft pool ranking, fetched
// server-side by scripts/fetch-adp.ts from FantasyCalc's API — not
// KeepTradeCut's trade-value chart. KTC's dynasty chart mixes real players
// with future-pick assets for trade-evaluation purposes, which don't belong
// in a draft pool (nobody "drafts" a future pick in an actual startup/
// redraft draft). Split exactly along the four axes the Draft Room already
// exposes: dynasty vs redraft ("fantasy"), 1QB vs superflex.

export interface AdpEntry {
  name: string;
  position: string;
  team: string | null;
  /**
   * Draft-order rank within this mode's pool, lowest = drafted earliest.
   * This is FantasyCalc's `overallRank`/`positionRank` (computed fresh per
   * mode), not literal crowd-sourced Average Draft Position — FantasyCalc's
   * own ADP field exists but is unpopulated, and real per-platform ADP
   * (Underdog, FantasyPros, etc.) isn't reachable from a plain fetch script
   * (bot-protected or client-JS-rendered). Null if FantasyCalc didn't rank
   * this player at all for this mode.
   */
  adp: number | null;
}

export interface AdpSnapshot {
  updatedAt: string | null;
  source: "fantasycalc";
  dynastyOneQB: AdpEntry[];
  dynastySuperflex: AdpEntry[];
  fantasyOneQB: AdpEntry[];
  fantasySuperflex: AdpEntry[];
}

export const EMPTY_ADP: AdpSnapshot = {
  updatedAt: null,
  source: "fantasycalc",
  dynastyOneQB: [],
  dynastySuperflex: [],
  fantasyOneQB: [],
  fantasySuperflex: [],
};
