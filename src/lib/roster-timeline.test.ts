import test from "node:test";
import assert from "node:assert/strict";
import { rosterTimeline } from "./roster-timeline";

const sorted = (m: Map<number, string[]>) => Object.fromEntries([...m].map(([id, ps]) => [id, [...ps].sort()]));

test("rosterTimeline undoes every move from today's rosters, a column after each trade", () => {
  // Today: team 1 has a, d, r; team 2 has b, c.
  const current = new Map([
    [1, ["a", "d", "r"]],
    [2, ["b", "c"]],
  ]);
  const columns = rosterTimeline(
    current,
    [
      // Day 10: team 1 drafted the rookie r.
      { at: 10, tradeId: null, adds: [["r", 1]], drops: [] },
      // Day 20: team 1 sent x to team 2 for d.
      { at: 20, tradeId: "t1", adds: [["d", 1], ["x", 2]], drops: [["d", 2], ["x", 1]] },
      // Day 25: team 2 dropped x and picked up c.
      { at: 25, tradeId: null, adds: [["c", 2]], drops: [["x", 2]] },
    ],
    100
  );
  assert.deepEqual(
    columns.map((c) => [c.kind, c.tradeId]),
    [
      ["start", null],
      ["trade", "t1"],
      ["now", null],
    ]
  );
  // Before the trade (and after the draft): 1 had a, r, x; 2 had b, d.
  assert.deepEqual(sorted(columns[0].rosters), { 1: ["a", "r", "x"], 2: ["b", "d"] });
  // Just after it: d and x swapped.
  assert.deepEqual(sorted(columns[1].rosters), { 1: ["a", "d", "r"], 2: ["b", "x"] });
  assert.deepEqual(sorted(columns[2].rosters), { 1: ["a", "d", "r"], 2: ["b", "c"] });
});

test("rosterTimeline leaves out now when nothing's changed since the last trade, and has no columns without trades", () => {
  const current = new Map([[1, ["a"]], [2, ["b"]]]);
  const trade = { at: 5, tradeId: "t", adds: [["a", 1], ["b", 2]] as [string, number][], drops: [["a", 2], ["b", 1]] as [string, number][] };
  assert.deepEqual(rosterTimeline(current, [trade], 9).map((c) => c.kind), ["start", "trade"]);
  assert.deepEqual(rosterTimeline(current, [], 9).map((c) => c.kind), ["now"]);
});
