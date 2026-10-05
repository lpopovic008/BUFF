import test from "node:test";
import assert from "node:assert/strict";
import { LIVE_INTERVAL_MS, liveModeFor, nextTickDelay, scoresChanged } from "./live-clock";
import { NFLGame } from "./nfl-schedule";

const NOW = Date.parse("2026-10-04T16:00:00Z");

function game(over: Partial<NFLGame>): NFLGame {
  return {
    id: "1",
    homeTeam: "BUF",
    awayTeam: "MIA",
    kickoff: "2026-10-04T17:00:00Z",
    state: "pre",
    homeScore: 0,
    awayScore: 0,
    venue: null,
    neutralSite: false,
    ...over,
  };
}

test("liveModeFor: any game in progress is live", () => {
  assert.equal(liveModeFor([game({}), game({ id: "2", state: "in" })], NOW), "live");
});

test("liveModeFor: a kickoff within half an hour, or one running late, is soon", () => {
  assert.equal(liveModeFor([game({ kickoff: "2026-10-04T16:20:00Z" })], NOW), "soon");
  assert.equal(liveModeFor([game({ kickoff: "2026-10-04T15:55:00Z" })], NOW), "soon");
});

test("liveModeFor: later kickoffs and finished games are idle", () => {
  assert.equal(liveModeFor([game({}), game({ id: "2", state: "post" })], NOW), "idle");
  assert.equal(liveModeFor([], NOW), "idle");
});

test("nextTickDelay follows the mode, waking an idle clock for the next kickoff window", () => {
  assert.equal(nextTickDelay([game({ state: "in" })], NOW), LIVE_INTERVAL_MS.live);
  // Kickoff in 40 min: the soon window opens in 10, so the 5-minute idle pace comes first.
  assert.equal(nextTickDelay([game({ kickoff: "2026-10-04T16:40:00Z" })], NOW), LIVE_INTERVAL_MS.idle);
  // Kickoff in 32 min: the soon window opens in 2.
  assert.equal(nextTickDelay([game({ kickoff: "2026-10-04T16:32:00Z" })], NOW), 2 * 60_000);
});

test("scoresChanged only counts games present in both reads", () => {
  const a = [game({}), game({ id: "2" })];
  assert.equal(scoresChanged(a, [game({ homeScore: 7 }), game({ id: "2" })]), true);
  assert.equal(scoresChanged(a, [game({}), game({ id: "3", awayScore: 3 })]), false);
});
