import test from "node:test";
import assert from "node:assert/strict";
import { fitMap, HORIZON_SHARE, screenAt } from "./grid-floor";

const view = { width: 1440, height: 900 };

test("screenAt puts the floor's hinge on the horizon, and spreads the floor out toward you", () => {
  const [x, y] = screenAt(1.5 * view.width, 0, view);
  assert.equal(x, view.width / 2);
  assert.ok(Math.abs(y - view.height * HORIZON_SHARE) < 1e-9);
  let [lastY, lastSpread] = [y, 0];
  for (const d of [50, 150, 300]) {
    const [, yd] = screenAt(1.5 * view.width, d, view);
    const spread = screenAt(1.5 * view.width + 100, d, view)[0] - view.width / 2;
    assert.ok(yd > lastY && spread > lastSpread);
    [lastY, lastSpread] = [yd, spread];
  }
});

test("fitMap lays the map as large as fits on the screen, its far edge on the horizon", () => {
  const square = [0, 0, 100, 0, 100, 60, 0, 60];
  const fit = fitMap(square, view, 16, 32);
  const corners = [[0, 0], [100, 0], [100, 60], [0, 60]].map(([x, y]) => screenAt(fit.u + fit.k * x, fit.d + fit.k * y, view));
  for (const [x, y] of corners) assert.ok(x >= 16 - 1e-6 && x <= view.width - 16 + 1e-6 && y <= view.height - 32 + 1e-6);
  // The far edge is on the horizon, and across the middle of the screen.
  assert.ok(Math.abs(corners[0][1] - view.height * HORIZON_SHARE) < 1e-6);
  assert.ok(Math.abs((corners[0][0] + corners[1][0]) / 2 - view.width / 2) < 1e-6);
  // Any bigger and it wouldn't fit.
  const near = Math.max(...corners.map(([x, y]) => Math.max(16 - x, x - (view.width - 16), y - (view.height - 32))));
  assert.ok(near > -0.5);
});
