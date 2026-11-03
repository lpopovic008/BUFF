import test from "node:test";
import assert from "node:assert/strict";
import { fitFloorMap, MAP_BOUNDS } from "./floor-map";
import { floorDetailLoaded, floorDetailWanted, floorMapDetailPaths, loadFloorDetail } from "./floor-map-detail";
import { gridRows } from "./grid-room";

const rows = gridRows(900);
const desk = fitFloorMap({ width: 1440, height: 900, centerX: 720, bottom: 885, farthest: rows.at(-3)!, maxWidth: 1400 });
const points = (d: string) => (d.match(/[ML]/g) ?? []).length;

test("finer detail is wanted the further the floor's zoomed in", () => {
  assert.equal(floorDetailWanted(1), 0);
  assert.equal(floorDetailWanted(1.49), 0);
  assert.equal(floorDetailWanted(1.5), 1);
  assert.equal(floorDetailWanted(3), 2);
  assert.equal(floorDetailWanted(6), 2);
});

test("the plain map until the finer levels load, then the finer ones", async () => {
  const plain = floorMapDetailPaths(desk, 2, ["IL"]);
  assert.ok(points(plain.outline) > 50);
  assert.equal(plain.states.length, 1);
  await loadFloorDetail();
  assert.equal(floorDetailLoaded(), 3);
  const fine = floorMapDetailPaths(desk, 2, ["IL"]);
  assert.ok(points(fine.states[0]) > points(plain.states[0]));
});

test("zoomed in, what's off the screen isn't drawn", async () => {
  await loadFloorDetail();
  const whole = floorMapDetailPaths(desk, 2, []);
  // Zoomed in on the map's middle: most of the coast is off the screen.
  const mid: [number, number] = [desk.across, desk.nearDepth - ((MAP_BOUNDS.maxY - MAP_BOUNDS.minY) * desk.k) / 2];
  const zoom = 5;
  const close = floorMapDetailPaths({ ...desk, camera: { zoom, x: mid[0] * (1 - zoom), d: mid[1] * (1 - zoom) } }, 2, []);
  assert.ok(points(close.outline) < points(whole.outline) / 2);
  assert.ok(points(close.lines) > 0);
});
