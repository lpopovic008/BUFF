import test from "node:test";
import assert from "node:assert/strict";
import {
  formatGameHeader,
  formatKickoff,
  formatTeamMatchup,
  finishedBlocksLast,
  groupGamesByTimeBlock,
  groupStartersByGame,
  GroupedStarter,
  liveGameRows,
  startersListGames,
  LivePlayerLine,
  StarterEntry,
} from "./my-starters";
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
  return { playerId: name, name, position, team, leagueId, leagueName: `League ${leagueId}`, points: null };
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

test("the game header names the away team first, standard away-@-home notation", () => {
  // SF are the nominal away side of the Melbourne opener.
  assert.match(formatGameHeader(MELBOURNE, NOW), /^SF @ LAR — /);
});

test("the team matchup half names the away team first and carries no kickoff", () => {
  assert.equal(formatTeamMatchup(MELBOURNE), "SF @ LAR");
});

test("games are bucketed into one column per kickoff window, earliest first", () => {
  const wedNight = game("wed", "SF", "LAR", "2026-09-09T23:00:00");
  const sunNoonA = game("sun-a", "TB", "CIN", "2026-09-13T13:00:00");
  const sunNoonB = game("sun-b", "DAL", "NYG", "2026-09-13T13:00:00"); // same window as sunNoonA
  const monNight = game("mon", "PHI", "GB", "2026-09-14T20:15:00");

  const { games } = groupStartersByGame(
    [
      starter("A", "QB", "LAR"),
      starter("B", "WR", "CIN"),
      starter("C", "RB", "NYG"),
      starter("D", "TE", "GB"),
    ],
    [wedNight, sunNoonA, sunNoonB, monNight]
  );

  const columns = groupGamesByTimeBlock(games);
  assert.deepEqual(
    columns.map((c) => c.games.map((g) => g.game.id)),
    [["wed"], ["sun-a", "sun-b"], ["mon"]]
  );
  assert.deepEqual(
    columns.map((c) => c.label),
    ["Wednesday Night", "Sunday Noon", "Monday Night"]
  );
});

test("a game with an unparseable kickoff still shows up, in a trailing TBD column", () => {
  const good = game("good", "SF", "LAR", "2026-09-13T13:00:00");
  const bad = game("bad", "TB", "CIN", "not a date");
  const { games } = groupStartersByGame(
    [starter("A", "QB", "LAR"), starter("B", "WR", "CIN")],
    [good, bad]
  );

  const columns = groupGamesByTimeBlock(games);
  assert.equal(columns.at(-1)!.label, "TBD");
  assert.deepEqual(columns.at(-1)!.games.map((g) => g.game.id), ["bad"]);
});

test("finished time blocks move to the bottom, the rest keep kickoff order", () => {
  const wed = { ...game("wed", "DAL", "NYG", "2026-09-10T00:20:00Z"), state: "post" as const };
  const sunA = { ...game("sun-a", "SF", "LAR", "2026-09-13T17:00:00Z"), state: "post" as const };
  const sunB = { ...game("sun-b", "TB", "CIN", "2026-09-13T17:00:00Z"), state: "in" as const };
  const mon = game("mon", "KC", "BUF", "2026-09-15T00:15:00Z");
  const { games } = groupStartersByGame(
    [starter("A", "QB", "NYG"), starter("B", "WR", "LAR"), starter("C", "RB", "CIN"), starter("D", "TE", "BUF")],
    [wed, sunA, sunB, mon]
  );
  // Sunday is still on (one game live), so only Wednesday night has finished.
  const order = finishedBlocksLast(groupGamesByTimeBlock(games)).map((c) => c.games.map((g) => g.game.id).join("+"));
  assert.deepEqual(order, ["sun-a+sun-b", "mon", "wed"]);
});

function grouped(playerId: string, points: number | null): GroupedStarter {
  return { playerId, name: playerId, position: "WR", team: "BUF", leagueIds: ["L1"], points, pointsByLeague: { L1: points } };
}

function line(playerId: string, team: string, points: number, projected: number | null): LivePlayerLine {
  return { playerId, name: playerId, position: "RB", team, points, projected };
}

