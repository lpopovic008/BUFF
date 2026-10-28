import test from "node:test";
import assert from "node:assert/strict";
import { fitFloorMap, floorMapPath, floorMapPoint, floorMapTop, MAP_BOUNDS } from "./floor-map";
import { US_SIMPLE_OUTLINE_PATH } from "./team-cities";
import { gridRows } from "./grid-room";

const midX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2;
const OUTLINE = [...US_SIMPLE_OUTLINE_PATH.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
const deskRows = gridRows(900);
const desk = fitFloorMap({ width: 1440, height: 900, centerX: 720, bottom: 885, farthest: deskRows.at(-3)!, maxWidth: 1400 });
const phoneRows = gridRows(852);
const phone = fitFloorMap({ width: 393, height: 852, centerX: 196.5, bottom: 780, farthest: phoneRows.at(-3)!, maxWidth: 361 });

test("the map's near edge is on the bottom, and it reaches back no further than the line it's given", () => {
  for (const [fit, rows, bottom] of [[desk, deskRows, 885], [phone, phoneRows, 780]] as const) {
    assert.ok(floorMapTop(fit) >= rows.at(-3)! - 1e-6);
    assert.ok(Math.abs(floorMapPoint(fit, midX, MAP_BOUNDS.maxY)[1] - bottom) < 1e-6);
  }
  // Room to spare in width on a wide screen: as deep as it may go.
  assert.ok(Math.abs(floorMapTop(desk) - deskRows.at(-3)!) < 1);
});

test("the map's land keeps within the width it's given, centred where it's asked", () => {
  const xs = (fit: typeof phone) => OUTLINE.map(([x, y]) => floorMapPoint(fit, x, y)[0]);
  assert.ok(Math.max(...xs(phone).map((x) => Math.abs(x - 196.5))) <= 361 / 2 + 1e-6);
  // As wide as that lets it be, on a narrow screen.
  assert.ok(Math.max(...xs(phone).map((x) => Math.abs(x - 196.5))) > 361 / 2 - 1);
  assert.ok(Math.abs(floorMapPoint(desk, midX, MAP_BOUNDS.maxY)[0] - 720) < 1e-6);
});

test("floorMapPath lays every point of a path on the floor", () => {
  const [x1, y1] = floorMapPoint(desk, 10, 20);
  const [x2, y2] = floorMapPoint(desk, 30, 40);
  assert.equal(floorMapPath(desk, "M10,20L30,40Z"), `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}Z`);
});
