import test from "node:test";
import assert from "node:assert/strict";
import { benchGroups, canFill, BenchCandidate, StarterInSlot } from "./bench-groups";

const p = (id: string, position: string, projected: number | null, more: Partial<BenchCandidate> = {}): BenchCandidate => ({
  id,
  name: `${id} Player`,
  position,
  projected,
  matchup: null,
  opponent: null,
  bye: false,
  ppg: null,
  ...more,
});

test("flex slots take their positions; the rest just their own", () => {
  assert.ok(canFill("FLEX", "TE") && canFill("SUPER_FLEX", "QB") && canFill("WR", "WR"));
  assert.ok(!canFill("FLEX", "QB") && !canFill("RB", "WR") && !canFill("REC_FLEX", "RB"));
});

test("who could outscore a starter: over the lowest starter in a slot he could fill, biggest margin first", () => {
  const starters: StarterInSlot[] = [
    { slot: "WR", id: "w1", name: "Wide One", projected: 9 },
    { slot: "FLEX", id: "f1", name: "Flex Guy", projected: 7 },
    { slot: "QB", id: "q1", name: "Quarter Back", projected: 20 },
  ];
  const bench = [p("rb", "RB", 10), p("wr", "WR", 12), p("qb", "QB", 18), p("byewr", "WR", 15, { bye: true })];
  const out = benchGroups(bench, starters).find((g) => g.key === "outscore")!;
  assert.deepEqual(out.players, [
    { id: "wr", note: "+5.0 over F. Guy" },
    { id: "rb", note: "+3.0 over F. Guy" },
  ]);
});

test("the top few by projection, matchup and points a game; who's on bye; then everyone — empty groups left out", () => {
  const bench = [
    p("a", "WR", 14, { matchup: 0.3, opponent: "NYJ", ppg: 11 }),
    p("b", "RB", 9, { matchup: 0.5, opponent: "CAR", ppg: 16 }),
    p("c", "TE", 4, { bye: true, matchup: 0.9, ppg: 2 }),
    p("d", "QB", 0),
  ];
  const groups = benchGroups(bench, [], 2);
  assert.deepEqual(groups.map((g) => g.key), ["projected", "matchup", "hot", "bye", "all"]);
  assert.deepEqual(groups[0].players.map((x) => x.id), ["a", "b"]);
  // On bye: no matchup to speak of.
  assert.deepEqual(groups[1].players, [
    { id: "b", note: "vs CAR" },
    { id: "a", note: "vs NYJ" },
  ]);
  assert.deepEqual(groups[2].players.map((x) => x.id), ["b", "a"]);
  assert.deepEqual(groups[3].players.map((x) => x.id), ["c"]);
  assert.equal(groups[4].players.length, 4);
});
