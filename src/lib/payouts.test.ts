import test from "node:test";
import assert from "node:assert/strict";
import { computePayoutLedger, reconcilePot, summarizeWeek, standingsThroughWeek } from "./payouts";
import { EPSTEIN_ISLAND, payoutsForSeason } from "./league-config";
import type { SleeperMatchup } from "./sleeper";

// 2025 was played at the original $100 buy-in; EPSTEIN_ISLAND.payouts now
// reflects the current (bumped) rules, so this season's real numbers are
// tested against its pinned 2025 override rather than the default.
const EPSTEIN_ISLAND_2025 = { ...EPSTEIN_ISLAND, payouts: payoutsForSeason(EPSTEIN_ISLAND, "2025") };

// Real Epstein Island 2025 regular season, transcribed from the Dynasty sheet.
// Each entry is one game: [rosterA, pointsA, rosterB, pointsB].
const SEASON_2025: Record<number, [number, number, number, number][]> = {
  1: [
    [1, 127.22, 2, 160.2],
    [5, 138.6, 8, 121.56],
    [3, 146.24, 10, 142.18],
    [4, 108.52, 9, 184.94],
    [6, 144.54, 7, 143.6],
  ],
  2: [
    [3, 151.14, 5, 188.14],
    [1, 142.74, 8, 159.24],
    [2, 164.58, 4, 148.84],
    [7, 117.94, 10, 163.88],
    [6, 172.9, 9, 131.32],
  ],
  3: [
    [3, 145.86, 8, 121.18],
    [2, 135.48, 5, 103.72],
    [1, 160.4, 9, 137.22],
    [6, 154.44, 10, 177.14],
    [4, 141.4, 7, 138.14],
  ],
  4: [
    [1, 150.3, 3, 181.98],
    [2, 158.24, 8, 146.48],
    [5, 137.32, 7, 143.98],
    [9, 164.32, 10, 154.36],
    [4, 176.2, 6, 202.98],
  ],
  5: [
    [2, 205.38, 3, 155.96],
    [1, 161.66, 5, 188.92],
    [6, 182.92, 8, 148.58],
    [4, 108.96, 10, 154.44],
    [7, 166.78, 9, 176.52],
  ],
  6: [
    [3, 156.88, 4, 173.1],
    [2, 136.72, 10, 74.76],
    [1, 168.14, 7, 158.3],
    [5, 153.74, 6, 161.2],
    [8, 110.16, 9, 146.68],
  ],
  7: [
    [3, 138.26, 9, 140.12],
    [2, 161.86, 7, 154.08],
    [1, 193.4, 6, 201.76],
    [5, 145.68, 10, 103.9],
    [4, 109.92, 8, 215.38],
  ],
  8: [
    [3, 106.9, 7, 144.74],
    [2, 130.14, 6, 128.5],
    [1, 121.12, 4, 119.92],
    [5, 163.38, 9, 150.68],
    [8, 177.1, 10, 154.86],
  ],
  9: [
    [3, 154.9, 6, 177.2],
    [2, 95.36, 9, 190.96],
    [1, 157.96, 10, 172.78],
    [4, 138.26, 5, 138.74],
    [7, 110.8, 8, 167.12],
  ],
  10: [
    [1, 255.02, 2, 188.24],
    [5, 94.4, 8, 103.12],
    [3, 118.78, 10, 110.98],
    [4, 143.9, 9, 183.36],
    [6, 144.68, 7, 147.72],
  ],
  11: [
    [3, 155.84, 5, 108.94],
    [1, 137.2, 8, 134.4],
    [2, 127.26, 4, 138.12],
    [7, 78.8, 10, 118.68],
    [6, 123.96, 9, 204.88],
  ],
  12: [
    [3, 124.1, 8, 175.88],
    [2, 94.82, 5, 143.92],
    [1, 206.36, 9, 173.64],
    [6, 145.56, 10, 109.58],
    [4, 162.72, 7, 103.8],
  ],
  13: [
    [1, 125.46, 3, 168.6],
    [2, 158.7, 8, 195.56],
    [5, 144.82, 7, 128.94],
    [9, 122.24, 10, 153.9],
    [4, 125.6, 6, 103.44],
  ],
  14: [
    [2, 116.38, 3, 99.7],
    [1, 182.46, 5, 118.84],
    [6, 129.2, 8, 120.04],
    [4, 105.1, 10, 154.02],
    [7, 99.5, 9, 194.78],
  ],
};

function buildMatchups(): Map<number, SleeperMatchup[]> {
  const byWeek = new Map<number, SleeperMatchup[]>();
  for (const [weekStr, games] of Object.entries(SEASON_2025)) {
    const week = Number(weekStr);
    const rows: SleeperMatchup[] = [];
    games.forEach(([rA, pA, rB, pB], i) => {
      rows.push({ roster_id: rA, matchup_id: i + 1, points: pA });
      rows.push({ roster_id: rB, matchup_id: i + 1, points: pB });
    });
    byWeek.set(week, rows);
  }
  return byWeek;
}

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
