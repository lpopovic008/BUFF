import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAMERA,
  DEFAULT_SCALES,
  DEFAULT_SCENE,
  MAP_ASPECT,
  MAX_TILT,
  MAX_ZOOM,
  MIN_TILT,
  MIN_ZOOM,
  addMapDetail,
  buildMapScene,
  buildSlabPaths,
  buildStatesPath,
  clampTilt,
  clampZoom,
  detailLevelFor,
  insideUS,
  isDefaultCamera,
  normalizeYaw,
  unproject,
} from "./map-perspective";
import { US_DETAIL_LEVELS } from "./us-detail";
import { US_STATE_SHAPES } from "./us-states";
import { TEAM_CITIES } from "./warroom-team-cities";

const aspect = (s: { view: { width: number; height: number } }) => s.view.width / s.view.height;
const center = (s: { view: { x: number; y: number; width: number; height: number } }) => [
  s.view.x + s.view.width / 2,
  s.view.y + s.view.height / 2,
];

test("normalizeYaw folds any angle into (-180, 180]", () => {
  assert.equal(normalizeYaw(0), 0);
  assert.equal(normalizeYaw(360), 0);
  assert.equal(normalizeYaw(-90), -90);
  assert.equal(normalizeYaw(270), -90);
  assert.equal(normalizeYaw(180), 180);
  assert.equal(normalizeYaw(-180), 180);
  assert.equal(normalizeYaw(725), 5);
});

test("tilt and zoom are held to their ranges", () => {
  assert.equal(clampTilt(-20), MIN_TILT);
  assert.equal(clampTilt(200), MAX_TILT);
  assert.equal(clampTilt(40), 40);
  assert.equal(clampZoom(0.1), MIN_ZOOM);
  assert.equal(clampZoom(50), MAX_ZOOM);
  assert.equal(clampZoom(2), 2);
});

test("a full turn at the opening zoom is still the default view; any zoom isn't", () => {
  assert.ok(isDefaultCamera(DEFAULT_CAMERA));
  assert.ok(isDefaultCamera({ ...DEFAULT_CAMERA, yaw: 360 }));
  assert.ok(!isDefaultCamera({ ...DEFAULT_CAMERA, yaw: 10 }));
  assert.ok(!isDefaultCamera({ ...DEFAULT_CAMERA, tilt: 50 }));
  assert.ok(!isDefaultCamera({ ...DEFAULT_CAMERA, zoom: 1.5 }));
  assert.ok(!isDefaultCamera({ ...DEFAULT_CAMERA, tx: 250 }));
});

test("turning the map never re-fits it: same size at the same zoom, always centered on the camera's target", () => {
  for (const camera of [
    { tilt: 32, yaw: 90, zoom: 1, tx: 160, ty: 100 },
    { tilt: MIN_TILT, yaw: 45, zoom: 1, tx: 280, ty: 180 },
    { tilt: MAX_TILT, yaw: -135, zoom: 1, tx: 40, ty: 30 },
  ]) {
    const scene = buildMapScene(camera);
    assert.ok(Math.abs(scene.view.width - DEFAULT_SCENE.view.width) < 1e-9);
    assert.ok(Math.abs(scene.view.height - DEFAULT_SCENE.view.height) < 1e-9);
    const [cx, cy] = center(scene);
    const [mx, my] = scene.project(camera.tx, camera.ty);
    assert.ok(Math.abs(cx - mx) < 1e-9 && Math.abs(cy - my) < 1e-9);
  }
});

test("unproject finds the map point under any screen point, at any angle", () => {
  for (const camera of [DEFAULT_CAMERA, { ...DEFAULT_CAMERA, tilt: 60, yaw: 130 }, { ...DEFAULT_CAMERA, tilt: MIN_TILT, yaw: -70 }]) {
    const scene = buildMapScene(camera);
    for (const [x, y] of [[281, 186], [49, 17], [160, 100], [0, 200]]) {
      const [sx, sy] = scene.project(x, y);
      const [ux, uy] = unproject(camera, sx, sy);
      assert.ok(Math.abs(ux - x) < 1e-6 && Math.abs(uy - y) < 1e-6, `${x},${y} -> ${ux},${uy}`);
    }
  }
});

