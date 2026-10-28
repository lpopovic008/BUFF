import test from "node:test";
import assert from "node:assert/strict";
import { cameraBetween, cameraPutting, cameraShows, cameraUnder, MAX_ZOOM, pinchCamera, zoomCameraAt } from "./floor-camera";
import { floorAt, floorPoint, GRID_PX, gridColumns, gridRows, HOME_CAMERA, HORIZON_SHARE } from "./grid-room";

const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

test("a camera puts the floor's point where it's asked, and finds it there again", () => {
  const camera = cameraPutting([40, 120], [-10, 300], 2);
  assert.ok(near(cameraShows(camera, [40, 120]), [-10, 300]));
  assert.ok(near(cameraUnder(camera, [-10, 300]), [40, 120]));
  assert.equal(cameraPutting([0, 0], [0, 0], 100).zoom, MAX_ZOOM);
});

test("zooming keeps what's under its point there", () => {
  const camera = zoomCameraAt(cameraPutting([5, 50], [20, 200], 1.5), 2, [20, 200]);
  assert.equal(camera.zoom, 3);
  assert.ok(near(cameraShows(camera, [5, 50]), [20, 200]));
});

test("a pinch keeps both fingers' points under them", () => {
  const camera = pinchCamera([[0, 100], [50, 100]], [[10, 200], [110, 200]]);
  assert.equal(camera.zoom, 2);
  assert.ok(near(cameraShows(camera, [0, 100]), [10, 200]));
  assert.ok(near(cameraShows(camera, [50, 100]), [110, 200]));
});

test("a glide runs from one camera to the other", () => {
  const to = cameraPutting([3, 4], [100, 250], 1.6);
  assert.deepEqual(cameraBetween(HOME_CAMERA, to, 0), HOME_CAMERA);
  assert.ok(near(Object.values(cameraBetween(HOME_CAMERA, to, 1)), Object.values(to)));
});

test("floorAt undoes floorPoint", () => {
  const [x, y] = floorPoint(-80, 300, 393, 852);
  assert.ok(near(floorAt(x, y, 393, 852), [-80, 300]));
});

test("the grid moves with the floor, at home just where it lies", () => {
  assert.deepEqual(gridRows(900, HORIZON_SHARE, HOME_CAMERA), gridRows(900));
  // Slid a whole box back, or across, it's the same grid.
  const back = gridRows(900, HORIZON_SHARE, { zoom: 1, x: 0, d: GRID_PX });
  assert.deepEqual(back, gridRows(900));
  const across = gridColumns(1440, 900, HORIZON_SHARE, { zoom: 1, x: GRID_PX, d: 0 }).map((l) => l.x1);
  assert.ok(gridColumns(1440, 900).every((l) => across.some((x) => Math.abs(x - l.x1) < 1e-9) || Math.abs(l.x1 - 720) > 720 - GRID_PX));
  // Zoomed in, its rows further apart.
  const zoomed = gridRows(900, HORIZON_SHARE, { zoom: 2, x: 0, d: 0 });
  assert.ok(zoomed[1] > gridRows(900)[1]);
});
