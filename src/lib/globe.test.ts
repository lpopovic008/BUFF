import test from "node:test";
import assert from "node:assert/strict";
import { HOME_CAMERA } from "./grid-room";
import { fitGlobe, GLOBE_LAT, GLOBE_LON, GLOBE_MAX_ZOOM, globeFacingCamera, globeLine, globePoint, globeStemTip, globeView, keepGlobe } from "./globe";

const place = fitGlobe({ width: 1440, height: 900, share: 0.56, centerX: 720, bottom: 900 });

test("the globe stands in the middle of the floor, under the horizon, over the floor", () => {
  const view = globeView(place, HOME_CAMERA);
  assert.ok(Math.abs(view.cx - 720) < 1e-6);
  assert.ok(view.cy - view.R > 900 * 0.56, "its top under the horizon");
  assert.ok(view.cy + view.R < view.spot[1], "floating over the spot it stands over");
  assert.ok(view.spot[1] < 900);
});

test("seen a little from above: what it faces is up from its middle, facing you, and its stems stand up off it", () => {
  const view = globeView(place, HOME_CAMERA);
  const [x, y, facing] = globePoint(view, GLOBE_LON, GLOBE_LAT);
  assert.ok(Math.abs(x - view.cx) < 1e-6);
  assert.ok(y < view.cy);
  assert.ok(facing > 0.8);
  const tip = globeStemTip(view, GLOBE_LON, GLOBE_LAT, 40);
  assert.ok(tip[1] < y - 10, "a stem goes up the screen");
  // The far side of the world isn't on its near side.
  assert.ok(globePoint(view, GLOBE_LON + 180, -GLOBE_LAT)[2] < 0);
});

test("it turns only so far, never round to the eastern hemisphere, and zooms only so far", () => {
  const kept = keepGlobe({ zoom: 99, x: 200, d: -200 });
  assert.equal(kept.zoom, GLOBE_MAX_ZOOM);
  assert.ok(GLOBE_LON + kept.x < 0, "still facing the western hemisphere");
  const facing = globeFacingCamera(-74, 41, 1.5);
  assert.deepEqual([GLOBE_LON + facing.x, GLOBE_LAT + facing.d, facing.zoom], [-74, 41, 1.5]);
});

test("a line round the back is cut off at the globe's edge", () => {
  const view = globeView(place, HOME_CAMERA);
  // Along the equator from the middle of the US's longitude round to the far side.
  const pts = [];
  for (let lon = -96; lon <= 84; lon += 5) pts.push(lon, 0);
  const d = globeLine(view, pts, false);
  assert.equal((d.match(/M/g) ?? []).length, 1);
  const last = d.split("L").at(-1)!.split(",").map(Number);
  assert.ok(Math.abs(Math.hypot(last[0] - view.cx, last[1] - view.cy) - view.R) < 0.5, "it ends on the edge");
  assert.equal(globeLine(view, [84, 0, 90, 10, 100, 0], false), "", "nothing of the far side");
});
