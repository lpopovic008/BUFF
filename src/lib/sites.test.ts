import test from "node:test";
import assert from "node:assert/strict";
import { parseSiteDraftId, parseSiteLeagueId, siteDraftId, siteLeagueId, siteOf, sleeperTeam } from "./sites/ids";
import { nflWeekAt } from "./sites/fetch";
import { orderStarters, rosterPositions } from "./sites/shape";
import { setTestPlayers } from "./sites/player-map";
import { espn, espnScoring } from "./sites/espn";
import { mfl } from "./sites/mfl";
import { fleaflicker } from "./sites/fleaflicker";
import { itemsOf, merged } from "./sites/yahoo";
import { siteAnswer } from "./sites";

// Sleeper's players, as far as these tests need them: each with the ids other sites know him by.
setTestPlayers({
  "4984": { full_name: "Josh Allen", position: "QB", team: "BUF", espn_id: 3918298, yahoo_id: 30977 },
  "6794": { full_name: "Justin Jefferson", position: "WR", team: "MIN", espn_id: 4262921, yahoo_id: 32692 },
  "4866": { full_name: "Saquon Barkley", position: "RB", team: "PHI", espn_id: 3929630, yahoo_id: 30972 },
  "4217": { full_name: "George Kittle", position: "TE", team: "SF", espn_id: 3040151, yahoo_id: 30259 },
});

/** Answers fetches by the first of `routes` whose text is in the URL. */
function serve(routes: [string, unknown][]) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const hit = routes.find(([part]) => url.includes(part));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

test("a league on another site has an id saying which site, season and league; Sleeper's are its own", () => {
  const id = siteLeagueId({ site: "yahoo", season: "2025", id: "449.l.12345" });
  assert.equal(id, "yahoo-2025-449.l.12345");
  assert.deepEqual(parseSiteLeagueId(id), { site: "yahoo", season: "2025", id: "449.l.12345" });
  assert.equal(parseSiteLeagueId("1180120456789012345"), null);
  assert.equal(siteOf("1180120456789012345"), "sleeper");
  assert.deepEqual(parseSiteDraftId(siteDraftId("espn-2025-77")), { site: "espn", season: "2025", id: "77" });
  assert.equal(sleeperTeam("KCC"), "KC");
  assert.equal(sleeperTeam("WSH"), "WAS");
});

test("a week's found from a date: weeks run from the Wednesday before the season's first game", () => {
  // 2025: Labor Day's September 1st, the first game Thursday the 4th.
  assert.equal(nflWeekAt(Date.UTC(2025, 7, 20), "2025"), 1);
  assert.equal(nflWeekAt(Date.UTC(2025, 8, 7, 18), "2025"), 1);
  assert.equal(nflWeekAt(Date.UTC(2025, 8, 14, 18), "2025"), 2);
  assert.equal(nflWeekAt(Date.UTC(2025, 9, 26, 18), "2025"), 8);
});

test("starters are laid into the league's slots in Sleeper's order, an empty slot '0'", () => {
  const positions = rosterPositions({ RB: 2, QB: 1, FLEX: 1, WR: 2 }, 3);
  assert.deepEqual(positions, ["QB", "RB", "RB", "WR", "WR", "FLEX", "BN", "BN", "BN"]);
  const starters = orderStarters(positions, [
    { id: "w1", slot: "WR" },
    { id: "f", slot: "FLEX" },
    { id: "q", slot: "QB" },
    { id: "r1", slot: "RB" },
    { id: "w2", slot: "WR" },
  ]);
  assert.deepEqual(starters, ["q", "r1", "0", "w1", "w2", "f"]);
});

test("ESPN's scoring in Sleeper's terms, a tight end's premium as Sleeper's bonus", () => {
  const s = espnScoring([
    { statId: 3, points: 0.04 },
    { statId: 53, points: 1, pointsOverrides: { "6": 1.5 } },
    { statId: 80, points: 3 },
  ]);
  assert.equal(s.pass_yd, 0.04);
  assert.equal(s.rec, 1);
  assert.equal(s.bonus_rec_te, 0.5);
  assert.equal(s.fgm_30_39, 3);
});

