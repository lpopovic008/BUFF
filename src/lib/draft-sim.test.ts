import test from "node:test";
import assert from "node:assert/strict";
import { draftPool, draftPoolKey, roundForPick, teamForPick } from "./draft-sim";
import { AdpSnapshot } from "./player-adp";

test("teamForPick snakes back and forth across rounds", () => {
  // 4 teams: round 1 goes 1,2,3,4; round 2 reverses to 4,3,2,1; round 3 back to 1,2,3,4.
  const picks = Array.from({ length: 12 }, (_, i) => teamForPick(i, 4, "snake"));
  assert.deepEqual(picks, [1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4]);
});

test("teamForPick stays in the same order every round for a linear draft", () => {
  const picks = Array.from({ length: 8 }, (_, i) => teamForPick(i, 4, "linear"));
  assert.deepEqual(picks, [1, 2, 3, 4, 1, 2, 3, 4]);
});

test("roundForPick advances every `teams` picks", () => {
  assert.equal(roundForPick(0, 4), 1);
  assert.equal(roundForPick(3, 4), 1);
  assert.equal(roundForPick(4, 4), 2);
  assert.equal(roundForPick(11, 4), 3);
});

test("draftPool picks the right pre-sorted list for each of the four modes", () => {
  const snapshot: AdpSnapshot = {
    updatedAt: null,
    source: "mixed",
    dynastyOneQB: [{ name: "Dynasty OneQB Player", position: "QB", team: "AAA", adp: 1 }],
    dynastySuperflex: [{ name: "Dynasty Superflex Player", position: "QB", team: "AAA", adp: 1 }],
    fantasyOneQB: [{ name: "Fantasy OneQB Player", position: "RB", team: "BBB", adp: 1 }],
    fantasySuperflex: [{ name: "Fantasy Superflex Player", position: "QB", team: "BBB", adp: 1 }],
  };

  assert.equal(draftPool(snapshot, "dynasty", "oneQB")[0].name, "Dynasty OneQB Player");
  assert.equal(draftPool(snapshot, "dynasty", "superflex")[0].name, "Dynasty Superflex Player");
  assert.equal(draftPool(snapshot, "fantasy", "oneQB")[0].name, "Fantasy OneQB Player");
  assert.equal(draftPool(snapshot, "fantasy", "superflex")[0].name, "Fantasy Superflex Player");
});

test("draftPoolKey combines position and name for a stable, unique-enough key", () => {
  const p = { name: "Ja'Marr Chase", position: "WR", team: "CIN", adp: 1 };
  assert.equal(draftPoolKey(p), "WR-Ja'Marr Chase");
});
