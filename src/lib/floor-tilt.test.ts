import test from "node:test";
import assert from "node:assert/strict";
import { createFloorTiltStore, MOST_FIELDS_TILT, tiltFor } from "./floor-tilt";
import { FLOOR_TILT, floorY, HORIZON_SHARE } from "./grid-room";

test("the more fields, the more the floor's looked down on — as it lies for one, never past the most", () => {
  assert.equal(tiltFor(0), FLOOR_TILT);
  assert.equal(tiltFor(1), FLOOR_TILT);
  assert.equal(tiltFor(9), MOST_FIELDS_TILT);
  assert.equal(tiltFor(14), MOST_FIELDS_TILT);
  for (let n = 2; n <= 9; n++) assert.ok(tiltFor(n) < tiltFor(n - 1));
});

test("however far the floor's laid back, the horizon stays put — and a field farther back shows deeper", () => {
  const height = 900;
  for (const tilt of [FLOOR_TILT, 75, MOST_FIELDS_TILT]) assert.equal(floorY(0, height, HORIZON_SHARE, tilt), height * HORIZON_SHARE);
  const deep = (tilt: number) => floorY(200, height, HORIZON_SHARE, tilt) - floorY(150, height, HORIZON_SHARE, tilt);
  assert.ok(deep(MOST_FIELDS_TILT) > deep(FLOOR_TILT));
});

test("a tilt store tells those following it when it changes", () => {
  const store = createFloorTiltStore();
  let told = 0;
  const stop = store.subscribe(() => told++);
  store.set(75);
  store.set(75);
  assert.equal(store.get(), 75);
  assert.equal(told, 1);
  stop();
  store.set(70);
  assert.equal(told, 1);
});