const espnInfo = {
  seasonId: 2025,
  settings: {
    name: "Gridiron Guys",
    size: 2,
    scoringSettings: { scoringItems: [{ statId: 53, points: 1 }] },
    rosterSettings: { lineupSlotCounts: { "0": 1, "2": 1, "4": 1, "6": 1, "20": 2, "21": 1 } },
    scheduleSettings: { matchupPeriodCount: 14, playoffTeamCount: 2, matchupPeriods: { "1": [1], "15": [15] } },
    draftSettings: { type: "SNAKE", pickOrder: [2, 1] },
  },
  status: { isActive: true, previousSeasons: [2024] },
  members: [
    { id: "{A}", displayName: "alpha" },
    { id: "{B}", displayName: "bravo", isLeagueManager: true },
  ],
  teams: [
    { id: 1, name: "Alpha Dogs", owners: ["{A}"], primaryOwner: "{A}", record: { overall: { wins: 3, losses: 1, ties: 0, pointsFor: 456.78, pointsAgainst: 400, streakLength: 2, streakType: "WIN" } } },
    { id: 2, location: "Bravo", nickname: "Bunch", owners: ["{B}"], primaryOwner: "{B}", record: { overall: { wins: 1, losses: 3, ties: 0, pointsFor: 380.5, pointsAgainst: 420 } } },
  ],
  draftDetail: {
    drafted: true,
    picks: [
      { overallPickNumber: 1, roundId: 1, roundPickNumber: 1, playerId: 3918298, teamId: 2 },
      { overallPickNumber: 2, roundId: 1, roundPickNumber: 2, playerId: 4262921, teamId: 1 },
      { overallPickNumber: 3, roundId: 2, roundPickNumber: 1, playerId: 3929630, teamId: 1 },
    ],
  },
};
const entry = (playerId: number, lineupSlotId: number, fullName: string, defaultPositionId: number, proTeamId: number, points = 0) => ({
  playerId,
  lineupSlotId,
  playerPoolEntry: { appliedStatTotal: points, player: { id: playerId, fullName, defaultPositionId, proTeamId } },
});
const espnRosters = {
  teams: [
    { id: 1, roster: { entries: [entry(4262921, 4, "Justin Jefferson", 3, 16), entry(3040151, 20, "George Kittle", 4, 25), entry(-16012, 20, "Chiefs D/ST", 16, 12)] } },
    { id: 2, roster: { entries: [entry(3918298, 0, "Josh Allen", 1, 2), entry(3929630, 2, "Saquon Barkley", 2, 21), entry(99999, 21, "Nobody Known", 3, 1)] } },
  ],
};
const espnWeek = {
  schedule: [
    {
      id: 1,
      matchupPeriodId: 1,
      winner: "UNDECIDED",
      home: { teamId: 1, totalPoints: 30.5, rosterForCurrentScoringPeriod: { entries: [entry(4262921, 4, "Justin Jefferson", 3, 16, 30.5)] } },
      away: { teamId: 2, totalPointsLive: 42.25, totalPoints: 40, rosterForCurrentScoringPeriod: { entries: [entry(3918298, 0, "Josh Allen", 1, 2, 28), entry(3929630, 2, "Saquon Barkley", 2, 21, 14.25)] } },
    },
    { id: 2, matchupPeriodId: 2, home: { teamId: 1 }, away: { teamId: 2 } },
  ],
};
const espnSchedule = {
  schedule: [
    { id: 9, matchupPeriodId: 15, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 1, totalPoints: 100 }, away: { teamId: 2, totalPoints: 110 } },
    { id: 10, matchupPeriodId: 14, playoffTierType: "NONE", winner: "HOME", home: { teamId: 1 }, away: { teamId: 2 } },
  ],
};
const espnTxns = {
  transactions: [
    { id: "t1", type: "TRADE_ACCEPT", status: "EXECUTED", processDate: 1757000000000, items: [{ playerId: 3918298, fromTeamId: 2, toTeamId: 1, type: "TRADE" }, { playerId: 4262921, fromTeamId: 1, toTeamId: 2, type: "TRADE" }] },
    { id: "t2", type: "WAIVER", status: "EXECUTED", processDate: 1757000000001, bidAmount: 7, items: [{ playerId: 4866, fromTeamId: 0, toTeamId: 2, type: "ADD" }] },
    { id: "t3", type: "TRADE_PROPOSAL", status: "PENDING", items: [] },
  ],
};

