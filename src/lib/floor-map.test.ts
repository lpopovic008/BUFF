import test from "node:test";
import assert from "node:assert/strict";
import { fitFloorMap, floorMapPath, floorMapPoint, floorMapTop, MAP_BOUNDS, MIN_FAR_SCALE } from "./floor-map";
import { PHONE_HORIZON_SHARE } from "./grid-room";

const desk = fitFloorMap({ width: 1440, height: 900, centerX: 480, bottom: 885, maxWidth: 900 });

test("the map's near edge lies on the bottom it's given, its middle across where it's asked", () => {
  const midX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2;
  const [x, y] = floorMapPoint(desk, midX, MAP_BOUNDS.maxY);
  assert.ok(Math.abs(y - 885) < 1e-6);
  assert.ok(Math.abs(x - 480) < 1e-6);
});

test("the map's far edge shows at no less than MIN_FAR_SCALE of its near edge's", () => {
  for (const fit of [desk, fitFloorMap({ width: 2560, height: 1440, centerX: 900, bottom: 1425, maxWidth: 1600 })]) {
    const [, , near] = floorMapPoint(fit, 0, MAP_BOUNDS.maxY);
    const [, , far] = floorMapPoint(fit, 0, MAP_BOUNDS.minY);
    assert.ok(far / near >= MIN_FAR_SCALE - 1e-9);
  }
});

test("a narrow screen keeps the map within the width it's given", () => {
  const phone = fitFloorMap({ width: 393, height: 852, share: PHONE_HORIZON_SHARE, centerX: 196.5, bottom: 780, maxWidth: 361 });
  const [left] = floorMapPoint(phone, MAP_BOUNDS.minX, MAP_BOUNDS.maxY);
  const [right] = floorMapPoint(phone, MAP_BOUNDS.maxX, MAP_BOUNDS.maxY);
  assert.ok(right - left <= 361 + 1e-6);
  assert.ok(floorMapTop(phone) < 780 && floorMapTop(phone) > 852 * PHONE_HORIZON_SHARE);
});

test("floorMapPath lays every point of a path on the floor", () => {
  const path = floorMapPath(desk, "M10,20L30,40Z");
  const [x1, y1] = floorMapPoint(desk, 10, 20);
  assert.equal(path, `M${x1.toFixed(1)},${y1.toFixed(1)}L${floorMapPoint(desk, 30, 40)[0].toFixed(1)},${floorMapPoint(desk, 30, 40)[1].toFixed(1)}Z`);
});
