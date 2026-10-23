import test from "node:test";
import assert from "node:assert/strict";
import { pickId, rosterTimeline, settlePicks, tradedOnly } from "./roster-timeline";

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

test("settlePicks plays picks forward to today's holders, and drops them from whoever really held them", () => {
  const [p1, p2] = [pickId(2026, 1, 1), pickId(2026, 1, 2)];
  const { events, held } = settlePicks([
    // Each team gets its 2026 1st.
    { at: 0, tradeId: null, adds: [[p1, 1], [p2, 2]], drops: [] },
    // Team 2 trades its 1st to team 1 — though Sleeper says it came from team 3.
    { at: 10, tradeId: "t1", adds: [[p2, 1], ["x", 2]], drops: [[p2, 3], ["x", 1]] },
    // Team 1 uses team 2's pick on r.
    { at: 20, tradeId: null, adds: [["r", 1]], drops: [[p2, 1]] },
  ]);
  assert.deepEqual(events[1].drops, [[p2, 2], ["x", 1]]);
  assert.deepEqual(sorted(held), { 1: [p1] });
  // From today back: before the draft team 1 held both 1sts, and before the trade each its own.
  const columns = rosterTimeline(new Map([[1, ["r", p1]], [2, ["x"]]]), events, 100);
  assert.deepEqual(sorted(columns[0].rosters), { 1: [p1, "x"], 2: [p2] });
  assert.deepEqual(sorted(columns[1].rosters), { 1: [p1, p2], 2: ["x"] });
});

test("tradedOnly keeps whoever's ever been traded, and the players traded picks became", () => {
  const pick = pickId(2026, 1, 2);
  const events = [
    { at: 10, tradeId: "t1", adds: [[pick, 1], ["x", 2]], drops: [[pick, 2], ["x", 1]] },
    { at: 20, tradeId: null, adds: [["r", 1]], drops: [[pick, 1]] },
  ] satisfies Parameters<typeof tradedOnly>[1];
  const columns = rosterTimeline(new Map([[1, ["a", "r"]], [2, ["b", "x"]]]), events, 100);
  const kept = tradedOnly(columns, events, new Map([[pick, "r"]]));
  assert.deepEqual(kept.map((c) => sorted(c.rosters)), [
    { 1: ["x"], 2: [pick] },
    { 1: [pick], 2: ["x"] },
    { 1: ["r"], 2: ["x"] },
  ]);
});
