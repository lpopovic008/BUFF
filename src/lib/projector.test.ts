import test from "node:test";
import assert from "node:assert/strict";
import { floorAt, GRID_PX, HOME_CAMERA } from "./grid-room";
import { fitProjector, keepMap, MAP_BOUNDS, MAP_MAX_ZOOM, mapPutting, projectorPoint, projectorUnder, projectorView } from "./projector";

const place = fitProjector({ width: 1440, height: 900, share: 0.56, centerX: 600, bottom: 900, maxWidth: 1000, highest: 200 });

test("the beam comes from a spot on the floor below the frame, which floats over the floor and fits where it's let", () => {
  const { source, frame } = place;
  // About where it was put: no more than half a square off it.
  const [put] = floorAt(600, source[1], 1440, 900, 0.56);
  const [is] = floorAt(source[0], source[1], 1440, 900, 0.56);
  assert.ok(Math.abs(put - is) <= GRID_PX / 2 + 1e-6, "about where it was put");
  assert.ok(source[1] > 900 * 0.56 && source[1] < 900, "the spot's on the floor");
  assert.ok(frame.top + frame.height < source[1], "the frame's over the spot");
  assert.ok(frame.top >= 200 - 1e-6 && frame.width <= 1000 + 1e-6);
  assert.ok(Math.abs(frame.left + frame.width / 2 - source[0]) < 1e-6);
});

test("the beam's spot is in the middle of a grid square: half a square from the lines either way", () => {
  for (const at of [place, fitProjector({ width: 393, height: 852, share: 0.56, centerX: 196.5, bottom: 790, maxWidth: 361, highest: 477 })]) {
    const [across, d] = floorAt(at.source[0], at.source[1], at.width, at.height, at.share);
    // Lines running back at half squares from the middle; lines across at whole squares back.
    assert.ok(Math.abs(across / GRID_PX - Math.round(across / GRID_PX)) < 1e-6, `${across}`);
    assert.ok(Math.abs(d / GRID_PX - 0.5 - Math.round(d / GRID_PX - 0.5)) < 1e-6, `${d}`);
  }
});

test("at home the whole map's in the frame", () => {
  const view = projectorView(place, HOME_CAMERA);
  for (const [x, y] of [
    [MAP_BOUNDS.minX, MAP_BOUNDS.minY],
    [MAP_BOUNDS.maxX, MAP_BOUNDS.maxY],
  ]) {
    const [sx, sy] = projectorPoint(view, x, y);
    assert.ok(sx >= view.frame.left && sx <= view.frame.left + view.frame.width);
    assert.ok(sy >= view.frame.top && sy <= view.frame.top + view.frame.height);
  }
});

test("a point taken hold of stays under the pointer as the map's zoomed", () => {
  const view = projectorView(place, HOME_CAMERA);
  const at: [number, number] = [view.frame.left + 200, view.frame.top + 120];
  const grab = projectorUnder(view, ...at);
  const zoomed = projectorView(place, mapPutting(place, grab, at, 2));
  const [x, y] = projectorPoint(zoomed, ...grab);
  assert.ok(Math.abs(x - at[0]) < 1e-6 && Math.abs(y - at[1]) < 1e-6);
});

test("it zooms only so far, and its middle stays on the map", () => {
  const kept = keepMap({ zoom: 99, x: 1e4, d: -1e4 });
  assert.equal(kept.zoom, MAP_MAX_ZOOM);
  assert.ok(Math.abs(kept.x) <= (MAP_BOUNDS.maxX - MAP_BOUNDS.minX) / 2);
  assert.equal(keepMap({ zoom: 0.2, x: 0, d: 0 }).zoom, 1);
});
