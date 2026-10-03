import test from "node:test";
import assert from "node:assert/strict";
import { computePayoutLedger, reconcilePot, summarizeWeek, standingsThroughWeek } from "./payouts";
import { EPSTEIN_ISLAND, payoutsForSeason } from "./league-config";
import { buildMatchups } from "./epstein-2025.fixture";

// 2025 was played at the original $100 buy-in; EPSTEIN_ISLAND.payouts now
// reflects the current (bumped) rules, so this season's real numbers are
// tested against its pinned 2025 override rather than the default.
const EPSTEIN_ISLAND_2025 = { ...EPSTEIN_ISLAND, payouts: payoutsForSeason(EPSTEIN_ISLAND, "2025") };

const rosterNames = new Map<number, string>(
  Object.entries(EPSTEIN_ISLAND.managerNamesByRosterId).map(([id, name]) => [Number(id), name])
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
    Colin: 130,
    Andres: 100,
    Karan: 100,
    "Matt Bj": 100,
    Luka: 90,
    Alek: 90,
    Kye: 80,
    Owen: 60,
    Sage: 60,
    "Matt Ly": 30,
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
  assert.equal(records["Colin"], "9-5");
  assert.equal(records["Andres"], "9-5");
  assert.equal(records["Karan"], "9-5");
  assert.equal(records["Alek"], "8-6");
  assert.equal(records["Luka"], "7-7");
  assert.equal(records["Matt Bj"], "7-7");
  assert.equal(records["Kye"], "7-7");
  assert.equal(records["Owen"], "5-9");
  assert.equal(records["Matt Ly"], "3-11");

  // Sage is 6-8 by the scores, though the week 14 recap's seeding list wrote
  // "FootballSage07 (7-7)". That list totals 71 wins across 70 games, so it
  // cannot be right — one of its entries is a typo, and the scores say Sage.
  assert.equal(records["Sage"], "6-8");

  // Every game produces exactly one win and one loss.
  const wins = l.managers.reduce((s, m) => s + m.wins, 0);
  const losses = l.managers.reduce((s, m) => s + m.losses, 0);
  assert.equal(wins, 70);
  assert.equal(losses, 70);
});

test("high scorers match the recaps", () => {
  const l = ledger();
  const highBy = (week: number) => summarizeWeek(l, week)?.highScorer?.name;
  assert.equal(highBy(1), "Colin"); // 184.94
  assert.equal(highBy(3), "Kye"); // 177.14
  assert.equal(highBy(4), "Andres"); // 202.98
  assert.equal(highBy(5), "Karan"); // 205.38
  assert.equal(highBy(6), "Owen"); // 173.10
  assert.equal(highBy(7), "Matt Bj"); // 215.38
  assert.equal(highBy(10), "Luka"); // 255.02
  assert.equal(highBy(13), "Matt Bj"); // 195.56
  assert.equal(highBy(14), "Colin"); // 194.78
});

test("running standings through week 7 match the sheet's cumulative column", () => {
  const rows = standingsThroughWeek(ledger(), 7);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.amount]));
  // Summing each manager's week 1-7 cells in the Dynasty sheet.
  //
  // The week 7 write-up's standings block reads $10 higher for most managers
  // (e.g. "$90 Karan"). That block credited Karan $20 in week 6 when the high
  // scorer was Owen at 173.10, so a $10 overstatement rode along from week 6
  // through week 12 before the doc self-corrected by week 13. The sheet is the
  // authority here: it sums to exactly $840 across the regular season.
  assert.equal(byName["Karan"], 80);
  assert.equal(byName["Andres"], 70);
  assert.equal(byName["Colin"], 60);
  assert.equal(byName["Alek"], 50);
  assert.equal(byName["Kye"], 40);
  assert.equal(byName["Matt Bj"], 30);
  assert.equal(byName["Owen"], 30);
  assert.equal(byName["Sage"], 30);
  assert.equal(byName["Luka"], 20);
  assert.equal(byName["Matt Ly"], 10);
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
