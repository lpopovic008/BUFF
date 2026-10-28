import test from "node:test";
import assert from "node:assert/strict";
import { floorDepth, floorY, GRID_PX, gridColumns, gridRows, HORIZON_SHARE, lowestGridLine, nearestRow } from "./grid-room";

test("floorY runs the floor back without end to the horizon, its lines ever further apart toward you", () => {
  const horizon = 900 * HORIZON_SHARE;
  assert.ok(floorY(0, 900) > horizon);
  assert.ok(floorY(-1e7, 900) - horizon < 0.1);
  let [last, gap] = [floorY(-5 * GRID_PX, 900), 0];
  for (let n = -4; n <= 4; n++) {
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

test("gridRows runs from far back by the horizon down to the screen's bottom, its last the lowest grid line", () => {
  const rows = gridRows(852);
  assert.ok(rows[0] > 852 * HORIZON_SHARE && rows[0] - 852 * HORIZON_SHARE < 10);
  assert.equal(rows.at(-1), lowestGridLine(852));
  assert.ok(rows.at(-1)! < 852);
  assert.ok(rows.every((y, i) => i === 0 || y > rows[i - 1]));
});

test("nearestRow finds the grid line closest to a point, above or below it", () => {
  const rows = gridRows(852);
  const [a, b] = [rows[3], rows[4]];
  assert.equal(nearestRow(852, a + (b - a) * 0.4), a);
  assert.equal(nearestRow(852, a + (b - a) * 0.6), b);
  assert.equal(nearestRow(852, 100), 852 * HORIZON_SHARE);
});

test("the horizon sits short of the middle", () => {
  assert.ok(HORIZON_SHARE > 0.5 && HORIZON_SHARE < 0.6);
});

test("floorDepth undoes floorY", () => {
  for (const d of [-640, 0, 64, 200, 300]) assert.ok(Math.abs(floorDepth(floorY(d, 900), 900) - d) < 1e-6);
});

test("gridColumns run from the horizon's middle to the bottom, mirrored about it, none down it", () => {
  const lines = gridColumns(1440, 900);
  const mid = 720;
  assert.ok(lines.every((l) => l.x1 === mid && l.y1 === 900 * HORIZON_SHARE && l.y2 === 900));
  assert.ok(lines.every((l) => Math.abs(l.x2 - mid) > 1));
  const left = lines.filter((l) => l.x2 < mid).map((l) => mid - l.x2).sort((p, q) => p - q);
  const right = lines.filter((l) => l.x2 > mid).map((l) => l.x2 - mid).sort((p, q) => p - q);
  assert.equal(left.length, right.length);
  left.forEach((x, i) => assert.ok(Math.abs(x - right[i]) < 1e-6));
});
