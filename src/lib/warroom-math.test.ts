import test from "node:test";
import assert from "node:assert/strict";
import { abbreviateTeamName, clamp, gaugeDeg, jitterCityDots, ledClass, heartbeatTile, formClass, slotLabel } from "./warroom-math";

test("abbreviateTeamName keeps every label short and fixed-width-ish so scoreboard columns never spill", () => {
  assert.equal(abbreviateTeamName("Karan"), "KAR");
  assert.equal(abbreviateTeamName("Matt Ly"), "ML");
  assert.equal(abbreviateTeamName("Nabers in Paris"), "NIP");
  assert.equal(abbreviateTeamName("The Greatest Dynasty Team Ever"), "TGD");
  assert.equal(abbreviateTeamName(""), "");
});

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
