import test from "node:test";
import assert from "node:assert/strict";
import { computePayoutLedger } from "./payouts";
import { EPSTEIN_ISLAND, payoutsForSeason } from "./league-config";
import { buildMatchups } from "./epstein-2025.fixture";
import {
  computePlanLedger,
  describeRecipients,
  describeTiming,
  newRuleId,
  PayoutPlan,
  PayoutRule,
  planFromProfile,
  SeasonResults,
} from "./payout-plan";
import type { SleeperMatchup } from "./sleeper";

const EPSTEIN_2025 = { ...EPSTEIN_ISLAND, payouts: payoutsForSeason(EPSTEIN_ISLAND, "2025") };
const ROSTERS = Array.from({ length: 10 }, (_, i) => i + 1);
const NAMES = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, `Team ${i + 1}`] as [number, string]));

function season2025(finalOrder: number[] | null = null): SeasonResults {
  return { rosterIds: ROSTERS, names: NAMES, matchupsByWeek: buildMatchups(), regularSeasonWeeks: 14, lastWeek: 17, finalOrder };
}

function rule(partial: Partial<PayoutRule>): PayoutRule {
  return {
    id: newRuleId(),
    award: "weekHighScore",
    rank: { mode: "place", n: 1 },
    amountKind: "dollars",
    amount: 10,
    fromWeek: 1,
    toWeek: 14,
    ties: "split",
    skipIfPaid: false,
    ...partial,
  };
}

test("the league's hand-configured rules, as a plan, pay exactly what the old engine paid", () => {
  const old = computePayoutLedger({ matchupsByWeek: buildMatchups(), rosterNames: NAMES, profile: EPSTEIN_2025, teamCount: 10 });
  const plan = planFromProfile(EPSTEIN_2025, ROSTERS);
  const ledger = computePlanLedger(plan, season2025());
  for (const m of old.managers) {
    const n = ledger.managers.find((x) => x.rosterId === m.rosterId)!;
    assert.equal(n.weeklyTotal, m.weeklyTotal, `${m.name} weekly total`);
    for (const [w, v] of Object.entries(m.weekly)) assert.equal(n.weekly[Number(w)] ?? 0, v, `${m.name} week ${w}`);
  }
  assert.equal(ledger.pot, 1000);
  // $20 high score, $10 a win (not on top), top-3 finals: balances like the old reconcile said.
  assert.equal(ledger.committed, old.reconciliation.projectedWeekly + old.reconciliation.finalTotal);
  assert.equal(ledger.unallocated, 0);
});

test("season-end placements pay once the final order is known", () => {
  const plan = planFromProfile(EPSTEIN_2025, ROSTERS);
  assert.equal(computePlanLedger(plan, season2025()).managers.reduce((s, m) => s + m.seasonEnd, 0), 0);
  const done = computePlanLedger(plan, season2025([5, 1, 9, 2, 3, 4, 6, 7, 8, 10]));
  const byId = new Map(done.managers.map((m) => [m.rosterId, m]));
  assert.equal(byId.get(5)!.seasonEnd, 85);
  assert.equal(byId.get(1)!.seasonEnd, 45);
  assert.equal(byId.get(9)!.seasonEnd, 30);
  assert.equal(byId.get(2)!.seasonEnd, 0);
});

test("a percent-of-pot rule and 'the rest of the pot' share out the whole pot", () => {
  const plan: PayoutPlan = {
    version: 1,
    buyIns: Object.fromEntries(ROSTERS.map((id) => [id, 100])),
    rules: [
      rule({ amount: 20 }), // $20 × 14 weeks = $280
      rule({ award: "finalPlace", amountKind: "percent", amount: 30 }), // $300
      rule({ award: "finalPlace", rank: { mode: "place", n: 2 }, amountKind: "remainder", amount: 0 }),
    ],
  };
  const ledger = computePlanLedger(plan, season2025([3, 6, 1, 2, 4, 5, 7, 8, 9, 10]));
  const byId = new Map(ledger.managers.map((m) => [m.rosterId, m]));
  assert.equal(byId.get(3)!.seasonEnd, 300);
  assert.equal(byId.get(6)!.seasonEnd, 420);
  assert.equal(Math.round(ledger.paidToDate), 1000);
  assert.equal(Math.round(ledger.unallocated), 0);
});

