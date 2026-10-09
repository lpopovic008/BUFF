import test from "node:test";
import assert from "node:assert/strict";
import { computePayoutLedger, cumulativeSeriesByManager, reconcilePot, summarizeWeek, standingsThroughWeek } from "./payouts";
import { EPSTEIN_ISLAND, payoutsForSeason } from "./league-config";
import { buildMatchups } from "./epstein-2025.fixture";

// 2025 was played at the original $100 buy-in; EPSTEIN_ISLAND.payouts now
// reflects the current (bumped) rules, so this season's real numbers are
// tested against its pinned 2025 override rather than the default.
const EPSTEIN_ISLAND_2025 = { ...EPSTEIN_ISLAND, payouts: payoutsForSeason(EPSTEIN_ISLAND, "2025") };

const rosterNames = new Map<number, string>(
  Array.from({ length: 10 }, (_, i) => [i + 1, `Team ${i + 1}`] as [number, string])
);

function ledger() {
  return computePayoutLedger({
    matchupsByWeek: buildMatchups(),
    rosterNames,
    profile: EPSTEIN_ISLAND_2025,
    teamCount: 10,
  });
}

test("season totals match the Dynasty sheet after week 14", () => {
  // Straight from the doc's week 14 "Updated Standings" block.
  const expected: Record<string, number> = {
    "Team 9": 130,
    "Team 6": 100,
    "Team 2": 100,
    "Team 8": 100,
    "Team 1": 90,
    "Team 5": 90,
    "Team 10": 80,
    "Team 4": 60,
    "Team 3": 60,
    "Team 7": 30,
  };
  const actual = Object.fromEntries(ledger().managers.map((m) => [m.name, m.total]));
  assert.deepEqual(actual, expected);
});

test("weekly commission totals $840 over 14 weeks", () => {
  assert.equal(ledger().paidToDate, 840);
});

test("every week pays exactly $60", () => {
  const l = ledger();
  for (const week of l.weeksPlayed) {
    const weekTotal = l.results
      .filter((r) => r.week === week)
      .reduce((sum, r) => sum + r.payout, 0);
    assert.equal(weekTotal, 60, `week ${week} paid ${weekTotal}`);
  }
});

test("win-loss records are internally consistent and match the scores", () => {
  const l = ledger();
  const records = Object.fromEntries(l.managers.map((m) => [m.name, `${m.wins}-${m.losses}`]));
  assert.equal(records["Team 9"], "9-5");
  assert.equal(records["Team 6"], "9-5");
  assert.equal(records["Team 2"], "9-5");
  assert.equal(records["Team 5"], "8-6");
  assert.equal(records["Team 1"], "7-7");
  assert.equal(records["Team 8"], "7-7");
  assert.equal(records["Team 10"], "7-7");
  assert.equal(records["Team 4"], "5-9");
  assert.equal(records["Team 7"], "3-11");

  // Team 3 is 6-8 by the scores, though the week 14 recap's seeding list wrote
  // "<a username> (7-7)". That list totals 71 wins across 70 games, so it
  // cannot be right — one of its entries is a typo, and the scores say Team 3.
  assert.equal(records["Team 3"], "6-8");

  // Every game produces exactly one win and one loss.
  const wins = l.managers.reduce((s, m) => s + m.wins, 0);
  const losses = l.managers.reduce((s, m) => s + m.losses, 0);
  assert.equal(wins, 70);
  assert.equal(losses, 70);
});

test("high scorers match the recaps", () => {
  const l = ledger();
  const highBy = (week: number) => summarizeWeek(l, week)?.highScorer?.name;
  assert.equal(highBy(1), "Team 9"); // 184.94
  assert.equal(highBy(3), "Team 10"); // 177.14
  assert.equal(highBy(4), "Team 6"); // 202.98
  assert.equal(highBy(5), "Team 2"); // 205.38
  assert.equal(highBy(6), "Team 4"); // 173.10
  assert.equal(highBy(7), "Team 8"); // 215.38
  assert.equal(highBy(10), "Team 1"); // 255.02
  assert.equal(highBy(13), "Team 8"); // 195.56
  assert.equal(highBy(14), "Team 9"); // 194.78
});

test("running standings through week 7 match the sheet's cumulative column", () => {
  const rows = standingsThroughWeek(ledger(), 7);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.amount]));
  // Summing each manager's week 1-7 cells in the Dynasty sheet.
  //
  // The week 7 write-up's standings block reads $10 higher for most managers
  // (e.g. "$90 Team 2"). That block credited Team 2 $20 in week 6 when the high
  // scorer was Team 4 at 173.10, so a $10 overstatement rode along from week 6
  // through week 12 before the doc self-corrected by week 13. The sheet is the
  // authority here: it sums to exactly $840 across the regular season.
  assert.equal(byName["Team 2"], 80);
  assert.equal(byName["Team 6"], 70);
  assert.equal(byName["Team 9"], 60);
  assert.equal(byName["Team 5"], 50);
  assert.equal(byName["Team 10"], 40);
  assert.equal(byName["Team 8"], 30);
  assert.equal(byName["Team 4"], 30);
  assert.equal(byName["Team 3"], 30);
  assert.equal(byName["Team 1"], 20);
  assert.equal(byName["Team 7"], 10);
  // Seven weeks at $60.
  assert.equal(
    rows.reduce((s, r) => s + r.amount, 0),
    420
  );
});

test("the pot balances exactly for the 2025 ($100 buy-in) rules", () => {
  const r = reconcilePot(EPSTEIN_ISLAND_2025.payouts, 10);
  assert.equal(r.pot, 1000);
  assert.equal(r.projectedWeekly, 840);
  assert.equal(r.finalTotal, 160);
  assert.equal(r.unallocated, 0);
  assert.equal(r.balances, true);
});

test("the pot balances exactly for the current ($150 buy-in) rules", () => {
  const r = reconcilePot(EPSTEIN_ISLAND.payouts, 10);
  assert.equal(r.pot, 1500);
  assert.equal(r.projectedWeekly, 1260);
  assert.equal(r.finalTotal, 240);
  assert.equal(r.unallocated, 0);
  assert.equal(r.balances, true);
});

test("the money chart's lines start at $0 in week 0, step through played weeks, and end with the season's prizes", () => {
  const series = cumulativeSeriesByManager({
    weeksPlayed: [2, 1, 3],
    managers: [
      { rosterId: 1, name: "a", weekly: { 1: 10, 3: 10 }, seasonEnd: 0 },
      { rosterId: 2, name: "b", weekly: { 2: 10 }, seasonEnd: 100 },
    ],
  });
  assert.deepEqual(
    series.map((s) => [s.name, s.points, s.finalAmount]),
    [
      ["b", [{ week: 0, amount: 0 }, { week: 1, amount: 0 }, { week: 2, amount: 10 }, { week: 3, amount: 10 }, { week: "season", amount: 110 }], 110],
      ["a", [{ week: 0, amount: 0 }, { week: 1, amount: 10 }, { week: 2, amount: 10 }, { week: 3, amount: 20 }, { week: "season", amount: 20 }], 20],
    ]
  );
  // Before any season prize is paid there's no season point yet.
  const midway = cumulativeSeriesByManager({ weeksPlayed: [1], managers: [{ rosterId: 1, name: "a", weekly: { 1: 5 } }] });
  assert.deepEqual(midway[0].points, [{ week: 0, amount: 0 }, { week: 1, amount: 5 }]);
});
