import test from "node:test";
import assert from "node:assert/strict";
import { Game, LeagueWeek, lineupNotes, Play, Player, playersIn, resultNotes, scoringNotes, tradeNotes } from "../../supabase/functions/notify/logic";

const allen: Player = { id: "4984", name: "Josh Allen", position: "QB", team: "BUF" };
const kincaid: Player = { id: "9999", name: "Dalton Kincaid", position: "TE", team: "BUF" };
const kcDef: Player = { id: "KC", name: "Kansas City Chiefs", position: "DEF", team: "KC" };
const NOW = Date.UTC(2026, 10, 22, 20);

const play = (over: Partial<Play>): Play => ({ id: "p1", gameId: "g1", text: "", type: "", offense: "BUF", scoring: false, turnover: false, at: NOW - 60_000, ...over });

test("a play's players: by ESPN's shorthand on the team with the ball; a defense on the other team's turnovers", () => {
  const td = play({ text: "J.Allen pass short middle to D.Kincaid for 12 yards, TOUCHDOWN.", scoring: true, type: "Passing Touchdown" });
  assert.deepEqual(playersIn(td, [allen, kincaid, kcDef]).map((p) => p.id), ["4984", "9999"]);
  const pick = play({ text: "J.Allen pass deep right INTERCEPTED by T.McDuffie at KC 20.", turnover: true, type: "Pass Interception Return" });
  assert.deepEqual(playersIn(pick, [allen, kcDef]).map((p) => p.id), ["4984", "KC"]);
  // Named only as a tackler, in parentheses: not his play.
  assert.deepEqual(playersIn(play({ offense: "KC", text: "P.Mahomes pass to T.Kelce for 5 yards (J.Allen)." }), [allen]), []);
});

test("scoring: a touchdown by your starter, once per play and player, naming his leagues; old plays left out", () => {
  const starters = new Map([[allen.id, { player: allen, leagues: ["Alpha", "Beta"] }]]);
  const plays = [
    play({ id: "p1", text: "J.Allen 5 yard rush up the middle, TOUCHDOWN.", scoring: true, type: "Rushing Touchdown" }),
    play({ id: "p0", text: "J.Allen 3 yard rush, TOUCHDOWN.", scoring: true, at: NOW - 60 * 60_000 }),
    play({ id: "p2", text: "J.Allen pass short left to K.Coleman for 8 yards." }),
  ];
  const notes = scoringNotes(plays, starters, NOW);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].key, "play:p1:4984");
  assert.equal(notes[0].title, "Josh Allen — Touchdown!");
  assert.match(notes[0].body, /Alpha and Beta$/);
});

const league = (over: Partial<LeagueWeek>): LeagueWeek => ({
  leagueId: "L1",
  name: "Alpha",
  week: 12,
  myRosterId: 1,
  teams: { 1: "Mine", 2: "Rivals" },
  starters: [],
  matchups: [
    { rosterId: 1, matchupId: 1, points: 110.5 },
    { rosterId: 2, matchupId: 1, points: 100 },
  ],
  trades: [],
  ...over,
});
const game = (over: Partial<Game>): Game => ({ id: "g1", home: "BUF", away: "KC", state: "pre", kickoff: NOW + 24 * 3_600_000, ...over });

test("lineup: out, on a bye, an empty spot; questionable only near kickoff; nothing once his game's on", () => {
  const players = new Map<string, Player>([
    ["a", { id: "a", name: "Out Guy", position: "WR", team: "BUF", injury: "Out" }],
    ["b", { id: "b", name: "Bye Guy", position: "RB", team: "MIA" }],
    ["c", { id: "c", name: "Q Guy", position: "TE", team: "KC", injury: "Questionable" }],
  ]);
  const notes = lineupNotes(league({ starters: ["a", "b", "c", "0"] }), players, [game({})], NOW);
  assert.deepEqual(notes.map((n) => n.title), ["Alpha: Out Guy is Out", "Alpha: Bye Guy is on a bye", "Alpha: an empty spot"]);
  // Two hours before kickoff, the questionable one too.
  const soon = lineupNotes(league({ starters: ["c"] }), players, [game({ kickoff: NOW + 2 * 3_600_000 })], NOW);
  assert.deepEqual(soon.map((n) => n.title), ["Alpha: Q Guy is questionable"]);
  // His game under way: too late to say.
  assert.deepEqual(lineupNotes(league({ starters: ["a"] }), players, [game({ state: "in" })], NOW), []);
});

test("results: final once every game's over; a heads-up when it's close with only the last day's games left", () => {
  const sunday = Date.UTC(2026, 10, 22, 18);
  const monday = Date.UTC(2026, 10, 24, 1, 15);
  const final = resultNotes(league({}), [game({ state: "post", kickoff: sunday }), game({ id: "g2", state: "post", kickoff: monday })]);
  assert.deepEqual(final.map((n) => n.title), ["Alpha: Won 110.5–100"]);
  const close = resultNotes(league({}), [game({ state: "post", kickoff: sunday }), game({ id: "g2", state: "pre", kickoff: monday })]);
  assert.equal(close[0]?.key, "close:L1:12");
  assert.match(close[0].body, /up 10.5 on Rivals/);
  // Sunday's games still on: too soon.
  assert.deepEqual(resultNotes(league({}), [game({ state: "in", kickoff: sunday }), game({ id: "g2", kickoff: monday })]), []);
});

test("trades: who got whom, picks included, only the last two days'", () => {
  const players = new Map<string, Player>([["4984", allen]]);
  const notes = tradeNotes(
    league({
      trades: [
        { id: "t1", created: NOW - 3_600_000, rosterIds: [1, 2], adds: { "4984": 2 }, picks: [{ season: "2027", round: 1, ownerId: 1 }] },
        { id: "t0", created: NOW - 5 * 24 * 3_600_000, rosterIds: [1, 2], adds: {}, picks: [] },
      ],
    }),
    players,
    NOW
  );
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body, "Mine get a 2027 round 1 pick · Rivals get Josh Allen");
});
