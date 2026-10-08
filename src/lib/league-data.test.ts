import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCareerStats,
  extendStreak,
  finalPlacements,
  lastFinishedWeek,
  LeagueSummary,
  pointsRanks,
  resultsAsTheyStand,
  rosterStreak,
  SeasonRecord,
  StandingsRow,
  summaryAsItStands,
  teamStandings,
  unfinishedWeeks,
} from "./league-data";
import { SleeperBracketMatch, SleeperLeague, SleeperMatchup, SleeperRoster } from "./sleeper";

/**
 * The brackets below are the real ones Sleeper returned for these leagues —
 * captured off the live API — so these tests pin the finish order to what
 * actually happened on the field rather than to a hand-built fixture.
 */

/** Standings rows in seeding order (win%, then points for), which is all finalPlacements needs. */
function seeds(rosterIds: number[]): StandingsRow[] {
  return rosterIds.map((rosterId, i) => ({
    rosterId,
    ownerId: `owner-${rosterId}`,
    managerName: `manager-${rosterId}`,
    teamName: `team-${rosterId}`,
    avatar: null,
    wins: 14 - i,
    losses: i,
    ties: 0,
    pointsFor: 2000 - i,
    pointsAgainst: 1900,
    rank: i + 1,
  }));
}

function finishOrder(
  seeding: number[],
  winners: SleeperBracketMatch[],
  losers: SleeperBracketMatch[]
): number[] {
  return finalPlacements(seeds(seeding), winners, losers).map((row) => row.rosterId);
}

// "Fade the Rebuild" 2025 — 10 teams, 6 playoff teams.
const FADE_WINNERS: SleeperBracketMatch[] = [
  { r: 1, m: 1, t1: 5, t2: 1, w: 1, l: 5 },
  { r: 1, m: 2, t1: 8, t2: 6, w: 6, l: 8 },
  { r: 2, m: 3, t1: 9, t2: 1, w: 9, l: 1 },
  { r: 2, m: 4, t1: 2, t2: 6, w: 2, l: 6 },
  { r: 2, m: 5, t1: 5, t2: 8, w: 5, l: 8, p: 5 },
  { r: 3, m: 6, t1: 9, t2: 2, w: 9, l: 2, p: 1 },
  { r: 3, m: 7, t1: 1, t2: 6, w: 6, l: 1, p: 3 },
];
const FADE_LOSERS: SleeperBracketMatch[] = [
  { r: 1, m: 1, t1: 7, t2: 10, w: 10, l: 7 },
  { r: 1, m: 2, t1: 4, t2: 3, w: 4, l: 3 },
  { r: 2, m: 3, t1: 10, t2: 4, w: 10, l: 4, p: 1 },
  { r: 2, m: 4, t1: 7, t2: 3, w: 7, l: 3, p: 3 },
];
// Seeding that season: 9, 2 (division winners) then 6, 5, 1, 8, 10, 3, 4, 7.
const FADE_SEEDING = [9, 2, 6, 5, 1, 8, 10, 3, 4, 7];

test("winners-bracket placement games decide the top of the table", () => {
  const order = finishOrder(FADE_SEEDING, FADE_WINNERS, FADE_LOSERS);
  // p:1 -> 9 beat 2; p:3 -> 6 beat 1; p:5 -> 5 beat 8.
  assert.deepEqual(order.slice(0, 6), [9, 2, 6, 1, 5, 8]);
});

test("the consolation bracket decides the bottom, not regular-season record", () => {
  const order = finishOrder(FADE_SEEDING, FADE_WINNERS, FADE_LOSERS);
  // Roster 3 seeded 8th but lost both consolation games, so it finished last —
  // while roster 4, seeded below it, won one and finished 8th.
  assert.deepEqual(order.slice(6), [10, 4, 7, 3]);
});

test("a consolation bracket's p values are relative to itself, not the whole league", () => {
  // Its p:1 game decides 7th overall here (6 playoff teams rank above it), so
  // its winner must never be mistaken for the league champion.
  const order = finishOrder(FADE_SEEDING, FADE_WINNERS, FADE_LOSERS);
  assert.equal(order[0], 9); // championship winner
  assert.equal(order.indexOf(10), 6); // consolation winner -> 7th
});

