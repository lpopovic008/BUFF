import test from "node:test";
import assert from "node:assert/strict";
import { floorY, GRID_PX, gridRows, HORIZON_SHARE, lowestGridLine, rowAtOrAbove } from "./grid-room";

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

test("rowAtOrAbove finds the lowest grid line with room under it", () => {
  const rows = gridRows(852);
  assert.equal(rowAtOrAbove(852, 700), rows.filter((y) => y <= 700).at(-1));
  assert.equal(rowAtOrAbove(852, 0), 852 * HORIZON_SHARE);
});
