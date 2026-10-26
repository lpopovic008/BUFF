import test from "node:test";
import assert from "node:assert/strict";
import { timelineSpots, tradeRosters } from "./trade-viewer";

test("timelineSpots spaces each year's trades by the log of the time between, its first and last at the ends", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
  const spots = timelineSpots([at(2024, 0, 10), at(2024, 0, 20), at(2024, 1, 9), at(2025, 5, 1)]);
  assert.deepEqual(
    spots.map((s) => s.year),
    [2024, 2024, 2024, 2025]
  );
  assert.equal(spots[0].x, 0);
  assert.equal(spots[2].x, 1);
  // Ten days into thirty: more than a third of the line, the shorter gap getting more than its share.
  assert.ok(spots[1].x > 0.4 && spots[1].x < 0.5);
  // A year's only trade, in the middle.
  assert.equal(spots[3].x, 0.5);
  // A day apart and four months apart: the day still gets room, the months don't take the line over.
  const [a, b, c] = timelineSpots([at(2024, 0, 1), at(2024, 0, 2), at(2024, 4, 1)]);
  assert.equal(a.x, 0);
  assert.ok(b.x > 0.15 && b.x < 0.4);
  assert.equal(c.x, 1);
});

test("tradeRosters undoes the trade from the rosters just after it", () => {
  const rosters = tradeRosters({
    at: 10,
    tradeId: "t1",
    kind: "trade",
    rosters: new Map([
      [1, ["a", "d"]],
      [2, ["b", "x"]],
      [3, ["c"]],
    ]),
    move: { at: 10, tradeId: "t1", adds: [["d", 1], ["x", 2]], drops: [["d", 2], ["x", 1]] },
  });
  assert.deepEqual(rosters, [
    { rosterId: 1, before: ["a", "x"], after: ["a", "d"] },
    { rosterId: 2, before: ["b", "d"], after: ["b", "x"] },
  ]);
});
