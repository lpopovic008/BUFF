import test from "node:test";
import assert from "node:assert/strict";
import { floorAt, frameOn, HORIZON_SHARE, screenAt, tourStops } from "./grid-floor";

const view = { width: 1440, height: 900 };

test("floorAt finds no floor at or over the horizon, and the hinge just under it", () => {
  assert.equal(floorAt(720, view.height * HORIZON_SHARE, view), null);
  assert.equal(floorAt(720, 100, view), null);
  const hinge = floorAt(720, view.height * HORIZON_SHARE + 0.01, view)!;
  assert.ok(hinge.d < 0.1);
  assert.ok(Math.abs(hinge.scale - 1) < 1e-3);
  // The screen's middle is the floor's middle: a screen's width in from its left edge, and half another.
  assert.ok(Math.abs(hinge.u - 1.5 * view.width) < 1e-6);
});

test("floorAt and screenAt undo each other, the floor magnified more toward you", () => {
  let last = 0;
  for (const [x, y] of [[300, 620], [720, 700], [1100, 800], [40, 890]]) {
    const at = floorAt(x, y, view)!;
    const [sx, sy] = screenAt(at.u, at.d, view);
    assert.ok(Math.abs(sx - x) < 1e-6 && Math.abs(sy - y) < 1e-6);
    assert.ok(at.scale > last);
    last = at.scale;
  }
});

test("frameOn puts the world point on the floor point at its zoom", () => {
  const f = frameOn(100, 50, 2000, 300, 1.5);
  assert.equal(f.x + 100 * f.zoom, 2000);
  assert.equal(f.y + 50 * f.zoom, 300);
});

test("tourStops visits every game by kickoff, ties by id", () => {
  const g = (id: string, kickoff: string) => ({ id, kickoff });
  const games = [g("b", "2026-10-25T17:00:00Z"), g("a", "2026-10-25T17:00:00Z"), g("c", "2026-10-25T13:00:00Z")];
  assert.deepEqual(tourStops(games).map((s) => s.id), ["c", "a", "b"]);
});
