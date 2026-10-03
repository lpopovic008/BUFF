// The money grid's colors for payout rules (CSS variables in globals.css):
// regular-season weekly rules in shades of blue, the podium (and any
// final-finish payout for 1st/2nd/3rd) in gold, silver and bronze, and every
// other rule in greys. Each color comes with an ink for text on it.

import { awardInfo, PayoutRule, RulePayment } from "./payout-plan";

export interface Swatch {
  bg: string;
  ink: string;
}

const swatch = (name: string): Swatch => ({ bg: `var(--pay-${name})`, ink: `var(--pay-${name}-ink)` });

const BLUES = [1, 2, 3, 4, 5, 6].map((n) => swatch(`blue-${n}`));
const GREYS = [1, 2, 3].map((n) => swatch(`grey-${n}`));
const METALS = [swatch("gold"), swatch("silver"), swatch("bronze")];

/** Gold, silver or bronze for 1st, 2nd or 3rd; null for any other place. */
export function placeSwatch(place: number): Swatch | null {
  return METALS[place - 1] ?? null;
}

/** Whether a rule pays the podium: the podium rule itself, or a final-finish payout for a single place 1–3. */
function podiumPlace(rule: PayoutRule): number | null {
  if (rule.award === "finalPlace" && rule.rank.mode === "place" && rule.rank.n <= 3) return rule.rank.n;
  return null;
}

/**
 * Each rule's color: blues for weekly regular-season rules, in rule order;
 * metals for single podium places; greys for the rest (playoff-week prizes,
 * other season awards). A podium rule's own color is gold — its payouts are
 * colored by place (see paymentSwatch).
 */
export function ruleSwatches(rules: PayoutRule[], regularSeasonWeeks: number): Map<string, Swatch> {
  const out = new Map<string, Swatch>();
  let blue = 0;
  let grey = 0;
  for (const r of rules) {
    const place = podiumPlace(r);
    if (r.award === "podium") out.set(r.id, METALS[0]);
    else if (place) out.set(r.id, METALS[place - 1]);
    else if (awardInfo(r.award).timing === "weekly" && r.fromWeek <= regularSeasonWeeks) out.set(r.id, BLUES[blue++ % BLUES.length]);
    else out.set(r.id, GREYS[grey++ % GREYS.length]);
  }
  return out;
}

/** The color for one payment: a podium payout by its place, anything else by its rule. */
export function paymentSwatch(p: RulePayment, swatches: Map<string, Swatch>): Swatch | undefined {
  return (p.place ? placeSwatch(p.place) : null) ?? swatches.get(p.ruleId);
}
