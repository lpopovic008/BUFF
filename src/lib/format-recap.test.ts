import test from "node:test";
import assert from "node:assert/strict";
import { buildExtraSections } from "./format-recap";
import { WeekRecapData, MatchupGame, StandingsRow } from "./league-data";

const team = (rosterId: number, teamName: string, points: number) => ({
  rosterId,
  teamName,
  managerName: teamName,
  avatar: null,
  points,
  playerIds: [],
  starterIds: [],
  playersPoints: {},
});
const game = (id: number, a: ReturnType<typeof team>, b: ReturnType<typeof team>): MatchupGame => ({ matchupId: id, teams: [a, b] });
const row = (rosterId: number, teamName: string, rank: number): StandingsRow => ({
  rosterId,
  ownerId: null,
  managerName: teamName,
  teamName,
  avatar: null,
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  rank,
});

const data = {
  week: 4,
  games: [
    game(1, team(1, "Sharks", 150), team(2, "Otters", 90)),
    game(2, team(3, "Minnows", 101), team(4, "Whales", 100.5)),
    game(3, team(5, "Eels", 82), team(6, "Crabs", 70)),
  ],
  standingsBefore: [row(1, "Sharks", 3), row(3, "Minnows", 1), row(5, "Eels", 6), row(2, "Otters", 2), row(4, "Whales", 4), row(6, "Crabs", 5)],
  standingsAfter: [row(1, "Sharks", 1), row(3, "Minnows", 2), row(5, "Eels", 3), row(2, "Otters", 4), row(4, "Whales", 5), row(6, "Crabs", 6)],
  topPlayer: { playerId: "p1", name: "Ja'Marr Chase", teamName: "Sharks", points: 41.2 },
  lowScorer: { teamName: "Crabs", points: 70 },
  transactionSummaries: ["Sharks added Rome Odunze"],
} as unknown as WeekRecapData;

test("buildExtraSections writes each added section from the week's data", () => {
  const extra = buildExtraSections(data);
  assert.match(extra.playerOfWeek, /^Ja'Marr Chase put up 41\.20 for Sharks/);
  assert.match(extra.lowScorer, /^Crabs brought up the rear with 70\.00/);
  // The closest game, the biggest margin, the lowest-scoring winner and the highest-scoring loser.
  assert.match(extra.closestGame, /^Minnows edged Whales 101\.00–100\.50, decided by just 0\.50/);
  assert.match(extra.blowout, /^Sharks ran Otters off the field/);
  assert.match(extra.luck, /Luckiest win: Eels won with just 82\.00/);
  assert.match(extra.luck, /Toughest loss: Whales scored 100\.50 and still lost/);
  // The biggest climb (Eels, 6th to 3rd) and the biggest slide (Otters, 2nd to 4th).
  assert.match(extra.movers, /Eels climbed 3 spots to 3rd/);
  assert.match(extra.movers, /Otters slid 2 spots to 4th/);
  assert.equal(extra.transactions, "• Sharks added Rome Odunze");
  assert.equal(extra.commishNotes, "");
});
