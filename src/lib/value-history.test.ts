import test from "node:test";
import assert from "node:assert/strict";
import { ValueHistory, valueOn, withArchivedPicks, withCurrentValues } from "./value-history";
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

test("withArchivedPicks adds a pick it hasn't got, its values drawn straight between the dates read, up to its draft", () => {
  const day = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const from = day("2026-01-01");
  const base: ValueHistory = { updatedAt: null, from, step: 7, players: { x: { n: "2027 Mid 1st", p: "RDP", t: null, sf: Array(30).fill(5000), q: Array(30).fill(4000) } } };
  const brought = withArchivedPicks(base, {
    "2026 Mid 1st": { "2026-01-01": 4864, "2026-02-01": 4786, "2026-03-01": 4680 },
    "2027 Mid 1st": { "2026-01-01": 1 },
  });
  const pick = Object.values(brought.players).find((s) => s.n === "2026 Mid 1st")!;
  assert.equal(pick.p, "RDP");
  assert.equal(valueOn(brought, pick, true, from), 4864);
  // Two weeks into January: two weeks of the way to February's.
  assert.equal(valueOn(brought, pick, true, from + 14), Math.round(4864 + ((4786 - 4864) * 14) / 31));
  // After the last date read, held to the draft (May 1), then nothing; no 1QB values.
  assert.equal(valueOn(brought, pick, true, day("2026-04-29")), 4680);
  assert.equal(valueOn(brought, pick, true, day("2026-05-07")), null);
  assert.equal(valueOn(brought, pick, false, from), null);
  // A pick it has already is left alone.
  assert.equal(Object.values(brought.players).filter((s) => s.n === "2027 Mid 1st").length, 1);
  assert.equal(brought.players.x.sf[0], 5000);
});