test("an ESPN league reads as a Sleeper one: league, managers, rosters, a week, its moves, its draft, its bracket", async () => {
  serve([
    ["view=mMatchup&view=mMatchupScore&scoringPeriodId=1", espnWeek],
    ["view=mTransactions2", espnTxns],
    ["view=mRoster", espnRosters],
    ["view=mMatchupScore", espnSchedule],
    ["view=mSettings", espnInfo],
  ]);
  const ref = { site: "espn" as const, season: "2025", id: "77" };

  const league = await espn.league(ref);
  assert.equal(league?.name, "Gridiron Guys");
  assert.equal(league?.league_id, "espn-2025-77");
  assert.equal(league?.previous_league_id, "espn-2024-77");
  assert.deepEqual(league?.roster_positions, ["QB", "RB", "WR", "TE", "BN", "BN"]);
  assert.equal(league?.settings.playoff_week_start, 15);
  assert.equal(league?.scoring_settings?.rec, 1);

  const users = await espn.users(ref);
  assert.deepEqual(users.map((u) => [u.display_name, u.metadata?.team_name]), [["alpha", "Alpha Dogs"], ["bravo", "Bravo Bunch"]]);

  const rosters = await espn.rosters(ref);
  const one = rosters.find((r) => r.roster_id === 1)!;
  assert.deepEqual(one.players, ["6794", "4217", "KC"]);
  assert.deepEqual(one.starters, ["0", "0", "6794", "0"]);
  assert.equal(one.settings.wins, 3);
  assert.equal(one.settings.fpts, 456);
  assert.equal(one.settings.fpts_decimal, 78);
  assert.equal(one.metadata?.streak, "2W");
  const two = rosters.find((r) => r.roster_id === 2)!;
  assert.deepEqual(two.starters, ["4984", "4866", "0", "0"]);
  // Someone Sleeper doesn't know, under an id of his own.
  assert.deepEqual(two.reserve, ["espn:99999"]);

  const week = await espn.matchups(ref, 1, 60);
  assert.equal(week.length, 2);
  assert.ok(week.every((m) => m.matchup_id === 1));
  const away = week.find((m) => m.roster_id === 2)!;
  assert.equal(away.points, 42.25);
  assert.equal(away.players_points?.["4866"], 14.25);

  const moves = await espn.transactions(ref, 3);
  assert.equal(moves.length, 2);
  const trade = moves.find((t) => t.type === "trade")!;
  assert.deepEqual(trade.adds, { "4984": 1, "6794": 2 });
  assert.deepEqual(trade.drops, { "4984": 2, "6794": 1 });
  assert.deepEqual(moves.find((t) => t.type === "waiver")?.roster_ids, [2]);

  const [draft] = await espn.drafts(ref);
  assert.equal(draft.status, "complete");
  assert.deepEqual(draft.slot_to_roster_id, { "1": 2, "2": 1 });
  const picks = await espn.draftPicks(ref);
  assert.deepEqual(picks.map((p) => [p.pick_no, p.draft_slot, p.roster_id, p.player_id]), [[1, 1, 2, "4984"], [2, 2, 1, "6794"], [3, 2, 1, "4866"]]);

  const bracket = await espn.winnersBracket(ref);
  assert.deepEqual(bracket, [{ r: 1, m: 1, t1: 1, t2: 2, w: 2, l: 1, p: 1 }]);

  // And by way of the paths sleeper.ts asks for.
  assert.equal(((await siteAnswer("/league/espn-2025-77", 60)) as { name: string }).name, "Gridiron Guys");
  assert.equal(((await siteAnswer("/league/espn-2025-77/matchups/1", 60)) as unknown[]).length, 2);
  assert.equal(siteAnswer("/league/1180120456789012345", 60), undefined);
});

