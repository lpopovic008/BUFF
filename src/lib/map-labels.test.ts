import test from "node:test";
import assert from "node:assert/strict";
import { LabelSite, placeLabels } from "./map-labels";

const OPTIONS = { baseGap: 4, step: 6, tries: 20, margin: 2 };

function site(id: string, x: number, y: number, width = 60, height = 20): LabelSite {
  return { id, x, y, width, height };
}

function overlaps(a: { x: number; y: number; width: number; height: number; stem: number }, b: typeof a): boolean {
  const aTop = a.y - a.stem;
  const bTop = b.y - b.stem;
  return a.x < b.x + b.width && b.x < a.x + a.width && aTop < bTop + b.height && bTop < aTop + a.height;
}

test("a lone site gets the shortest stem, keeping its tag just clear of the site", () => {
  const [label] = placeLabels([site("a", 100, 100)], OPTIONS);
  assert.equal(label.stem, 24);
});

test("tags far apart don't affect each other", () => {
  const labels = placeLabels([site("a", 0, 100), site("b", 300, 100)], OPTIONS);
  assert.deepEqual(
    labels.map((l) => l.stem),
    [24, 24]
  );
});

test("sites sharing a spot stack their tags up the stems instead of overlapping", () => {
  const labels = placeLabels([site("a", 100, 100), site("b", 100, 100), site("c", 104, 98)], OPTIONS);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) assert.ok(!overlaps(labels[i], labels[j]));
  }
  assert.equal(new Set(labels.map((l) => l.stem)).size, 3);
});

test("the nearest site (lowest on screen) is placed first with the shortest stem", () => {
  const labels = placeLabels([site("far", 100, 90), site("near", 100, 100)], OPTIONS);
  assert.equal(labels[0].id, "near");
  assert.equal(labels[0].stem, 24);
  assert.ok(labels[1].stem > 24);
});

test("when nothing clears, the least-overlapping candidate wins rather than giving up", () => {
  const crowded = Array.from({ length: 6 }, (_, i) => site(String(i), 100, 100));
  const labels = placeLabels(crowded, { ...OPTIONS, tries: 2 });
  assert.equal(labels.length, 6);
  for (const l of labels) assert.ok(l.stem === 24 || l.stem === 30);
});

test("a tag avoids running into another site's stem", () => {
  // "far" sits just right of "near"; at its shortest stem its tag would cover near's stem.
  const labels = placeLabels([site("near", 130, 100), site("far", 100, 95)], OPTIONS);
  const near = labels.find((l) => l.id === "near")!;
  const far = labels.find((l) => l.id === "far")!;
  assert.ok(far.y - far.stem + far.height <= near.y - near.stem - OPTIONS.margin || far.x + far.width <= near.x);
});

test("tags rising above the ceiling are pulled back down when there's room", () => {
  const [label] = placeLabels([site("a", 100, 30)], { ...OPTIONS, minTop: 0 });
  assert.equal(label.stem, 24);
  const stacked = placeLabels([site("a", 100, 60), site("b", 100, 60)], { ...OPTIONS, minTop: 0 });
  for (const l of stacked) assert.ok(l.y - l.stem >= 0);
});

test("left-hanging tags collide by their left-side footprint", () => {
  // Side by side, 60px apart: hanging right they'd overlap; hanging left, each
  // tag sits in the gap to its own left and they clear at the same height.
  const right = placeLabels([site("a", 100, 100), site("b", 140, 100)], OPTIONS);
  assert.notEqual(right[0].stem, right[1].stem);
  const left = placeLabels([site("a", 100, 100), site("b", 170, 100)], { ...OPTIONS, side: "left" });
  assert.equal(left[0].stem, left[1].stem);
});

test("a site's own gap sets its stem in place of the shared baseGap", () => {
  const [tall, short] = placeLabels(
    [
      { id: "tall", x: 0, y: 100, width: 10, height: 8, gap: 30 },
      { id: "short", x: 500, y: 90, width: 10, height: 8 },
    ],
    { baseGap: 5, step: 0, tries: 1, margin: 0 }
  );
  assert.equal(tall.stem, 8 + 30);
  assert.equal(short.stem, 8 + 5);
});

test("a site's own side overrides the shared one", () => {
  const [a, b] = placeLabels(
    [
      { id: "a", x: 100, y: 100, width: 40, height: 8 },
      { id: "b", x: 100, y: 100, width: 40, height: 8, side: "right" },
    ],
    { baseGap: 5, step: 0, tries: 1, margin: 0, side: "left" }
  );
  // Same spot, opposite sides of one stem: no overlap, so no reason to differ in height.
  assert.equal(a.stem, b.stem);
  assert.equal(b.side, "right");
});
