import test from "node:test";
import assert from "node:assert/strict";
import { defenseRanks, EMPTY_PLAYER_STATS } from "./player-stats";

const line = (team: string, position: string, games: number, ptsPpr: number, ptsStd = ptsPpr) => ({ team, position, games, ptsPpr, ptsHalfPpr: ptsPpr, ptsStd });

test("defenseRanks ranks each defense by points a game allowed to a position, the fewest first", () => {
  const ranks = defenseRanks({
    ...EMPTY_PLAYER_STATS,
    defense: [line("BUF", "WR", 6, 180), line("KC", "WR", 5, 100), line("DAL", "WR", 6, 240), line("KC", "QB", 5, 90)],
  });
  // A game: KC 20, BUF 30, DAL 40.
  assert.equal(ranks.get("KC-WR"), 1);
  assert.equal(ranks.get("BUF-WR"), 2);
  assert.equal(ranks.get("DAL-WR"), 3);
  assert.equal(ranks.get("KC-QB"), 1);
});

test("defenseRanks scores under the league's reception setting", () => {
  const snapshot = { ...EMPTY_PLAYER_STATS, defense: [line("BUF", "WR", 1, 30, 10), line("KC", "WR", 1, 20, 15)] };
  assert.equal(defenseRanks(snapshot, { rec: 1 }).get("KC-WR"), 1);
  assert.equal(defenseRanks(snapshot, { rec: 0 }).get("BUF-WR"), 1);
});
