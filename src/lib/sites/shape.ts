// The pieces of Sleeper's shape every site's adapter builds the same way: a league's lineup slots (its
// roster_positions) in Sleeper's order, a team's starters laid into them, a playoff bracket from its games, a
// trade or a pickup as one of Sleeper's transactions.

import type { SleeperBracketMatch, SleeperRosterSettings, SleeperTransaction } from "../sleeper";
import { pointsSettings } from "./fetch";

/** Sleeper's lineup slots, in the order it lists them; then its bench. */
const SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "WRRB_FLEX", "REC_FLEX", "SUPER_FLEX", "K", "DEF", "DL", "LB", "DB", "IDP_FLEX"];

/** A league's roster_positions: each lineup slot as many times as it has them, in Sleeper's order, then the bench. */
export function rosterPositions(counts: Record<string, number>, bench: number): string[] {
  const out: string[] = [];
  const known = [...SLOT_ORDER, ...Object.keys(counts).filter((k) => !SLOT_ORDER.includes(k))];
  for (const slot of known) for (let i = 0; i < (counts[slot] ?? 0); i++) out.push(slot);
  for (let i = 0; i < bench; i++) out.push("BN");
  return out;
}

/**
 * A team's starters laid into a league's lineup slots, in their order (as Sleeper lists a team's starters): each slot
 * the first starter in it not yet placed, an empty one "0" — and any starter whose slot the league doesn't list put
 * in the first empty one left.
 */
export function orderStarters(positions: string[], starters: { id: string; slot: string }[]): string[] {
  const slots = positions.filter((p) => p !== "BN");
  const left = [...starters];
  const out = slots.map((slot) => {
    const i = left.findIndex((s) => s.slot === slot);
    return i >= 0 ? left.splice(i, 1)[0].id : "0";
  });
  for (const s of left) {
    const empty = out.indexOf("0");
    if (empty < 0) out.push(s.id);
    else out[empty] = s.id;
  }
  return out;
}

/** A playoff game, as a site has it: its round (1 the first), its two teams, the winner once it's played. */
export interface PlayoffGame {
  round: number;
  t1: number | null;
  t2: number | null;
  winner?: number | null;
  /** The place it decides: 1 the final, 3 the game for third. */
  place?: number;
}

/** A bracket in Sleeper's shape: each game numbered in order, its loser worked out from its winner. */
export function bracketFrom(games: PlayoffGame[]): SleeperBracketMatch[] {
  return [...games]
    .sort((a, b) => a.round - b.round)
    .map((g, i) => ({
      r: g.round,
      m: i + 1,
      t1: g.t1,
      t2: g.t2,
      w: g.winner ?? null,
      l: g.winner == null ? null : g.winner === g.t1 ? g.t2 : g.t1,
      ...(g.place ? { p: g.place } : {}),
    }));
}

/** A team's season so far in Sleeper's roster settings. */
export function rosterSettings(r: { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }): SleeperRosterSettings {
  const pf = pointsSettings(r.pointsFor);
  const pa = pointsSettings(r.pointsAgainst);
  return {
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    fpts: pf.whole,
    fpts_decimal: pf.decimal,
    fpts_against: pa.whole,
    fpts_against_decimal: pa.decimal,
  };
}

/** A transaction in Sleeper's shape: who got whom (`adds`) and gave up whom (`drops`), by roster id. */
export function transaction(t: {
  id: string;
  type: SleeperTransaction["type"];
  at: number;
  week: number;
  adds: Record<string, number>;
  drops: Record<string, number>;
  rosterIds?: number[];
  picks?: SleeperTransaction["draft_picks"];
  bid?: number;
}): SleeperTransaction {
  const rosterIds = t.rosterIds ?? [...new Set([...Object.values(t.adds), ...Object.values(t.drops)])];
  return {
    transaction_id: t.id,
    type: t.type,
    status: "complete",
    leg: t.week,
    creator: "",
    created: t.at,
    roster_ids: rosterIds,
    adds: Object.keys(t.adds).length ? t.adds : null,
    drops: Object.keys(t.drops).length ? t.drops : null,
    draft_picks: t.picks ?? [],
    waiver_budget: [],
    ...(t.bid != null ? { settings: { waiver_bid: t.bid } } : {}),
  } as SleeperTransaction;
}
