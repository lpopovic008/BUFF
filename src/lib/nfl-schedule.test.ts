import test from "node:test";
import assert from "node:assert/strict";
import { parseScoreboard } from "./nfl-schedule";

function competitor(homeAway: "home" | "away", abbreviation: string, score: string) {
  return { homeAway, team: { abbreviation }, score };
}

test("parseScoreboard reads a normal pre-game event", () => {
  const games = parseScoreboard({
    events: [
      {
        id: 401671000,
        date: "2026-09-13T17:00Z",
        competitions: [
          {
            date: "2026-09-13T17:00Z",
            competitors: [competitor("home", "BUF", "0"), competitor("away", "NYJ", "0")],
            status: { type: { state: "pre" } },
          },
        ],
      },
    ],
  });
  assert.equal(games.length, 1);
  assert.deepEqual(games[0], {
    id: "401671000",
    homeTeam: "BUF",
    awayTeam: "NYJ",
    kickoff: "2026-09-13T17:00Z",
    state: "pre",
    homeScore: 0,
    awayScore: 0,
  });
});

test("parseScoreboard reads live and final scores", () => {
  const games = parseScoreboard({
    events: [
      {
        id: 1,
        competitions: [
          {
            date: "2026-09-13T17:00Z",
            competitors: [competitor("home", "KC", "24"), competitor("away", "DEN", "17")],
            status: { type: { state: "in" } },
          },
        ],
      },
      {
        id: 2,
        competitions: [
          {
            date: "2026-09-13T20:00Z",
            competitors: [competitor("home", "SF", "31"), competitor("away", "SEA", "20")],
            status: { type: { state: "post" } },
          },
        ],
      },
    ],
  });
  assert.equal(games[0].state, "in");
  assert.equal(games[0].homeScore, 24);
  assert.equal(games[1].state, "post");
  assert.equal(games[1].awayScore, 20);
});

test("parseScoreboard normalizes ESPN's WSH to Sleeper's WAS", () => {
  const games = parseScoreboard({
    events: [
      {
        id: 1,
        competitions: [
          {
            date: "2026-09-13T17:00Z",
            competitors: [competitor("home", "WSH", "0"), competitor("away", "DAL", "0")],
            status: { type: { state: "pre" } },
          },
        ],
      },
    ],
  });
  assert.equal(games[0].homeTeam, "WAS");
});

test("parseScoreboard tolerates missing/malformed fields instead of throwing", () => {
  assert.deepEqual(parseScoreboard(null), []);
  assert.deepEqual(parseScoreboard({}), []);
  assert.deepEqual(parseScoreboard({ events: "not an array" }), []);
  assert.deepEqual(parseScoreboard({ events: [{ competitions: [] }] }), []);
  assert.deepEqual(parseScoreboard({ events: [{ competitions: [{ competitors: [competitor("home", "BUF", "0")] }] }] }), []);
});
