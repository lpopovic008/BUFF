import test from "node:test";
import assert from "node:assert/strict";
import { layoutPillars, triangleRows } from "./roster-pillars";

const ROSTER = [9998, 2100, 7400, 450, 5600, null, 3300, 880, 6100, 1200, 300, 4100, 150, 2600, 990, 70, 3800, null, 1500, 5200, 640, 2900, 1100, 410, 8200];

test("a triangle of n needs the rows whose 1 + 2 + … first reaches n", () => {
  assert.deepEqual([0, 1, 2, 3, 6, 7, 21, 25, 28].map(triangleRows), [0, 1, 2, 2, 3, 4, 6, 7, 7]);
});

test("the most valuable stands alone in the back row, then rows of 2, 3, … by value", () => {
  const { pillars } = layoutPillars(ROSTER, 900);
  const rowSizes = new Map<number, number>();
  for (const p of pillars) rowSizes.set(p.row, (rowSizes.get(p.row) ?? 0) + 1);
  assert.deepEqual([...rowSizes.values()], [1, 2, 3, 4, 5, 6, 4]);
  assert.equal(ROSTER[pillars[0].index], 9998);
  // Everyone in a row is worth at least as much as everyone in the rows in front of it.
  for (const a of pillars) for (const b of pillars) if (a.row < b.row) assert.ok((ROSTER[a.index] ?? 0) >= (ROSTER[b.index] ?? 0));
});

test("pillars are as tall as their value, drawn back to front, and all fit the drawing", () => {
  for (const width of [327, 900]) {
    const { pillars, half, height } = layoutPillars(ROSTER, width);
    const byValue = [...pillars].sort((a, b) => (ROSTER[a.index] ?? 0) - (ROSTER[b.index] ?? 0));
    for (let i = 1; i < byValue.length; i++) assert.ok(byValue[i].height >= byValue[i - 1].height);
    for (let i = 1; i < pillars.length; i++) assert.ok(pillars[i].row >= pillars[i - 1].row);
    for (const p of pillars) {
      assert.ok(p.x - half >= 0 && p.x + half <= width, `pillar ${p.index} is off the side at ${width}`);
      assert.ok(p.topY - half / 2 >= 0 && p.topY + half / 2 + p.height <= height, `pillar ${p.index} is off the top or bottom at ${width}`);
    }
    // Every player drawn once.
    assert.deepEqual(pillars.map((p) => p.index).sort((a, b) => a - b), ROSTER.map((_, i) => i));
  }
});

test("a short last row takes the middle slots of its row, on the grid", () => {
  const { pillars } = layoutPillars(ROSTER, 900);
  const cell = pillars.find((p) => p.row === 2)!.x - pillars[0].x;
  // Row 7 has room for 7; its 4 sit in whole-cell slots around the middle, as a full row's would.
  const last = pillars.filter((p) => p.row === 7).map((p) => Math.round((p.x - 450) / Math.abs(cell)));
  for (const x of last) assert.ok(Math.abs(x) % 2 === 0, `slot ${x} is off the row's grid`);
  assert.equal(new Set(last).size, 4);
});

test("a one-pillar last row stands in the middle, and an empty roster draws nothing", () => {
  const { pillars } = layoutPillars([5, 4, 3, 2], 400);
  const last = pillars.filter((p) => p.row === 3);
  assert.equal(last.length, 1);
  assert.equal(last[0].x, 200);
  assert.deepEqual(layoutPillars([], 400), { pillars: [], half: 0, height: 0 });
});
