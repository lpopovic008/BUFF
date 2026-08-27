import test from "node:test";
import assert from "node:assert/strict";
import { clamp, gaugeDeg, ledClass, heartbeatTile, formClass, slotLabel } from "./warroom-math";

test("gaugeDeg maps 0/50/100 onto the dial's 135deg-405deg sweep", () => {
  assert.equal(gaugeDeg(0), 135);
  assert.equal(gaugeDeg(50), 270);
  assert.equal(gaugeDeg(100), 405);
});

test("ledClass reads exceeding/on-pace/short against a player's expected points", () => {
  assert.equal(ledClass(20, 25, true), "good"); // 1.25x
  assert.equal(ledClass(20, 20, true), "warn"); // 1.0x
  assert.equal(ledClass(20, 10, true), "critical"); // 0.5x, game in progress
  assert.equal(ledClass(0, 5, true), "warn"); // no expectation set -> neutral, not a divide-by-zero crash
});

test("ledClass never reads critical before the player's game has started", () => {
  assert.equal(ledClass(20, 0, false), "warn"); // pregame: 0 actual vs a real projection isn't "behind" yet
  assert.equal(ledClass(20, 10, false), "warn"); // would be critical mid-game (0.5x), but hasStarted is false
  assert.equal(ledClass(20, 25, false), "good"); // already exceeding is still worth celebrating regardless
});

test("slotLabel abbreviates SUPER_FLEX to SF and leaves every other slot code as-is", () => {
  assert.equal(slotLabel("SUPER_FLEX"), "SF");
  assert.equal(slotLabel("QB"), "QB");
  assert.equal(slotLabel("FLEX"), "FLEX");
});

test("heartbeatTile starts and ends each tile on the baseline so two tiles loop seamlessly", () => {
  const tile = heartbeatTile(74, 100);
  assert.equal(tile[0][0], 0);
  assert.equal(tile[0][1], 15);
  assert.equal(tile.at(-1)![0], 100);
  assert.equal(tile.at(-1)![1], 15);
});

test("formClass buckets win% into the five heat colors", () => {
  assert.equal(formClass(0), "h1");
  assert.equal(formClass(50), "h3");
  assert.equal(formClass(100), "h5");
});

test("clamp", () => {
  assert.equal(clamp(150, 0, 100), 100);
  assert.equal(clamp(-10, 0, 100), 0);
  assert.equal(clamp(50, 0, 100), 50);
});
