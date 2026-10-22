import test from "node:test";
import assert from "node:assert/strict";
import { ValueHistory, valueOn, withCurrentValues } from "./value-history";
import { PlayerValuesSnapshot } from "./player-values";

const history: ValueHistory = {
  updatedAt: null,
  from: 1000,
  step: 7,
  players: {
    "1": { n: "Star Back", p: "RB", t: "DET", sf: [8000, 8200], q: [7000, 7100] },
    "2": { n: "2027 Mid 1st", p: "RDP", t: null, sf: [5000, 5100], q: [4000, 4100] },
    "3": { n: "Retired Guy", p: "WR", t: null, sf: [3000, 2000], q: [2500, 1500] },
  },
};
const value = (name: string, position: string, sf: number, q: number) => ({
  name,
  position,
  team: null,
  age: null,
  values: { oneQBStandard: q, oneQBTep: q, superflexStandard: sf, superflexTep: sf },
});
const snapshot: PlayerValuesSnapshot = {
  updatedAt: null,
  source: "keeptradecut",
  dynasty: [value("Star Back", "RB", 8650, 7400), value("2027 Mid 1st", "RDP", 5300, 4200), value("Star Back", "WR", 1, 1)],
  fantasy: [],
};

test("withCurrentValues brings every series up to today, today's point the values list's own", () => {
  // Two weeks past the history's last point.
  const today = 1000 + 7 * 3 + 2;
  const brought = withCurrentValues(history, snapshot, today);
  assert.equal(valueOn(brought, brought.players["1"], true, today), 8650);
  assert.equal(valueOn(brought, brought.players["1"], false, today), 7400);
  assert.equal(valueOn(brought, brought.players["2"], true, today), 5300);
  // Not on the list any more: its last value carried on.
  assert.equal(valueOn(brought, brought.players["3"], true, today), 2000);
  // The weeks between carried on from the last point; the past untouched.
  assert.deepEqual(brought.players["1"].sf, [8000, 8200, 8200, 8650]);
  assert.deepEqual(history.players["1"].sf, [8000, 8200]);
  // Today within the history: only today's point changes.
  assert.deepEqual(withCurrentValues(history, snapshot, 1008).players["1"].sf, [8000, 8650]);
});
