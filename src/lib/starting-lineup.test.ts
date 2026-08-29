import test from "node:test";
import assert from "node:assert/strict";
import { pickStartingLineup, REQUIRED_STARTER_MINIMUMS, MIN_START } from "./starting-lineup";

function p(key: string, position: string, projectedPoints: number) {
  return { key, position, projectedPoints };
}

test("REQUIRED_STARTER_MINIMUMS matches the spec: 1 QB, 2 RB, 2 WR, 1 TE", () => {
  assert.deepEqual(REQUIRED_STARTER_MINIMUMS, { QB: 1, RB: 2, WR: 2, TE: 1 });
  assert.equal(MIN_START, 6);
});

test("fills required minimums by best projected points within each position", () => {
  const roster = [
    p("QB-A", "QB", 300),
    p("QB-B", "QB", 250),
    p("RB-A", "RB", 200),
    p("RB-B", "RB", 180),
    p("RB-C", "RB", 150),
    p("WR-A", "WR", 210),
    p("WR-B", "WR", 190),
    p("WR-C", "WR", 100),
    p("TE-A", "TE", 120),
    p("TE-B", "TE", 90),
  ];
  const { starterKeys } = pickStartingLineup(roster, 6);
  assert.deepEqual(
    [...starterKeys].sort(),
    ["QB-A", "RB-A", "RB-B", "TE-A", "WR-A", "WR-B"].sort()
  );
});

test("fills slots above the minimums with the next-best players regardless of position (flex)", () => {
  const roster = [
    p("QB-A", "QB", 300),
    p("RB-A", "RB", 200),
    p("RB-B", "RB", 180),
    p("RB-C", "RB", 260), // best overall among non-minimum players — should grab the flex slot
    p("WR-A", "WR", 210),
    p("WR-B", "WR", 190),
    p("TE-A", "TE", 120),
  ];
  const { starterKeys, pointsTotal } = pickStartingLineup(roster, 7);
  assert.ok(starterKeys.has("RB-C"));
  assert.equal(starterKeys.size, 7);
  assert.equal(pointsTotal, 300 + 200 + 180 + 260 + 210 + 190 + 120);
});

test("never starts K/DST/IDP, even to fill a flex slot", () => {
  const roster = [
    p("QB-A", "QB", 300),
    p("RB-A", "RB", 200),
    p("RB-B", "RB", 180),
    p("WR-A", "WR", 210),
    p("WR-B", "WR", 190),
    p("TE-A", "TE", 120),
    p("K-A", "K", 999),
  ];
  const { starterKeys } = pickStartingLineup(roster, 7);
  assert.ok(!starterKeys.has("K-A"));
  assert.equal(starterKeys.size, 6); // no eligible 7th player available
});

test("degrades gracefully when a team is short on a required position", () => {
  const roster = [
    p("RB-A", "RB", 200),
    p("RB-B", "RB", 180),
    p("WR-A", "WR", 210),
    p("WR-B", "WR", 190),
    p("TE-A", "TE", 120),
    // no QB at all
  ];
  const { starterKeys } = pickStartingLineup(roster, 6);
  assert.equal(starterKeys.size, 5);
});
