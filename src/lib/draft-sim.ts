// Pure logic for the Draft Room simulator — kept free of React so the pick
// order and player pool ranking are unit-testable without rendering
// anything. The player pool itself is the same committed KeepTradeCut
// snapshot the /values page reads (src/data/player-values.json); this
// module just re-sorts it into draft order for a given mode, the same four
// combinations /values already exposes (dynasty/fantasy x 1QB/superflex).

import { LeagueFormat, PlayerValue, PlayerValuesSnapshot, valueFor } from "./player-values";

export type DraftListType = "dynasty" | "fantasy";
export type DraftOrderType = "snake" | "linear";

export interface DraftSettings {
  teams: number;
  rounds: number;
  type: DraftOrderType;
  listType: DraftListType;
  format: LeagueFormat;
}

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  teams: 12,
  rounds: 15,
  type: "snake",
  listType: "fantasy",
  format: "oneQB",
};

export const MIN_TEAMS = 4;
export const MAX_TEAMS = 16;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 30;

/** 1-indexed team on the clock for a 0-indexed overall pick number. */
export function teamForPick(pickIndex: number, teams: number, type: DraftOrderType): number {
  const round = Math.floor(pickIndex / teams);
  const posInRound = pickIndex % teams;
  const reversed = type === "snake" && round % 2 === 1;
  return (reversed ? teams - 1 - posInRound : posInRound) + 1;
}

/** 1-indexed round for a 0-indexed overall pick number. */
export function roundForPick(pickIndex: number, teams: number): number {
  return Math.floor(pickIndex / teams) + 1;
}

/** Stable identity for a KTC snapshot entry — it has no shared id with anything else, so name+position is the key (matches /values' own row key). */
export function draftPoolKey(p: PlayerValue): string {
  return `${p.position}-${p.name}`;
}

/** The KTC snapshot's players for one list, sorted into draft order (highest value first) for a mode. This is the same value used as the ADP proxy everywhere else in the app pulls from this snapshot — there's no separate real ADP feed. */
export function draftPool(snapshot: PlayerValuesSnapshot, listType: DraftListType, format: LeagueFormat): PlayerValue[] {
  const list = listType === "dynasty" ? snapshot.dynasty : snapshot.fantasy;
  return [...list].sort((a, b) => valueFor(b, format, "standard") - valueFor(a, format, "standard"));
}
