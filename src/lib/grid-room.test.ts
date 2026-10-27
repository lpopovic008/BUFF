import test from "node:test";
import assert from "node:assert/strict";
import { floorY, GRID_PX, gridRows, HORIZON_SHARE, lowestGridLine, nearestRow, PHONE_HORIZON_SHARE } from "./grid-room";

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

test("a phone's horizon sits nearer the middle, and its rows follow it", () => {
  assert.equal(floorY(0, 852, PHONE_HORIZON_SHARE), 852 * PHONE_HORIZON_SHARE);
  assert.ok(PHONE_HORIZON_SHARE > 0.5 && PHONE_HORIZON_SHARE < HORIZON_SHARE);
  assert.equal(gridRows(852, PHONE_HORIZON_SHARE)[0], 852 * PHONE_HORIZON_SHARE);
  assert.ok(lowestGridLine(852, PHONE_HORIZON_SHARE) < 852);
});