test("liveGameRows lists your starters, the ones you face, and anyone in the game who scored or is projected 6+", () => {
  const g = { ...game("g1", "BUF", "MIA", "2026-10-11T17:00:00Z"), state: "in" as const };
  const rows = liveGameRows(
    g,
    [grouped("Mine", 4)],
    [grouped("Theirs", 9), grouped("Mine", 4)],
    [
      line("Scorer", "MIA", 12, 3),
      line("Negative", "BUF", -1, null), // lost points still count
      line("Projected", "MIA", 0, 8), // hasn't scored yet, but projected 8
      line("Quiet", "MIA", 0, 4), // neither — left out
      line("Elsewhere", "KC", 20, 15), // a different game
      line("Theirs", "BUF", 9, 10), // already listed as an opponent's
    ],
    { Mine: 11, Theirs: 10, Scorer: 3, Projected: 8 }
  );
  assert.deepEqual(
    rows.map((r) => [r.playerId, r.side]),
    [
      ["Scorer", "other"],
      ["Theirs", "opponent"],
      ["Mine", "mine"],
      ["Projected", "other"],
      ["Negative", "other"],
    ]
  );
});

test("liveGameRows orders by projection alone before kickoff", () => {
  const g = game("g1", "BUF", "MIA", "2026-10-11T17:00:00Z");
  // Points carried in before kickoff (stale or provisional) don't count yet.
  const rows = liveGameRows(g, [grouped("Mine", 9)], [], [line("Big", "MIA", 0, 20)], { Mine: 11, Big: 20 });
  assert.deepEqual(rows.map((r) => r.playerId), ["Big", "Mine"]);
});

test("liveGameRows breaks ties in points by projection", () => {
  const g = game("g1", "BUF", "MIA", "2026-10-11T17:00:00Z");
  const rows = liveGameRows(g, [], [], [line("Low", "MIA", 0, 6.5), line("High", "BUF", 0, 14)], { Low: 6.5, High: 14 });
  assert.deepEqual(rows.map((r) => r.playerId), ["High", "Low"]);
});

test("startersListGames adds points Sleeper hasn't counted yet before sorting, unless Sleeper's number has since moved", () => {
  const g = { ...game("g1", "BUF", "MIA", "2026-10-11T17:00:00Z"), state: "in" as const };
  const listed = startersListGames([g], [{ game: g, players: [grouped("Mine", 4)] }], [], [line("Other", "MIA", 6, null)], {}, { Mine: { points: 6, basis: 4 }, Other: { points: 3, basis: 5 } });
  assert.equal(listed[0].live, true);
  assert.deepEqual(
    listed[0].everyone!.map((p) => [p.playerId, p.points, p.pointsByLeague.L1 ?? null]),
    [
      ["Mine", 10, 10],
      ["Other", 6, null],
    ]
  );
});

test("startersListGames lists every game of the week in kickoff order, even ones none of your players are in", () => {
  const late = game("late", "KC", "LV", "2026-10-11T20:25:00Z");
  const early = game("early", "BUF", "MIA", "2026-10-11T17:00:00Z");
  const listed = startersListGames([late, early], [{ game: early, players: [grouped("Mine", 4)] }], [], [], {});
  assert.deepEqual(
    listed.map((g) => [g.game.id, g.players.map((p) => p.playerId)]),
    [
      ["early", ["Mine"]],
      ["late", []],
    ]
  );
});

test("startersListGames shows only your starters by default, and everyone worth watching once a game is opened", () => {
  const g = game("g1", "BUF", "MIA", "2026-10-11T17:00:00Z");
  const listed = startersListGames(
    [g],
    [{ game: g, players: [grouped("Mine", null)] }],
    [{ game: g, players: [grouped("Theirs", null)] }],
    [line("Projected", "MIA", 0, 9), line("Quiet", "MIA", 0, 2)],
    { Mine: 12.4, Theirs: 15, Projected: 9, Quiet: 2 }
  );
  assert.deepEqual(listed[0].players.map((p) => [p.playerId, p.projected]), [["Mine", 12.4]]);
  // Before kickoff, ordered by projection.
  assert.deepEqual(
    listed[0].everyone!.map((p) => [p.playerId, p.side, p.projected]),
    [
      ["Theirs", "opponent", 15],
      ["Mine", "mine", 12.4],
      ["Projected", "other", 9],
    ]
  );
  assert.equal(listed[0].live, false);
});
