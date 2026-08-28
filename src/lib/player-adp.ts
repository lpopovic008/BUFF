// Shared shape for a real-players-only draft pool ranking, fetched
// server-side by scripts/fetch-adp.ts — not KeepTradeCut's trade-value
// chart. KTC's dynasty chart mixes real players with future-pick assets for
// trade-evaluation purposes, which don't belong in a draft pool (nobody
// "drafts" a future pick in an actual startup/redraft draft). Split exactly
// along the four axes the Draft Room already exposes: dynasty vs redraft
// ("fantasy"), 1QB vs superflex.
//
// All four modes come from yafsb.com's public ADP-rankings pages — literal
// crowd-sourced Average Draft Position built from real Sleeper drafts (the
// site's own description: "not projections"). `source` is "yafsb".

export interface AdpEntry {
  name: string;
  position: string;
  team: string | null;
  /**
   * Draft-order rank within this mode's pool, lowest = drafted earliest.
   * A real decimal Average Draft Position from yafsb.com's Sleeper-draft
   * data (e.g. 4.9), not a value-based proxy. Null if the source didn't
   * rank this player at all for this mode.
   */
  adp: number | null;
}

export interface AdpSnapshot {
  updatedAt: string | null;
  source: "yafsb";
  dynastyOneQB: AdpEntry[];
  dynastySuperflex: AdpEntry[];
  fantasyOneQB: AdpEntry[];
  fantasySuperflex: AdpEntry[];
}

export const EMPTY_ADP: AdpSnapshot = {
  updatedAt: null,
  source: "yafsb",
  dynastyOneQB: [],
  dynastySuperflex: [],
  fantasyOneQB: [],
  fantasySuperflex: [],
};
