import test from "node:test";
import assert from "node:assert/strict";
import { formatGameHeader, formatKickoff, groupStartersByGame, StarterEntry } from "./my-starters";
import { NFLGame } from "./nfl-schedule";

function game(id: string, away: string, home: string, kickoff: string): NFLGame {
  return {
    id,
    homeTeam: home,
    awayTeam: away,
    kickoff,
    state: "pre",
    homeScore: 0,
    awayScore: 0,
    venue: null,
    neutralSite: false,
  };
}

function starter(name: string, position: string, team: string | null, leagueId = "L1"): StarterEntry {
  return { playerId: name, name, position, team, leagueId, leagueName: `League ${leagueId}` };
}

// Real 2026 week 1 slots: the Melbourne opener and a Sunday afternoon game.
const MELBOURNE = game("1", "SF", "LAR", "2026-09-11T00:35Z");
const SUNDAY = game("2", "TB", "CIN", "2026-09-13T17:00Z");

test("starters land in the game their NFL team is playing, whichever side", () => {
  const { games } = groupStartersByGame(
    [starter("Rams RB", "RB", "LAR"), starter("Niners WR", "WR", "SF")],
    [MELBOURNE, SUNDAY]
  );
  assert.equal(games.length, 1);
  assert.equal(games[0].game.id, "1");
  assert.deepEqual(games[0].players.map((p) => p.name), ["Rams RB", "Niners WR"]);
});

test("games with none of your players are left out entirely", () => {
  const { games } = groupStartersByGame([starter("Rams RB", "RB", "LAR")], [MELBOURNE, SUNDAY]);
  assert.deepEqual(games.map((g) => g.game.id), ["1"]);
});

test("games come back in kickoff order", () => {
  const { games } = groupStartersByGame(
    [starter("Bengal", "WR", "CIN"), starter("Ram", "RB", "LAR")],
    [SUNDAY, MELBOURNE] // deliberately out of order
  );
  assert.deepEqual(games.map((g) => g.game.id), ["1", "2"]);
});

test("players within a game are ordered by position, then name", () => {
  const { games } = groupStartersByGame(
    [
      starter("Zeta TE", "TE", "LAR"),
      starter("Alpha WR", "WR", "SF"),
      starter("Beta QB", "QB", "LAR"),
      starter("Alpha RB", "RB", "SF"),
    ],
    [MELBOURNE]
  );
  assert.deepEqual(games[0].players.map((p) => p.name), ["Beta QB", "Alpha RB", "Alpha WR", "Zeta TE"]);
});

test("a player on bye is handed back separately, never dropped", () => {
  const { games, notPlaying } = groupStartersByGame(
    [starter("Ram", "RB", "LAR"), starter("Bye Guy", "WR", "BUF"), starter("Empty Slot", "WR", null)],
    [MELBOURNE]
  );
  assert.equal(games[0].players.length, 1);
  assert.deepEqual(notPlaying.map((p) => p.name), ["Bye Guy", "Empty Slot"]);
});

test("the same player started in two leagues shows up once, with both leagues listed", () => {
  const { games } = groupStartersByGame(
    [starter("Puka", "WR", "LAR", "L1"), starter("Puka", "WR", "LAR", "L2")],
    [MELBOURNE]
  );
  assert.equal(games[0].players.length, 1);
  assert.deepEqual(games[0].players[0].leagueIds, ["L1", "L2"]);
});

const NOW = new Date("2026-09-08T12:00:00Z");

test("a kickoff inside the next week is labeled by weekday", () => {
  const label = formatKickoff("2026-09-11T00:35Z", NOW);
  assert.match(label, /Thu|Wed|Fri/); // weekday name, not a date
  assert.doesNotMatch(label, /\d+\/\d+/);
});

test("a kickoff more than a week out is labeled by date instead", () => {
  const label = formatKickoff("2026-10-11T17:00Z", NOW);
  assert.match(label, /\d+\/\d+/);
});

test("an unparseable kickoff degrades to TBD rather than Invalid Date", () => {
  assert.equal(formatKickoff("", NOW), "TBD");
  assert.equal(formatKickoff("not a date", NOW), "TBD");
});

test("the game header names the away team first", () => {
  // SF are the nominal away side of the Melbourne opener.
  assert.match(formatGameHeader(MELBOURNE, NOW), /^SF vs LAR @ /);
});
