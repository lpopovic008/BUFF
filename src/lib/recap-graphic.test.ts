import test from "node:test";
import assert from "node:assert/strict";
import { choosePartCuts, MAX_PART_HEIGHT } from "./recap-graphic";

const MAX = 1000;

function parts(cuts: number[], total: number): number[] {
  const edges = [0, ...cuts, total];
  return edges.slice(1).map((e, i) => e - edges[i]);
}

test("a graphic that already fits stays one image", () => {
  assert.deepEqual(choosePartCuts([300, 600, 900], 950, MAX), []);
});

test("splits into as few images as fit, each within the cap, cutting only between sections", () => {
  const boundaries = [250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250];
  const total = 2400;
  const cuts = choosePartCuts(boundaries, total, MAX);
  assert.equal(cuts.length + 1, 3);
  for (const c of cuts) assert.ok(boundaries.includes(c));
  for (const h of parts(cuts, total)) assert.ok(h <= MAX, `part ${h} over the cap`);
});

test("evens the images out instead of packing the first ones full", () => {
  // Greedy packing would give 1000 + 1000 + 100; balanced is about 700 each.
  const boundaries = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
  const cuts = choosePartCuts(boundaries, 2100, MAX);
  const heights = parts(cuts, 2100);
  assert.equal(heights.length, 3);
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 100, heights.join(","));
});

test("fewer sections, fewer images", () => {
  const all = choosePartCuts([400, 800, 1200, 1600, 2000, 2400], 2800, MAX).length + 1;
  const some = choosePartCuts([400, 800, 1200], 1500, MAX).length + 1;
  assert.ok(some < all, `${some} vs ${all}`);
});

test("a section taller than an image gets an image to itself", () => {
  const cuts = choosePartCuts([300, 1700, 2000], 2300, MAX);
  for (const c of cuts) assert.ok([300, 1700, 2000].includes(c));
  assert.ok(cuts.includes(300) && cuts.includes(1700));
});

test("the cap is a phone screen's 9:16 at the graphic's width", () => {
  assert.equal(MAX_PART_HEIGHT, 1920);
});
