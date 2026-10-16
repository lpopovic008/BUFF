import test from "node:test";
import assert from "node:assert/strict";
import { gameClock, isOutsideUS, parseScoreboard } from "./nfl-schedule";

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
    venue: null,
    neutralSite: false,
    statusDetail: null,
    live: null,
  });
});

test("parseScoreboard reads the venue and neutral-site flag", () => {
  // The real 2026 week 1 opener, played in Melbourne.
  const games = parseScoreboard({
    events: [
      {
        id: 1,
        competitions: [
          {
            date: "2026-09-11T00:35Z",
            competitors: [competitor("home", "LAR", "0"), competitor("away", "SF", "0")],
            status: { type: { state: "pre" } },
            neutralSite: true,
            venue: {
              fullName: "Melbourne Cricket Ground",
              address: { city: "Melbourne", state: "VIC", country: "Australia" },
            },
          },
        ],
      },
    ],
  });
  assert.deepEqual(games[0].venue, {
    name: "Melbourne Cricket Ground",
    city: "Melbourne",
    state: "VIC",
    country: "Australia",
  });
  assert.equal(games[0].neutralSite, true);
  assert.equal(isOutsideUS(games[0]), true);
});

test("a game in the US is not flagged as outside it, neutral site or not", () => {
  const games = parseScoreboard({
    events: [
      {
        id: 1,
        competitions: [
          {
            date: "2026-09-13T17:00Z",
            competitors: [competitor("home", "CIN", "0"), competitor("away", "TB", "0")],
            status: { type: { state: "pre" } },
            venue: { fullName: "Paycor Stadium", address: { city: "Cincinnati", state: "OH", country: "USA" } },
          },
        ],
      },
    ],
  });
  assert.equal(isOutsideUS(games[0]), false);
});

test("a game with no venue data is assumed domestic rather than dropped off the map", () => {
  const games = parseScoreboard({
    events: [
      {
        id: 1,
        competitions: [
          {
            date: "2026-09-13T17:00Z",
            competitors: [competitor("home", "CIN", "0"), competitor("away", "TB", "0")],
            status: { type: { state: "pre" } },
          },
        ],
      },
    ],
  });
  assert.equal(games[0].venue, null);
  assert.equal(isOutsideUS(games[0]), false);
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

test("parseScoreboard reads each team's record as of the game", () => {
  // Week 1, once it's final: every team 1-0 or 0-1.
  const games = parseScoreboard({
    events: [
      {
        id: 1,
        competitions: [
          {
            competitors: [
              { ...competitor("home", "SEA", "13"), records: [{ type: "total", summary: "1-0" }, { type: "home", summary: "1-0" }] },
              { ...competitor("away", "NE", "10"), records: [{ type: "road", summary: "0-1" }, { type: "total", summary: "0-1" }] },
            ],
            status: { type: { state: "post" } },
          },
        ],
      },
      { id: 2, competitions: [{ competitors: [competitor("home", "BUF", "0"), competitor("away", "NYJ", "0")], status: { type: { state: "pre" } } }] },
    ],
  });
  assert.deepEqual([games[0].homeRecord, games[0].awayRecord], ["1-0", "0-1"]);
  // None given, none made up.
  assert.deepEqual([games[1].homeRecord, games[1].awayRecord], [undefined, undefined]);
});

test("gameClock writes a game's clock quarter first", () => {
  assert.equal(gameClock("12:43 - 2nd"), "2Q 12:43");
  assert.equal(gameClock("0:07 - 4th"), "4Q 0:07");
  assert.equal(gameClock("5:00 - OT"), "OT 5:00");
  assert.equal(gameClock("End of 3rd Quarter"), "End 3Q");
  assert.equal(gameClock("Halftime"), "Half");
  assert.equal(gameClock("Delayed"), "Delayed");
});