// Brozickernic 2025 — 14 teams, 8 playoff teams, six-team consolation bracket.
const BROZ_WINNERS: SleeperBracketMatch[] = [
  { r: 1, m: 1, t1: 14, t2: 10, w: 10, l: 14 },
  { r: 1, m: 2, t1: 13, t2: 3, w: 13, l: 3 },
  { r: 1, m: 3, t1: 11, t2: 12, w: 12, l: 11 },
  { r: 1, m: 4, t1: 7, t2: 8, w: 8, l: 7 },
  { r: 2, m: 5, t1: 10, t2: 13, w: 13, l: 10 },
  { r: 2, m: 6, t1: 12, t2: 8, w: 8, l: 12 },
  { r: 2, m: 7, t1: 14, t2: 3, w: 3, l: 14 },
  { r: 2, m: 8, t1: 11, t2: 7, w: 11, l: 7 },
  { r: 3, m: 9, t1: 13, t2: 8, w: 13, l: 8, p: 1 },
  { r: 3, m: 10, t1: 10, t2: 12, w: 12, l: 10, p: 3 },
  { r: 3, m: 11, t1: 3, t2: 11, w: 11, l: 3, p: 5 },
  { r: 3, m: 12, t1: 14, t2: 7, w: 14, l: 7, p: 7 },
];
const BROZ_LOSERS: SleeperBracketMatch[] = [
  { r: 1, m: 1, t1: 2, t2: 9, w: 9, l: 2 },
  { r: 1, m: 2, t1: 4, t2: 5, w: 4, l: 5 },
  { r: 2, m: 3, t1: 1, t2: 9, w: 9, l: 1 },
  { r: 2, m: 4, t1: 6, t2: 4, w: 6, l: 4 },
  { r: 2, m: 5, t1: 2, t2: 5, w: 5, l: 2, p: 5 },
  { r: 3, m: 6, t1: 9, t2: 6, w: 6, l: 9, p: 1 },
  { r: 3, m: 7, t1: 1, t2: 4, w: 1, l: 4, p: 3 },
];

test("every team gets a distinct finish across both brackets", () => {
  const seeding = [13, 8, 12, 10, 11, 3, 14, 7, 6, 9, 1, 4, 5, 2];
  const order = finishOrder(seeding, BROZ_WINNERS, BROZ_LOSERS);
  assert.deepEqual(order, [13, 8, 12, 10, 11, 3, 14, 7, 6, 9, 1, 4, 5, 2]);
  assert.equal(new Set(order).size, 14);
});

test("teams in neither bracket fall to the bottom in seed order", () => {
  const winners: SleeperBracketMatch[] = [{ r: 1, m: 1, t1: 1, t2: 2, w: 1, l: 2, p: 1 }];
  const order = finishOrder([1, 2, 3, 4], winners, []);
  assert.deepEqual(order, [1, 2, 3, 4]);
});

test("a playoff team knocked out with no placement game still outranks the consolation bracket", () => {
  // No 3rd-place game: rosters 3 and 4 lost in the semis and have no `p`, but
  // they played deeper than anyone in the consolation bracket.
  const winners: SleeperBracketMatch[] = [
    { r: 1, m: 1, t1: 1, t2: 4, w: 1, l: 4 },
    { r: 1, m: 2, t1: 2, t2: 3, w: 2, l: 3 },
    { r: 2, m: 3, t1: 1, t2: 2, w: 1, l: 2, p: 1 },
  ];
  const losers: SleeperBracketMatch[] = [{ r: 1, m: 1, t1: 5, t2: 6, w: 5, l: 6, p: 1 }];
  assert.deepEqual(finishOrder([1, 2, 3, 4, 5, 6], winners, losers), [1, 2, 3, 4, 5, 6]);
});

function season(over: Partial<SeasonRecord> & { standings: StandingsRow[] }): SeasonRecord {
  return {
    season: "2025",
    leagueId: "L",
    leagueName: "League",
    champion: null,
    runnerUp: null,
    hasResults: true,
    complete: true,
    ...over,
  };
}

