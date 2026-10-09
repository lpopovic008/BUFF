import test from "node:test";
import assert from "node:assert/strict";
import { GamePlay } from "./play-by-play";
import { findPlayer, labelNames, LinePlayer, linesForPlays, statLine } from "./play-lines";

function play(over: Partial<GamePlay>): GamePlay {
  return {
    id: "1",
    gameId: "g",
    sequence: 1,
    text: "",
    type: "Rush",
    period: 1,
    clock: "10:00",
    offense: "BUF",
    scoring: false,
    turnover: false,
    yards: 0,
    redZone: false,
    downDistance: null,
    at: null,
    ...over,
  };
}

const allen: LinePlayer = { playerId: "4984", name: "Josh Allen", position: "QB", team: "BUF" };
const kincaid: LinePlayer = { playerId: "10859", name: "Dalton Kincaid", position: "TE", team: "BUF" };
const bass: LinePlayer = { playerId: "5137", name: "Tyler Bass", position: "K", team: "BUF" };
const tua: LinePlayer = { playerId: "6768", name: "Tua Tagovailoa", position: "QB", team: "MIA" };
const hill: LinePlayer = { playerId: "3321", name: "Tyreek Hill", position: "WR", team: "MIA" };
const bernard: LinePlayer = { playerId: "9999", name: "Terrel Bernard", position: "LB", team: "BUF" };
const pool = [allen, kincaid, bass, tua, hill, bernard];

test("labelNames follows ESPN's shorthand", () => {
  assert.ok(labelNames("J.Allen", "Josh Allen"));
  assert.ok(labelNames("Jos.Allen", "Josh Allen"));
  assert.ok(!labelNames("Jos.Allen", "Jordan Allen"));
  assert.ok(labelNames("A.St. Brown", "Amon-Ra St. Brown"));
  assert.ok(labelNames("K.Walker", "Kenneth Walker III"));
  assert.ok(!labelNames("J.Allen", "Josh Allison"));
});

test("findPlayer looks only on the team given, likeliest first", () => {
  assert.equal(findPlayer("J.Allen", "BUF", pool), allen);
  assert.equal(findPlayer("J.Allen", "MIA", pool), null);
  const other: LinePlayer = { playerId: "1", name: "Josh Allen", position: "LB", team: "BUF" };
  assert.equal(findPlayer("J.Allen", "BUF", [allen, other]), allen);
});

test("linesForPlays gives everyone in a play a line, with running totals", () => {
  const plays = [
    play({ id: "a", sequence: 1, type: "Pass Reception", text: "J.Allen pass short left to D.Kincaid to BUF 33 for 8 yards (J.Phillips)." }),
    play({
      id: "b",
      sequence: 2,
      type: "Passing Touchdown",
      scoring: true,
      text: "J.Allen pass deep middle to D.Kincaid for 28 yards, TOUCHDOWN. T.Bass extra point is GOOD, Center-R.Ferguson, Holder-S.Martin.",
    }),
  ];
  const lines = linesForPlays(plays, ["BUF", "MIA"], pool);
  assert.deepEqual(
    lines.get("a")!.map((l) => [l.name, l.delta, l.total]),
    [
      ["Josh Allen", 0.32, 0.32],
      ["Dalton Kincaid", 1.8, 1.8],
    ]
  );
  assert.deepEqual(
    lines.get("b")!.map((l) => [l.name, l.delta, l.total]),
    [
      ["Josh Allen", 5.12, 5.44],
      ["Dalton Kincaid", 9.8, 11.6],
      ["Tyler Bass", 1, 1],
    ]
  );
});

test("linesForPlays lists a defender making a play, unscored, and the defense that scored", () => {
  const pick = play({
    offense: "MIA",
    type: "Pass Interception Return",
    turnover: true,
    text: "T.Tagovailoa pass deep right intended for T.Hill INTERCEPTED by T.Bernard at BUF 30. T.Bernard to BUF 41 for 11 yards.",
  });
  const lines = linesForPlays([pick], ["BUF", "MIA"], pool).get("1")!;
  assert.deepEqual(
    lines.map((l) => [l.name, l.position, l.delta]),
    [
      ["Tua Tagovailoa", "QB", -1],
      ["Tyreek Hill", "WR", 0],
      ["Terrel Bernard", "LB", null],
      ["BUF D/ST", "DEF", 2],
    ]
  );
});

test("linesForPlays keeps ESPN's name for someone it can't match", () => {
  const lines = linesForPlays([play({ text: "Z.Nobody up the middle for 3 yards." })], ["BUF", "MIA"], pool).get("1")!;
  assert.deepEqual(lines.map((l) => [l.playerId, l.name, l.delta]), [[null, "Z.Nobody", 0.3]]);
});

test("statLine leads with the player's main job", () => {
  assert.equal(statLine("QB", { pass_cmp: 18, pass_att: 26, pass_yd: 214, pass_td: 2, rush_att: 4, rush_yd: 22 }), "18/26 214 YDS 2 TD · 4 CAR 22 YDS");
  assert.equal(statLine("WR", { rec: 5, rec_yd: 63, rec_td: 1, rush_att: 1, rush_yd: 7 }), "5 REC 63 YDS 1 TD · 1 CAR 7 YDS");
  assert.equal(statLine("RB", { rush_att: 9, rush_yd: 41, rec: 2, rec_yd: 11 }), "9 CAR 41 YDS · 2 REC 11 YDS");
  assert.equal(statLine("K", { fgm: 2, fga: 2, xpm: 3, xpa: 3 }), "FG 2/2 · XP 3/3");
  assert.equal(statLine("DEF", { sack: 3, int: 1, pts_allow: 17 }), "3 SCK · 1 INT · 17 PA");
  assert.equal(statLine("WR", {}), "");
  assert.equal(statLine("WR", undefined), "");
});

test("linesForPlays doesn't score an unmatched defender", () => {
  const pick = play({
    offense: "MIA",
    turnover: true,
    type: "Pass Interception Return",
    text: "T.Tagovailoa pass deep right intended for T.Hill INTERCEPTED by Z.Nobody at BUF 30. Z.Nobody to BUF 41 for 11 yards.",
  });
  const lines = linesForPlays([pick], ["BUF", "MIA"], pool).get("1")!;
  assert.deepEqual(lines.find((l) => l.name === "Z.Nobody")?.delta, null);
});