test("zooming in shrinks the view about the same center, keeping the aspect", () => {
  const at1 = buildMapScene({ ...DEFAULT_CAMERA, zoom: 1 });
  const at2 = buildMapScene({ ...DEFAULT_CAMERA, zoom: 2 });
  assert.ok(Math.abs(at2.view.width * 2 - at1.view.width) < 1e-9);
  assert.deepEqual(center(at2).map((n) => n.toFixed(6)), center(at1).map((n) => n.toFixed(6)));
  assert.ok(Math.abs(aspect(at2) - MAP_ASPECT) < 1e-9);
});

test("the opening view shows the whole country", () => {
  const { view } = DEFAULT_SCENE;
  const slab = buildSlabPaths(DEFAULT_CAMERA);
  for (const d of [slab.outline, slab.wall]) {
    for (const [, px, py] of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
      assert.ok(Number(px) >= view.x && Number(px) <= view.x + view.width);
      assert.ok(Number(py) >= view.y && Number(py) <= view.y + view.height);
    }
  }
});

test("perspective magnifies the near (south) edge and shrinks the far (north) one, and turns with the map", () => {
  const scene = buildMapScene(DEFAULT_CAMERA);
  const miami = scene.scaleAt(281, 186);
  const seattle = scene.scaleAt(49, 17);
  assert.ok(miami > DEFAULT_SCALES.center && seattle < DEFAULT_SCALES.center);
  assert.ok(DEFAULT_SCALES.near > DEFAULT_SCALES.center && DEFAULT_SCALES.far < DEFAULT_SCALES.center);
  const flipped = buildMapScene({ ...DEFAULT_CAMERA, yaw: 180 });
  assert.ok(flipped.scaleAt(281, 186) < flipped.scaleAt(49, 17));
});

test("insideUS knows land from sea and from abroad", () => {
  assert.ok(insideUS(126, 88)); // Denver
  assert.ok(insideUS(160, 100));
  assert.ok(!insideUS(5, 195)); // the Pacific, off Mexico
  assert.ok(!insideUS(80, 150)); // just south of the border below Arizona
});

test("every NFL stadium's state has a shape to light up", () => {
  for (const { city } of Object.values(TEAM_CITIES)) {
    const state = city.split(", ").pop()!;
    assert.ok(US_STATE_SHAPES[state], city);
  }
});

test("buildStatesPath draws just the states asked for", () => {
  assert.equal(buildStatesPath(DEFAULT_CAMERA, new Set()), "");
  const one = buildStatesPath(DEFAULT_CAMERA, new Set(["CO"]));
  const two = buildStatesPath(DEFAULT_CAMERA, new Set(["CO", "TX"]));
  assert.ok(one.startsWith("M") && two.length > one.length);
});

test("the level of detail steps up as the map zooms in", () => {
  assert.equal(detailLevelFor(1), 0);
  assert.equal(detailLevelFor(1.49), 0);
  assert.equal(detailLevelFor(1.5), 1);
  assert.equal(detailLevelFor(3.4), 1);
  assert.equal(detailLevelFor(3.5), 2);
  assert.equal(detailLevelFor(MAX_ZOOM), 2);
});

test("finer levels draw more detailed coast and borders once loaded, and the base until then", () => {
  const base = buildSlabPaths(DEFAULT_CAMERA, 0);
  // Not loaded yet: asking for detail still draws the base.
  assert.equal(buildSlabPaths(DEFAULT_CAMERA, 2).outline, base.outline);
  addMapDetail(US_DETAIL_LEVELS);
  const mid = buildSlabPaths(DEFAULT_CAMERA, 1);
  const full = buildSlabPaths(DEFAULT_CAMERA, 2);
  assert.ok(base.outline.length < mid.outline.length && mid.outline.length < full.outline.length);
  assert.ok(base.stateLines.length < mid.stateLines.length && mid.stateLines.length < full.stateLines.length);
  for (const level of [1, 2]) {
    for (const { city } of Object.values(TEAM_CITIES)) {
      assert.ok(US_DETAIL_LEVELS[level - 1].states[city.split(", ").pop()!], `${city} at level ${level}`);
    }
    assert.notEqual(buildStatesPath(DEFAULT_CAMERA, new Set(["NY"]), level), "");
  }
});