test("an unplayed season contributes no finish, no record, and no season count", () => {
  const zeroed = seeds([1, 2, 3]).map((row) => ({ ...row, wins: 0, losses: 0, ties: 0, pointsFor: 0 }));
  const stats = aggregateCareerStats([
    season({ season: "2026", standings: zeroed, hasResults: false, complete: false }),
  ]);
  assert.deepEqual(stats, []);
});

test("a season still being played counts its games but not a finish", () => {
  const stats = aggregateCareerStats([
    season({ season: "2026", standings: seeds([1, 2]), complete: false }),
  ]);
  const first = stats.find((s) => s.userId === "owner-1")!;
  assert.equal(first.bestFinishRank, null); // leading an unfinished season is not a finish
  assert.equal(first.wins, 14); // the games played still count
  assert.equal(first.seasons[0].rank, null);
  assert.equal(first.seasons[0].complete, false);
});

test("best finish comes only from seasons that were actually finished", () => {
  const finished = finalPlacements(seeds(FADE_SEEDING), FADE_WINNERS, FADE_LOSERS);
  const inProgress = seeds([1, 9, 2, 6, 5, 8, 10, 3, 4, 7]); // roster 1 currently on top
  const stats = aggregateCareerStats([
    season({ season: "2026", standings: inProgress, complete: false }),
    season({ season: "2025", standings: finished }),
  ]);
  // Roster 1 finished 4th in the one completed season and leads the unfinished
  // one — best finish must stay 4th.
  assert.equal(stats.find((s) => s.userId === "owner-1")!.bestFinishRank, 4);
  // Roster 3 finished last despite seeding 8th.
  assert.equal(stats.find((s) => s.userId === "owner-3")!.bestFinishRank, 10);
});

test("a championship only counts once the season is complete", () => {
  const standings = seeds([1, 2]);
  const asChampion = { ...standings[0] };
  const inProgress = aggregateCareerStats([
    season({ standings, champion: asChampion, complete: false }),
  ]);
  assert.equal(inProgress.find((s) => s.userId === "owner-1")!.championships, 0);
  const done = aggregateCareerStats([season({ standings, champion: asChampion })]);
  assert.equal(done.find((s) => s.userId === "owner-1")!.championships, 1);
});

function roster(metadata: SleeperRoster["metadata"]): SleeperRoster {
  return { roster_id: 1, owner_id: "u", league_id: "L", settings: { wins: 0, losses: 0, ties: 0, fpts: 0, fpts_against: 0 }, metadata };
}

test("rosterStreak reads Sleeper's streak, falling back to the tail of the record", () => {
  assert.deepEqual(rosterStreak(roster({ streak: "3W" })), { result: "W", length: 3 });
  assert.deepEqual(rosterStreak(roster({ streak: "2l" })), { result: "L", length: 2 });
  assert.deepEqual(rosterStreak(roster({ record: "WLWWW" })), { result: "W", length: 3 });
  assert.deepEqual(rosterStreak(roster({ record: "WWL" })), { result: "L", length: 1 });
  assert.equal(rosterStreak(roster({ record: "WLT" })), null);
  assert.equal(rosterStreak(roster(null)), null);
  assert.equal(rosterStreak(roster({})), null);
});

test("pointsRanks ranks points for and against, most first, ties sharing a rank", () => {
  const row = (rosterId: number, pointsFor: number, pointsAgainst: number) =>
    ({ rosterId, pointsFor, pointsAgainst }) as StandingsRow;
  const ranks = pointsRanks([row(1, 500, 400), row(2, 450, 480), row(3, 500, 380)]);
  assert.deepEqual(ranks.get(1), { pointsFor: 1, pointsAgainst: 2 });
  assert.deepEqual(ranks.get(2), { pointsFor: 3, pointsAgainst: 1 });
  assert.deepEqual(ranks.get(3), { pointsFor: 1, pointsAgainst: 3 });
});

// ---- "As it stands" ---------------------------------------------------------

function league(settings: Record<string, unknown>, status = "in_season"): SleeperLeague {
  return {
    league_id: "L",
    name: "L",
    season: "2026",
    season_type: "regular",
    sport: "nfl",
    status,
    avatar: null,
    previous_league_id: null,
    draft_id: null,
    settings: { playoff_week_start: 15, ...settings },
  };
}

