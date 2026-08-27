import test from "node:test";
import assert from "node:assert/strict";
import { draftPool, draftPoolKey, roundForPick, teamForPick } from "./draft-sim";
import { PlayerValuesSnapshot } from "./player-values";

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

test("draftPool sorts by the selected mode's value, highest first, without mutating the snapshot", () => {
  const snapshot: PlayerValuesSnapshot = {
    updatedAt: null,
    source: "keeptradecut",
    dynasty: [],
    fantasy: [
      { name: "Low OneQB High SF", position: "QB", team: "AAA", age: 25, values: { oneQBStandard: 10, oneQBTep: 10, superflexStandard: 90, superflexTep: 90 } },
      { name: "High OneQB Low SF", position: "RB", team: "BBB", age: 24, values: { oneQBStandard: 80, oneQBTep: 80, superflexStandard: 20, superflexTep: 20 } },
    ],
  };
  const original = [...snapshot.fantasy];

  const byOneQB = draftPool(snapshot, "fantasy", "oneQB");
  assert.deepEqual(byOneQB.map((p) => p.name), ["High OneQB Low SF", "Low OneQB High SF"]);

  const bySuperflex = draftPool(snapshot, "fantasy", "superflex");
  assert.deepEqual(bySuperflex.map((p) => p.name), ["Low OneQB High SF", "High OneQB Low SF"]);

  assert.deepEqual(snapshot.fantasy, original);
});

test("draftPoolKey combines position and name for a stable, unique-enough key", () => {
  const p = { name: "Ja'Marr Chase", position: "WR", team: "CIN", age: 24, values: { oneQBStandard: 0, oneQBTep: 0, superflexStandard: 0, superflexTep: 0 } };
  assert.equal(draftPoolKey(p), "WR-Ja'Marr Chase");
});
