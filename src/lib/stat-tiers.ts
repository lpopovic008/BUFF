// How good a game's stat was, by position: green, yellow or red. Each tier's yellow zone is given inclusively; under
// it is red and over it green — but for interceptions, where fewer is better, the other way round. A touchdown has no
// yellow: none is red, one or more green. Kickers and defenses aren't graded.

/** How good a stat was: green, yellow, or red. */
export type StatTier = "good" | "mid" | "bad";

/** A stat's yellow zone, `from` to `to` inclusive; `fewerIsBetter` turns it round (under it green, over it red). */
interface Tier {
  from: number;
  to: number;
  fewerIsBetter?: boolean;
}

/** No yellow: none is red, one or more green. */
const ANY: Tier = { from: 1, to: 0 };

const PASS: Record<string, Tier> = {
  pass_att: { from: 25, to: 34 },
  pass_cmp: { from: 15, to: 19 },
  pass_yd: { from: 200, to: 269 },
  pass_td: { from: 1, to: 1 },
  pass_int: { from: 1, to: 1, fewerIsBetter: true },
};
const QB_RUSH: Record<string, Tier> = { rush_att: { from: 4, to: 4 }, rush_yd: { from: 12, to: 20 }, rush_td: ANY };
const RB_RUSH: Record<string, Tier> = { rush_att: { from: 10, to: 14 }, rush_yd: { from: 40, to: 60 }, rush_td: ANY };
const WR_RUSH: Record<string, Tier> = { rush_att: { from: 1, to: 2 }, rush_yd: { from: 10, to: 19 }, rush_td: ANY };
const WR_REC: Record<string, Tier> = { rec_tgt: { from: 5, to: 7 }, rec: { from: 5, to: 7 }, rec_yd: { from: 40, to: 69 }, rec_td: ANY };
const RB_REC: Record<string, Tier> = { rec_tgt: { from: 3, to: 4 }, rec: { from: 2, to: 3 }, rec_yd: { from: 19, to: 30 }, rec_td: ANY };
const TE_REC: Record<string, Tier> = { rec_tgt: { from: 3, to: 5 }, rec: { from: 4, to: 5 }, rec_yd: { from: 40, to: 59 }, rec_td: ANY };

/** Each graded position's tiers, by Sleeper's stat key. */
const TIERS: Record<string, Record<string, Tier>> = {
  QB: { ...PASS, ...QB_RUSH },
  RB: { ...RB_RUSH, ...RB_REC },
  WR: { ...WR_REC, ...WR_RUSH },
  TE: { ...TE_REC, ...WR_RUSH },
};

/**
 * How good one game's stat was for a player at `position` — Sleeper's stat key `key`, `value` (a stat he didn't have
 * in a game he played is 0) — or null for a stat (or a position) that isn't graded.
 */
export function statTier(position: string, key: string, value: number): StatTier | null {
  const tier = TIERS[position]?.[key];
  if (!tier) return null;
  if (value < tier.from) return tier.fewerIsBetter ? "good" : "bad";
  if (value > tier.to) return tier.fewerIsBetter ? "bad" : "good";
  return "mid";
}
