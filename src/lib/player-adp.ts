// Shared shape for real (crowd-sourced) Average Draft Position data, fetched
// server-side by scripts/fetch-adp.ts from FantasyCalc's rankings API — not
// KeepTradeCut's trade-value chart. KTC's dynasty chart mixes real players
// with future-pick assets for trade-evaluation purposes, which don't belong
// in a draft pool (nobody "drafts" a future pick in an actual startup/
// redraft draft), and a trade value isn't really the same thing as where
// people actually pick a player. FantasyCalc's own ADP is aggregated from
// real startup/redraft drafts, split exactly along the four axes the Draft
// Room already exposes: dynasty vs redraft ("fantasy"), 1QB vs superflex.

export interface AdpEntry {
  name: string;
  position: string;
  team: string | null;
  /** Real average draft position within this mode's pool, lowest = drafted earliest. Null if too few real drafts have included this player yet. */
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
