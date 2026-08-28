// Pure logic for the Draft Room simulator — kept free of React so the pick
// order and player pool ranking are unit-testable without rendering
// anything. The player pool is a real-players-only rank (src/data/player-
// adp.json, fetched by scripts/fetch-adp.ts from yafsb.com's real Sleeper
// ADP) — not KeepTradeCut's trade-value chart, which mixes real players
// with future-pick assets that nobody actually "drafts" in a real draft.
// Four modes, matching what /values already exposes: dynasty/redraft
// ("fantasy") x 1QB/superflex.

import { AdpEntry, AdpSnapshot } from "./player-adp";
import { LeagueFormat } from "./player-values";

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

/** Stable identity for an ADP snapshot entry — it has no shared id with anything else, so name+position is the key (matches /values' own row key for the KTC snapshot). */
export function draftPoolKey(p: AdpEntry): string {
  return `${p.position}-${p.name}`;
}

/** The snapshot's players for one mode, already sorted into draft order (lowest ADP first) by scripts/fetch-adp.ts. */
export function draftPool(snapshot: AdpSnapshot, listType: DraftListType, format: LeagueFormat): AdpEntry[] {
  if (listType === "dynasty") return format === "superflex" ? snapshot.dynastySuperflex : snapshot.dynastyOneQB;
  return format === "superflex" ? snapshot.fantasySuperflex : snapshot.fantasyOneQB;
}
