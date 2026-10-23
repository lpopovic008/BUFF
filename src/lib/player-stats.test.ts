import test from "node:test";
import assert from "node:assert/strict";
import { defenseRanks, EMPTY_PLAYER_STATS } from "./player-stats";

const line = (team: string, position: string, games: number, ptsPpr: number, ptsStd = ptsPpr) => ({ team, position, games, ptsPpr, ptsHalfPpr: ptsPpr, ptsStd });

test("defenseRanks ranks each defense by points a game allowed to a position, the fewest first", () => {
  const ranks = defenseRanks({
    ...EMPTY_PLAYER_STATS,
    defense: [line("BUF", "WR", 6, 180), line("KC", "WR", 5, 100), line("DAL", "WR", 6, 240), line("KC", "QB", 5, 90)],
  });
  // A game: KC 20, BUF 30, DAL 40 — BUF the average, halfway.
  assert.deepEqual([ranks.get("KC-WR")?.rank, ranks.get("KC-WR")?.perGame], [1, 20]);
  assert.deepEqual([ranks.get("BUF-WR")?.rank, ranks.get("BUF-WR")?.perGame], [2, 30]);
  assert.ok(Math.abs(ranks.get("BUF-WR")!.share - 0.5) < 1e-9);
  assert.equal(ranks.get("DAL-WR")?.rank, 3);
  assert.ok(ranks.get("KC-WR")!.share < 0.5 && ranks.get("DAL-WR")!.share > 0.5);
  assert.equal(ranks.get("KC-QB")?.rank, 1);
});

test("defenseRanks scores under the league's reception setting", () => {
  const snapshot = { ...EMPTY_PLAYER_STATS, defense: [line("BUF", "WR", 1, 30, 10), line("KC", "WR", 1, 20, 15)] };
  assert.equal(defenseRanks(snapshot, { rec: 1 }).get("KC-WR")?.rank, 1);
  assert.equal(defenseRanks(snapshot, { rec: 0 }).get("BUF-WR")?.rank, 1);
});

test("defenseRanks spaces defenses by how many points they allow, not their rank", () => {
  // 100, 200 and 210 a game: the second and third all but alike, far from the first.
  const ranks = defenseRanks({ ...EMPTY_PLAYER_STATS, defense: [line("A", "RB", 1, 100), line("B", "RB", 1, 200), line("C", "RB", 1, 210)] });
  const [a, b, c] = ["A", "B", "C"].map((t) => ranks.get(`${t}-RB`)!.share);
  assert.ok(c - b < 0.1 && b - a > 0.5, `${a} ${b} ${c}`);
});

test("defenseRanks keeps one defense far out on its own from squeezing the rest together", () => {
  const defense = [...Array.from({ length: 10 }, (_, i) => line(`T${i}`, "TE", 1, 10 + i)), line("OUT", "TE", 1, 60)];
  const ranks = defenseRanks({ ...EMPTY_PLAYER_STATS, defense });
  assert.equal(ranks.get("OUT-TE")!.share, 1);
  // The rest still spread across the scale, not bunched at the bottom.
  assert.ok(ranks.get("T9-TE")!.share - ranks.get("T1-TE")!.share > 0.5);
});
