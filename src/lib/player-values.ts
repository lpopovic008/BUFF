// Shared shape for KeepTradeCut-sourced trade values. The snapshot is fetched
// server-side by scripts/fetch-player-values.ts (real network access, no CORS
// concerns) and committed as JSON, then imported directly into the /values
// page at build time — no runtime fetch, no basePath, nothing to break.
//
// KTC's own rankings page exposes two independent toggles — 1QB vs Superflex,
// and Standard vs TE Premium — and a single fetch already carries all four
// combinations per player (oneQBValues.value / oneQBValues.tep.value /
// superflexValues.value / superflexValues.tep.value), so there's no need to
// fetch four separate pages. The values object below mirrors that.

export type LeagueFormat = "oneQB" | "superflex";
export type TEPremium = "standard" | "tep";

export interface PlayerValue {
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  values: {
    oneQBStandard: number;
    oneQBTep: number;
    superflexStandard: number;
    superflexTep: number;
  };
}

export interface PlayerValuesSnapshot {
  /** ISO timestamp of the last successful fetch, or null if never populated. */
  updatedAt: string | null;
  source: "keeptradecut";
  dynasty: PlayerValue[];
  fantasy: PlayerValue[];
}

export const EMPTY_PLAYER_VALUES: PlayerValuesSnapshot = {
  updatedAt: null,
  source: "keeptradecut",
  dynasty: [],
  fantasy: [],
};

export function valueFor(player: PlayerValue, format: LeagueFormat, tep: TEPremium): number {
  if (format === "superflex") {
    return tep === "tep" ? player.values.superflexTep : player.values.superflexStandard;
  }
  return tep === "tep" ? player.values.oneQBTep : player.values.oneQBStandard;
}