test("an MFL league: its lineup's fewest at each spot then flex, live scoring, a trade with a future pick", async () => {
  serve([
    ["TYPE=league&", { league: { name: "Dynasty Den", franchises: { franchise: [{ id: "0001", name: "Den One", owner_name: "Ann" }, { id: "0002", name: "Den Two" }] }, starters: { count: "5", position: [{ name: "QB", limit: "1-2" }, { name: "RB", limit: "1-3" }, { name: "WR", limit: "2-4" }] }, rosterSize: "8", lastRegularSeasonWeek: "14", history: { league: [{ year: "2024", url: "https://www45.myfantasyleague.com/2024/home/55555" }] } } }],
    ["TYPE=players", { players: { player: [{ id: "13604", name: "Allen, Josh", position: "QB", team: "BUF" }, { id: "14000", name: "Jefferson, Justin", position: "WR", team: "MIN" }, { id: "0510", name: "Chiefs, Kansas City", position: "Def", team: "KCC" }] } }],
    ["TYPE=liveScoring", { liveScoring: { matchup: [{ franchise: [{ id: "0001", score: "31.5", players: { player: [{ id: "13604", score: "25.5", status: "starter" }, { id: "0510", score: "6", status: "nonstarter" }] } }, { id: "0002", score: "12", players: { player: { id: "14000", score: "12", status: "starter" } } }] }] } }],
    ["TYPE=transactions", { transactions: { transaction: [{ type: "TRADE", timestamp: String(Date.UTC(2025, 8, 9) / 1000), franchise: "0001", franchise1_gave_up: "13604,FP_0001_2026_1,", franchise2: "0002", franchise2_gave_up: "14000," }] } }],
  ]);
  const ref = { site: "mfl" as const, season: "2025", id: "12345" };
  const league = await mfl.league(ref);
  assert.deepEqual(league?.roster_positions, ["QB", "RB", "WR", "WR", "SUPER_FLEX", "BN", "BN", "BN"]);
  assert.equal(league?.previous_league_id, "mfl-2024-55555");
  assert.equal(league?.settings.playoff_week_start, 15);
  const users = await mfl.users(ref);
  assert.deepEqual(users.map((u) => u.metadata?.team_name), ["Den One", "Den Two"]);
  const week = await mfl.matchups(ref, 2, 60);
  const one = week.find((m) => m.roster_id === 1)!;
  assert.equal(one.points, 31.5);
  assert.deepEqual(one.players, ["4984", "KC"]);
  assert.equal(one.starters?.[0], "4984");
  const [trade] = await mfl.transactions(ref, 1);
  assert.deepEqual(trade.adds, { "4984": 2, "6794": 1 });
  assert.deepEqual(trade.draft_picks, [{ season: "2026", round: 1, roster_id: 1, previous_owner_id: 1, owner_id: 2 }]);
});

test("a Fleaflicker league: its standings for its teams, a week's box scores for starters and points", async () => {
  const pro = (id: number, nameFull: string, position: string, proTeamAbbreviation: string) => ({ proPlayer: { id, nameFull, position, proTeamAbbreviation } });
  serve([
    ["FetchLeagueStandings", { league: { name: "Flea Circus", size: 2 }, divisions: [{ teams: [{ id: 11, name: "Fleas", owners: [{ id: 1, displayName: "flo" }], recordOverall: { wins: 2, losses: 0 }, pointsFor: { value: 210.4 }, streak: { value: 2 } }, { id: 12, name: "Ticks", recordOverall: { wins: 0, losses: 2 }, streak: { value: -2 } }] }] }],
    ["FetchLeagueRules", { rosterPositions: [{ label: "QB", group: "START", start: 1 }, { label: "RB/WR/TE", group: "START", start: 1 }, { label: "BN", group: "BENCH", start: 4 }] }],
    ["FetchLeagueScoreboard", { games: [{ id: "g1", home: { id: 11 }, away: { id: 12 }, homeScore: { score: { value: 40 } }, awayScore: { score: { value: 20 } } }] }],
    ["FetchLeagueBoxscore", { lineups: [{ group: "START", slots: [{ position: { label: "QB" }, home: { ...pro(1, "Josh Allen", "QB", "BUF"), viewingActualPoints: { value: 28 } } }, { position: { label: "RB/WR/TE" }, home: { ...pro(2, "George Kittle", "TE", "SF"), viewingActualPoints: { value: 12 } }, away: { ...pro(3, "Justin Jefferson", "WR", "MIN"), viewingActualPoints: { value: 20 } } }] }] }],
  ]);
  const ref = { site: "fleaflicker" as const, season: "2025", id: "321" };
  const league = await fleaflicker.league(ref);
  assert.equal(league?.name, "Flea Circus");
  assert.deepEqual(league?.roster_positions, ["QB", "FLEX", "BN", "BN", "BN", "BN"]);
  const week = await fleaflicker.matchups(ref, 3, 60);
  const home = week.find((m) => m.roster_id === 11)!;
  assert.deepEqual(home.starters, ["4984", "4217"]);
  assert.equal(home.points, 40);
  assert.equal(home.players_points?.["4217"], 12);
  const away = week.find((m) => m.roster_id === 12)!;
  assert.deepEqual(away.starters, ["0", "6794"]);
});

test("Yahoo's lists of one-key objects and numbered collections, read as plain ones", () => {
  const team = [[{ team_key: "449.l.1.t.3" }, { team_id: "3" }, { name: "Yahooligans" }, []], { team_points: { total: "101.5" } }];
  assert.deepEqual(merged(team), { team_key: "449.l.1.t.3", team_id: "3", name: "Yahooligans", team_points: { total: "101.5" } });
  const teams = { "0": { team }, "1": { team: [[{ team_id: "4" }]] }, count: 2 };
  assert.deepEqual(itemsOf(teams, "team").map((t) => t.team_id), ["3", "4"]);
});
