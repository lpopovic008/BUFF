import test from "node:test";
import assert from "node:assert/strict";
import { fitFloorMap, floorMapPath, floorMapPoint, floorMapTop, MAP_BOUNDS } from "./floor-map";
import { gridRows, PHONE_HORIZON_SHARE } from "./grid-room";

const midX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2;
const deskRows = gridRows(900);
const desk = fitFloorMap({ width: 1440, height: 900, centerX: 720, bottom: 885, farthest: deskRows.at(-3)!, maxWidth: 1400 });
const phoneRows = gridRows(852, PHONE_HORIZON_SHARE);
const phone = fitFloorMap({ width: 393, height: 852, share: PHONE_HORIZON_SHARE, centerX: 196.5, bottom: 780, farthest: phoneRows.at(-3)!, maxWidth: 361 });

test("the map reaches back to the line it's given, and no nearer than the bottom", () => {
  for (const [fit, rows, bottom] of [[desk, deskRows, 885], [phone, phoneRows, 780]] as const) {
    assert.ok(floorMapTop(fit) >= rows.at(-3)! - 1e-6);
    assert.ok(floorMapPoint(fit, midX, MAP_BOUNDS.maxY)[1] <= bottom + 1e-6);
  }
  // Room to spare in width on a wide screen: as deep as it may go, its near edge on the bottom.
  assert.ok(Math.abs(floorMapTop(desk) - deskRows.at(-3)!) < 1);
  assert.ok(Math.abs(floorMapPoint(desk, midX, MAP_BOUNDS.maxY)[1] - 885) < 1e-6);
});

test("the map keeps within the width it's given, centred where it's asked", () => {
  const near = (fit: typeof phone) => {
    const [l] = floorMapPoint(fit, MAP_BOUNDS.minX, MAP_BOUNDS.maxY);
    const [r] = floorMapPoint(fit, MAP_BOUNDS.maxX, MAP_BOUNDS.maxY);
    return r - l;
  };
  assert.ok(near(phone) <= 361 + 1e-6);
  assert.ok(Math.abs(floorMapPoint(desk, midX, MAP_BOUNDS.maxY)[0] - 720) < 1e-6);
});

test("on a narrow screen the map sits back from the bottom to be bigger than it could be at it", () => {
  const atBottom = fitFloorMap({ width: 393, height: 852, share: PHONE_HORIZON_SHARE, centerX: 196.5, bottom: 780, farthest: 780 - 1, maxWidth: 361 });
  assert.ok(phone.k > 0);
  assert.ok(floorMapPoint(phone, midX, MAP_BOUNDS.maxY)[1] < 780);
  assert.ok(atBottom.k < phone.k);
});

test("floorMapPath lays every point of a path on the floor", () => {
  const [x1, y1] = floorMapPoint(desk, 10, 20);
  const [x2, y2] = floorMapPoint(desk, 30, 40);
  assert.equal(floorMapPath(desk, "M10,20L30,40Z"), `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}Z`);
});