test("top-N weekly awards, ties split or paid in full, and no double-dipping", () => {
  // One week: A 150, B 150 (tied top), C 120, D 100. A beat C, B beat D.
  const week: SleeperMatchup[] = [
    { roster_id: 1, matchup_id: 1, points: 150 },
    { roster_id: 3, matchup_id: 1, points: 120 },
    { roster_id: 2, matchup_id: 2, points: 150 },
    { roster_id: 4, matchup_id: 2, points: 100 },
  ];
  const s: SeasonResults = { rosterIds: [1, 2, 3, 4], names: new Map(), matchupsByWeek: new Map([[1, week]]), regularSeasonWeeks: 1, lastWeek: 1, finalOrder: null };
  const pay = (rules: PayoutRule[]) =>
    Object.fromEntries(computePlanLedger({ version: 1, buyIns: {}, rules }, s).managers.map((m) => [m.rosterId, m.weekly[1] ?? 0]));

  // Two tied for 1st split the 1st-place money...
  assert.deepEqual(pay([rule({ toWeek: 1 })]), { 1: 5, 2: 5, 3: 0, 4: 0 });
  // ...or each take it in full.
  assert.deepEqual(pay([rule({ toWeek: 1, ties: "each" })]), { 1: 10, 2: 10, 3: 0, 4: 0 });
  // Top 3: the tied pair covers places 1–2, C is 3rd.
  assert.deepEqual(pay([rule({ toWeek: 1, rank: { mode: "top", n: 3 } })]), { 1: 10, 2: 10, 3: 10, 4: 0 });
  // Winners get $5, but not anyone the high-score rule already paid.
  assert.deepEqual(
    pay([rule({ toWeek: 1, ties: "each" }), rule({ toWeek: 1, award: "matchupWinner", amount: 5, skipIfPaid: true })]),
    { 1: 10, 2: 10, 3: 0, 4: 0 }
  );
  // Highest score in a loss, and the biggest blowout.
  assert.deepEqual(pay([rule({ toWeek: 1, award: "highScoreInLoss" })]), { 1: 0, 2: 0, 3: 10, 4: 0 });
  assert.deepEqual(pay([rule({ toWeek: 1, award: "biggestWin" })]), { 1: 0, 2: 10, 3: 0, 4: 0 });
});

test("rules read as sentences", () => {
  assert.equal(describeRecipients(rule({ award: "finalPlace" })), "the champion");
  assert.equal(describeRecipients(rule({ award: "finalPlace", rank: { mode: "bottom", n: 1 } })), "the last-place finisher");
  assert.equal(describeRecipients(rule({ rank: { mode: "top", n: 3 } })), "each of the week's top 3 scorers");
  assert.equal(describeRecipients(rule({ award: "weekHighScore", rank: { mode: "place", n: 2 } })), "the week's 2nd-highest scorer");
  assert.equal(describeTiming(rule({}), 14), "every regular-season week (1–14)");
  assert.equal(describeTiming(rule({ fromWeek: 17, toWeek: 17 }), 14), "in week 17 only");
});

test("survivor: the week's lowest scorer still standing is knocked out until one team is left", () => {
  // 10 teams, 14 weeks: nine eliminations, done by week 9.
  const plan: PayoutPlan = { version: 1, buyIns: {}, rules: [rule({ award: "survivor", amount: 100 })] };
  const done = computePlanLedger(plan, season2025());
  const winners = done.managers.filter((m) => m.seasonEnd > 0);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].seasonEnd, 100);
  // Not decided while more than one team stands.
  const early = computePlanLedger(plan, { ...season2025(), matchupsByWeek: new Map([...buildMatchups()].filter(([w]) => w <= 3)) });
  assert.equal(early.managers.reduce((s, m) => s + m.seasonEnd, 0), 0);
  // Week 1's lowest scorer (Team 4, 108.52) can't be the winner.
  assert.notEqual(winners[0].rosterId, 4);
});

test("above the median, mid-season standings, and all-play", () => {
  const plan: PayoutPlan = {
    version: 1,
    buyIns: {},
    rules: [
      rule({ award: "aboveMedian", amount: 1, toWeek: 1 }),
      rule({ award: "regularSeasonPlace", amount: 50, toWeek: 7 }),
      rule({ award: "allPlayRecord", amount: 25 }),
    ],
  };
  const ledger = computePlanLedger(plan, season2025());
  // Week 1: half the league beats the median.
  assert.equal(ledger.managers.filter((m) => (m.weekly[1] ?? 0) === 1).length, 5);
  // One mid-season leader and one all-play leader get paid.
  assert.equal(ledger.managers.filter((m) => m.seasonDetail.some((p) => p.ruleId === plan.rules[1].id)).length, 1);
  assert.equal(ledger.managers.filter((m) => m.seasonDetail.some((p) => p.ruleId === plan.rules[2].id)).length, 1);
  assert.match(describeTiming(plan.rules[1], 14), /after week 7/);
});

test("the podium sets an amount aside and splits it by final finish", () => {
  const plan: PayoutPlan = {
    version: 1,
    buyIns: Object.fromEntries(ROSTERS.map((id) => [id, 100])),
    rules: [rule({ award: "podium", amountKind: "percent", amount: 30, split: [50, 30, 20] })],
  };
  assert.equal(computePlanLedger(plan, season2025()).committed, 300);
  const done = computePlanLedger(plan, season2025([7, 2, 9, 1, 3, 4, 5, 6, 8, 10]));
  const byId = new Map(done.managers.map((m) => [m.rosterId, m]));
  assert.equal(byId.get(7)!.seasonEnd, 150);
  assert.equal(byId.get(2)!.seasonEnd, 90);
  assert.equal(byId.get(9)!.seasonEnd, 60);
  assert.deepEqual(byId.get(7)!.seasonDetail.map((p) => p.place), [1]);
  assert.equal(describeRecipients(plan.rules[0]), "the podium (1st 50% · 2nd 30% · 3rd 20%)");
});
