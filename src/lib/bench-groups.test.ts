import test from "node:test";
import assert from "node:assert/strict";
import { benchFilters, benchList, canFill, BenchCandidate, StarterInSlot } from "./bench-groups";

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

test("projected: everyone once, most projected first, those without a projection last", () => {
  const bench = [p("a", "WR", 9), p("b", "RB", null), p("c", "TE", 14), p("d", "QB", 3, { bye: true })];
  assert.deepEqual(benchList(bench, [], "projected"), [
    { id: "c", note: "14.0 proj" },
    { id: "a", note: "9.0 proj" },
    { id: "d", note: "bye" },
    { id: "b", note: null },
  ]);
});

test("could outscore a starter: over the lowest starter in a slot he could fill, biggest margin first", () => {
  const starters: StarterInSlot[] = [
    { slot: "WR", id: "w1", name: "Wide One", projected: 9 },
    { slot: "FLEX", id: "f1", name: "Flex Guy", projected: 7 },
    { slot: "QB", id: "q1", name: "Quarter Back", projected: 20 },
  ];
  const bench = [p("rb", "RB", 10), p("wr", "WR", 12), p("qb", "QB", 18), p("byewr", "WR", 15, { bye: true })];
  assert.deepEqual(benchList(bench, starters, "outscore"), [
    { id: "wr", note: "+5.0 over F. Guy" },
    { id: "rb", note: "+3.0 over F. Guy" },
  ]);
});

test("matchup leaves out who's on bye; hot by points a game; bye just them — and only the filters with anyone", () => {
  const bench = [
    p("a", "WR", 14, { matchup: 0.3, opponent: "NYJ", ppg: 11 }),
    p("b", "RB", 9, { matchup: 0.5, opponent: "CAR", ppg: 16 }),
    p("c", "TE", 4, { bye: true, matchup: 0.9, ppg: 2 }),
  ];
  assert.deepEqual(benchList(bench, [], "matchup"), [
    { id: "b", note: "vs CAR" },
    { id: "a", note: "vs NYJ" },
  ]);
  assert.deepEqual(benchList(bench, [], "hot").map((x) => x.id), ["b", "a", "c"]);
  assert.deepEqual(benchList(bench, [], "bye").map((x) => x.id), ["c"]);
  assert.deepEqual(benchFilters(bench, []).map((f) => f.key), ["projected", "matchup", "hot", "bye"]);
});
