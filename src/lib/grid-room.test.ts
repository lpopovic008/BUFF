import test from "node:test";
import assert from "node:assert/strict";
import { floorDepth, floorY, GRID_PX, gridColumns, gridRows, HORIZON_SHARE, lowestGridLine, nearestRow } from "./grid-room";

test("floorY puts the hinge on the horizon and the floor's lines ever further apart toward you", () => {
  assert.equal(floorY(0, 900), 900 * HORIZON_SHARE);
  let [last, gap] = [floorY(0, 900), 0];
  for (let n = 1; n <= 5; n++) {
    const y = floorY(n * GRID_PX, 900);
    assert.ok(y - last > gap);
    [last, gap] = [y, y - last];
  }
});

test("lowestGridLine is the last grid line before the screen's bottom", () => {
  for (const height of [600, 800, 900, 1200]) {
    const y = lowestGridLine(height);
    assert.ok(y < height);
    const n = [...Array(20).keys()].find((i) => Math.abs(floorY(i * GRID_PX, height) - y) < 1e-9);
    assert.notEqual(n, undefined);
    assert.ok(floorY((n! + 1) * GRID_PX, height) >= height || floorY((n! + 1) * GRID_PX, height) < y);
  }
});

test("gridRows runs from the horizon down to the screen's bottom, its last the lowest grid line", () => {
  const rows = gridRows(852);
  assert.equal(rows[0], 852 * HORIZON_SHARE);
  assert.equal(rows.at(-1), lowestGridLine(852));
  assert.ok(rows.every((y, i) => i === 0 || y > rows[i - 1]));
});

test("nearestRow finds the grid line closest to a point, above or below it", () => {
  const rows = gridRows(852);
  const [a, b] = [rows[3], rows[4]];
  assert.equal(nearestRow(852, a + (b - a) * 0.4), a);
  assert.equal(nearestRow(852, a + (b - a) * 0.6), b);
  assert.equal(nearestRow(852, 100), 852 * HORIZON_SHARE);
});

test("the horizon sits short of the middle, and the rows follow it", () => {
  assert.ok(HORIZON_SHARE > 0.5);
  assert.equal(floorY(0, 852), 852 * HORIZON_SHARE);
  assert.equal(gridRows(852)[0], 852 * HORIZON_SHARE);
  assert.ok(lowestGridLine(852) < 852);
});

test("floorDepth undoes floorY", () => {
  for (const d of [0, 64, 200, 380]) assert.ok(Math.abs(floorDepth(floorY(d, 900), 900) - d) < 1e-9);
});

test("gridColumns run from the horizon to the bottom, mirrored about the middle, none down it", () => {
  const lines = gridColumns(1440, 900);
  assert.ok(lines.every((l) => l.y1 === 900 * HORIZON_SHARE && l.y2 === 900));
  const mid = 720;
  assert.ok(lines.every((l) => Math.abs(l.x1 - mid) >= GRID_PX / 2 - 1e-9));
  const left = lines.filter((l) => l.x1 < mid).map((l) => mid - l.x1).sort((p, q) => p - q);
  const right = lines.filter((l) => l.x1 > mid).map((l) => l.x1 - mid).sort((p, q) => p - q);
  assert.deepEqual(left, right);
  // Spreading out toward you.
  assert.ok(lines.every((l) => Math.abs(l.x2 - mid) > Math.abs(l.x1 - mid)));
});