function matchup(rosterId: number, matchupId: number, points: number): SleeperMatchup {
  return { roster_id: rosterId, matchup_id: matchupId, points, starters: [], players: [] } as unknown as SleeperMatchup;
}

test("the last finished week is Sleeper's last scored one, else the week before the current one", () => {
  assert.equal(lastFinishedWeek(league({ last_scored_leg: 4, leg: 5 })), 4);
  assert.equal(lastFinishedWeek(league({ leg: 5 })), 4);
  assert.equal(lastFinishedWeek(league({})), 0);
  assert.equal(lastFinishedWeek(league({ last_scored_leg: 4 }, "complete")), Number.POSITIVE_INFINITY);
});

test("unfinished weeks run from after the last finished one through the current week", () => {
  assert.deepEqual(unfinishedWeeks(league({ last_scored_leg: 4 }), 5), [5]);
  assert.deepEqual(unfinishedWeeks(league({ last_scored_leg: 5 }), 5), []);
  assert.deepEqual(unfinishedWeeks(league({ last_scored_leg: 3 }), 5), [4, 5]);
  assert.deepEqual(unfinishedWeeks(league({}, "complete"), 5), []);
});

test("results as they stand count started weeks only, ties included", () => {
  const results = resultsAsTheyStand([
    [6, [matchup(1, 1, 0), matchup(2, 1, 0)]], // not started
    [5, [matchup(1, 1, 101.5), matchup(2, 1, 88), matchup(3, 2, 70), matchup(4, 2, 70)]],
  ]);
  assert.deepEqual(results.get(1), { results: ["W"], pointsFor: 101.5, pointsAgainst: 88 });
  assert.deepEqual(results.get(2), { results: ["L"], pointsFor: 88, pointsAgainst: 101.5 });
  assert.deepEqual(results.get(3)?.results, ["T"]);
});

test("a streak carries on through new results, flips on a change, and ends on a tie", () => {
  assert.deepEqual(extendStreak({ result: "W", length: 2 }, ["W"]), { result: "W", length: 3 });
  assert.deepEqual(extendStreak({ result: "W", length: 2 }, ["L"]), { result: "L", length: 1 });
  assert.deepEqual(extendStreak(null, ["L", "L"]), { result: "L", length: 2 });
  assert.equal(extendStreak({ result: "W", length: 2 }, ["T"]), null);
});

test("as it stands, the week being played goes on the records, ranks and streaks", () => {
  const rows = seeds([1, 2]).map((r) => ({ ...r, wins: 3, losses: 1, pointsFor: 400, pointsAgainst: 380 }));
  rows[1] = { ...rows[1], pointsFor: 390 };
  const summary = {
    league: league({ last_scored_leg: 4 }),
    rosters: [
      { roster_id: 1, metadata: { streak: "2W" } },
      { roster_id: 2, metadata: { streak: "1L" } },
    ] as unknown as SleeperRoster[],
    users: [],
    standings: rows,
    currentWeek: 5,
  } satisfies LeagueSummary;
  const now = summaryAsItStands(summary, new Map([[5, [matchup(1, 1, 90), matchup(2, 1, 120)]]]));
  const two = now.standings.find((r) => r.rosterId === 2)!;
  assert.equal(two.rank, 1);
  assert.deepEqual([two.wins, two.losses, two.pointsFor, two.pointsAgainst], [4, 1, 510, 470]);
  const standings = teamStandings(now);
  assert.deepEqual(standings.get(1)?.streak, { result: "L", length: 1 });
  assert.deepEqual(standings.get(2)?.streak, { result: "W", length: 1 });
  // Playoff weeks don't go on the record.
  const playoffs = summaryAsItStands(
    { ...summary, league: league({ last_scored_leg: 14 }), currentWeek: 15 },
    new Map([[15, [matchup(1, 1, 90), matchup(2, 1, 120)]]])
  );
  assert.equal(playoffs.standings, summary.standings);
  assert.equal(playoffs.provisional, undefined);
});
