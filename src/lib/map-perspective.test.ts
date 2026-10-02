import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAMERA,
  DEFAULT_SCENE,
  MAX_TILT,
  MIN_TILT,
  buildMapScene,
  clampTilt,
  isDefaultCamera,
  normalizeYaw,
  surfaceHeight,
} from "./map-perspective";

const aspect = (s: { view: { width: number; height: number } }) => s.view.width / s.view.height;

test("normalizeYaw folds any angle into (-180, 180]", () => {
  assert.equal(normalizeYaw(0), 0);
  assert.equal(normalizeYaw(360), 0);
  assert.equal(normalizeYaw(-90), -90);
  assert.equal(normalizeYaw(270), -90);
  assert.equal(normalizeYaw(180), 180);
  assert.equal(normalizeYaw(-180), 180);
  assert.equal(normalizeYaw(725), 5);
});

test("clampTilt keeps the camera between straight-ish down and near the horizon", () => {
  assert.equal(clampTilt(-20), MIN_TILT);
  assert.equal(clampTilt(200), MAX_TILT);
  assert.equal(clampTilt(40), 40);
});

test("a full turn is still the default view", () => {
  assert.ok(isDefaultCamera(DEFAULT_CAMERA));
  assert.ok(isDefaultCamera({ ...DEFAULT_CAMERA, yaw: 360 }));
  assert.ok(!isDefaultCamera({ ...DEFAULT_CAMERA, yaw: 10 }));
  assert.ok(!isDefaultCamera({ ...DEFAULT_CAMERA, tilt: 50 }));
  assert.equal(buildMapScene({ ...DEFAULT_CAMERA, yaw: 360 }), DEFAULT_SCENE);
});

test("every view keeps the opening view's aspect ratio, so the map never resizes on the page", () => {
  for (const camera of [
    { tilt: 32, yaw: 90 },
    { tilt: MIN_TILT, yaw: 45 },
    { tilt: MAX_TILT, yaw: -135 },
    { tilt: 50, yaw: 180 },
  ]) {
    assert.ok(Math.abs(aspect(buildMapScene(camera)) - aspect(DEFAULT_SCENE)) < 1e-9);
  }
});

test("projected points stay inside their scene's view", () => {
  const scene = buildMapScene({ tilt: 55, yaw: 120 });
  const { x, y, width, height } = scene.view;
  for (const d of [scene.outline, ...scene.wallLayers]) {
    for (const [, px, py] of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
      assert.ok(Number(px) >= x && Number(px) <= x + width);
      assert.ok(Number(py) >= y && Number(py) <= y + height);
    }
  }
});

test("depth runs from the near (south) edge to the far (north) edge, and turns with the map", () => {
  const scene = buildMapScene(DEFAULT_CAMERA);
  const miami = scene.depth(281, 186);
  const seattle = scene.depth(49, 17);
  assert.ok(miami < 0.15 && seattle > 0.85);
  const flipped = buildMapScene({ ...DEFAULT_CAMERA, yaw: 180 });
  assert.ok(flipped.depth(281, 186) > flipped.depth(49, 17));
});

test("the terrain rises where the real country does — Denver stands far above Miami and New Orleans", () => {
  const denver = surfaceHeight(126.14, 88.63);
  const miami = surfaceHeight(281, 186);
  const newOrleans = surfaceHeight(213, 166);
  assert.ok(denver > miami + 5, `Denver ${denver} vs Miami ${miami}`);
  assert.equal(miami, newOrleans);
});

test("terraces climb from the lowest band to the highest", () => {
  const scene = buildMapScene(DEFAULT_CAMERA);
  assert.ok(scene.terraces.length >= 5);
  for (const t of scene.terraces) {
    assert.ok(t.walls.length >= 1);
    assert.ok(t.top.length > 0);
  }
});
