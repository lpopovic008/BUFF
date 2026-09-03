import test from "node:test";
import assert from "node:assert/strict";
import { projectFromProps, projectLineupFromProps } from "./fantasy-points-from-props";
import { PlayerPropsSnapshot } from "./player-props";

const snapshot: PlayerPropsSnapshot = {
  updatedAt: "2026-09-03T00:00:00Z",
  source: "the-odds-api",
  bookmakersRequested: ["pinnacle", "betonlineag"],
  week: null,
  season: null,
  players: [
    {
      name: "Josh Allen",
      homeTeam: "Buffalo Bills",
      awayTeam: "Houston Texans",
      kickoff: "2026-09-13T17:00:00Z",
      props: [
        { market: "player_pass_yds", point: 249.5, overOdds: -112, underOdds: -112, bookmaker: "pinnacle" },
        { market: "player_pass_tds", point: 1.5, overOdds: 104, underOdds: -138, bookmaker: "pinnacle" },
        { market: "player_rush_yds", point: 35.5, overOdds: -110, underOdds: -110, bookmaker: "pinnacle" },
      ],
    },
    {
      name: "A.J. Brown",
      homeTeam: "Buffalo Bills",
      awayTeam: "Houston Texans",
      kickoff: "2026-09-13T17:00:00Z",
      props: [
        { market: "player_reception_yds", point: 60.5, overOdds: -121, underOdds: -109, bookmaker: "pinnacle" },
        { market: "player_anytime_td", point: null, overOdds: 150, underOdds: null, bookmaker: "betonlineag" },
      ],
    },
  ],
};

const ppr: Record<string, number> = { pass_yd: 0.04, pass_td: 4, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6 };

test("projectFromProps sums each matched market's line under the league's own scoring weights", () => {
  const result = projectFromProps("Josh Allen", snapshot, ppr);
  assert.equal(result.matched, true);
  assert.equal(result.lines.length, 3);
  const passYds = result.lines.find((l) => l.market === "player_pass_yds")!;
  assert.equal(passYds.fantasyPoints, 249.5 * 0.04);
  const passTds = result.lines.find((l) => l.market === "player_pass_tds")!;
  assert.equal(passTds.fantasyPoints, 1.5 * 4);
  const expectedTotal = 249.5 * 0.04 + 1.5 * 4 + 35.5 * 0.1;
  assert.ok(Math.abs(result.totalFantasyPoints - expectedTotal) < 1e-9);
});

test("projectFromProps carries odds and bookmaker through unchanged", () => {
  const result = projectFromProps("A.J. Brown", snapshot, ppr);
  const recYds = result.lines[0];
  assert.equal(recYds.overOdds, -121);
  assert.equal(recYds.underOdds, -109);
  assert.equal(recYds.bookmaker, "pinnacle");
});

test("projectFromProps normalizes names so punctuation/case differences still match", () => {
  const result = projectFromProps("aj brown", snapshot, ppr);
  assert.equal(result.matched, true);
  assert.equal(result.name, "A.J. Brown");
});

test("projectFromProps returns an unmatched, zero-point result for a player with no prop lines", () => {
  const result = projectFromProps("Some Kicker", snapshot, ppr);
  assert.equal(result.matched, false);
  assert.equal(result.lines.length, 0);
  assert.equal(result.totalFantasyPoints, 0);
});

test("a market absent from the league's scoring settings contributes 0, not NaN", () => {
  const result = projectFromProps("Josh Allen", snapshot, {}); // no scoring settings at all
  assert.equal(result.totalFantasyPoints, 0);
  assert.ok(result.lines.every((l) => l.fantasyPoints === 0));
});

test("projectFromProps converts anytime-TD odds to an implied probability weighted by the league's TD value", () => {
  const result = projectFromProps("A.J. Brown", snapshot, ppr);
  const anytimeTd = result.lines.find((l) => l.market === "player_anytime_td")!;
  assert.equal(anytimeTd.point, null); // no line for this market, only a "Yes" price
  // American +150 -> implied probability 100/(150+100) = 40%.
  assert.ok(anytimeTd.impliedProbabilityPct !== null);
  assert.ok(Math.abs(anytimeTd.impliedProbabilityPct! - 40) < 1e-9);
  // rush_td and rec_td are both 6 in `ppr`, so the average TD weight is 6.
  assert.ok(Math.abs(anytimeTd.fantasyPoints - 0.4 * 6) < 1e-9);
});

test("projectFromProps averages rush_td/rec_td for anytime-TD when they differ", () => {
  const lopsided = { ...ppr, rush_td: 6, rec_td: 4 };
  const result = projectFromProps("A.J. Brown", snapshot, lopsided);
  const anytimeTd = result.lines.find((l) => l.market === "player_anytime_td")!;
  assert.ok(Math.abs(anytimeTd.fantasyPoints - 0.4 * 5) < 1e-9); // average of 6 and 4
});

test("projectLineupFromProps sums every starter's props into one lineup total, skipping empty slots", () => {
  const lineup = [
    { slot: "QB", playerId: "1", name: "Josh Allen" },
    { slot: "WR", playerId: "2", name: "A.J. Brown" },
    { slot: "BN", playerId: "", name: "Empty" }, // empty slot — no playerId
  ];
  const { players, totalFantasyPoints } = projectLineupFromProps(lineup, snapshot, ppr);
  assert.equal(players.length, 2); // empty slot filtered out
  const expected = players.reduce((sum, p) => sum + p.totalFantasyPoints, 0);
  assert.ok(Math.abs(totalFantasyPoints - expected) < 1e-9);
  assert.ok(totalFantasyPoints > 0);
});
