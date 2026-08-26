import test from "node:test";
import assert from "node:assert/strict";
import { clamp, gaugeDeg, jitterCityDots, ledClass, heartbeatTile, formClass } from "./warroom-math";

test("jitterCityDots looks positions up by team code, not by display city name", () => {
  const cityPos = {
    BUF: { pos: [260, 59] as [number, number], city: "Orchard Park, NY" },
    SF: { pos: [7, 88] as [number, number], city: "Santa Clara, CA" },
  };
  const dots = jitterCityDots(
    [
      { name: "Josh Allen", team: "BUF" },
      { name: "Brock Purdy", team: "SF" },
      { name: "Free agent", team: null },
    ],
    cityPos
  );
  assert.equal(dots.length, 2);
  assert.equal(dots[0].x, 260);
  assert.equal(dots[0].y, 59);
  assert.equal(dots[0].city, "Orchard Park, NY");
  assert.equal(dots[1].x, 7);
  assert.equal(dots[1].y, 88);
});

test("jitterCityDots spreads players sharing a stadium apart instead of stacking them", () => {
  const cityPos = { BUF: { pos: [260, 59] as [number, number], city: "Orchard Park, NY" } };
  const dots = jitterCityDots(
    [
      { name: "A", team: "BUF" },
      { name: "B", team: "BUF" },
    ],
    cityPos
  );
  assert.notEqual(dots[0].x, dots[1].x);
});

test("gaugeDeg maps 0/50/100 onto the dial's 135deg-405deg sweep", () => {
  assert.equal(gaugeDeg(0), 135);
  assert.equal(gaugeDeg(50), 270);
  assert.equal(gaugeDeg(100), 405);
});

test("ledClass reads exceeding/on-pace/short against a player's own season average", () => {
  assert.equal(ledClass(20, 25), "good"); // 1.25x
  assert.equal(ledClass(20, 20), "warn"); // 1.0x
  assert.equal(ledClass(20, 10), "critical"); // 0.5x
  assert.equal(ledClass(0, 5), "warn"); // no history yet -> neutral, not a divide-by-zero crash
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
