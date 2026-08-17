// Shared shape for KeepTradeCut-sourced trade values. The snapshot is fetched
// server-side by scripts/fetch-player-values.ts (real network access, no CORS
// concerns) and committed as JSON, then imported directly into the /values
// page at build time — no runtime fetch, no basePath, nothing to break.

export interface PlayerValue {
  name: string;
  position: "QB" | "RB" | "WR" | "TE" | "PICK" | string;
  team: string | null;
  age: number | null;
  rank: number;
  /** KeepTradeCut's 0-9999 crowd-sourced trade value score. */
  value: number;
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
