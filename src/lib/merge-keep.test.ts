import test from "node:test";
import assert from "node:assert/strict";
import { joinTexts, mergeCollections, mergeKeep } from "./merge-keep";

test("an empty side takes the other's text: writing is never cleared by a blank copy", () => {
  assert.equal(mergeKeep(undefined, "", "Great week for the Bills"), "Great week for the Bills");
  assert.equal(mergeKeep(undefined, "Great week for the Bills", ""), "Great week for the Bills");
});

test("only one side changed since the base: that side's change stands, a deletion included", () => {
  assert.equal(mergeKeep("old", "new words", "old"), "new words");
  assert.equal(mergeKeep("old", "old", "their words"), "their words");
  assert.equal(mergeKeep("a long paragraph", "", "a long paragraph"), "");
});

test("both sides changed: the texts are joined, one added onto the other, not one picked by when", () => {
  assert.equal(joinTexts("Line one\nmine", "theirs"), "Line one\nmine\n\ntheirs");
  assert.equal(joinTexts("Bowl of Champions", "Toilet Bowl"), "Bowl of Champions / Toilet Bowl");
  // One already holding all of the other is kept as is.
  assert.equal(joinTexts("I wrote more here", "I wrote more"), "I wrote more here");
  assert.equal(mergeKeep(undefined, "mine", "theirs"), "mine / theirs");
});

test("objects merge field by field; a write-up's sections put together", () => {
  const base = { title: "Week 7", ai: "", layout: ["aiRecap", "winners"] };
  const local = { title: "Week 7", ai: "Typed here", layout: ["aiRecap", "winners"] };
  const remote = { title: "Week 7 Recap", ai: "", layout: ["aiRecap", "winners", "standings"] };
  assert.deepEqual(mergeKeep(base, local, remote), { title: "Week 7 Recap", ai: "Typed here", layout: ["aiRecap", "winners", "standings"] });
});

test("collections: one only the other side has is kept; one deleted here, untouched there, stays deleted", () => {
  const base = { a: { body: "x" }, b: { body: "y" } };
  const local = { a: { body: "x" } };
  const remote = { a: { body: "x" }, b: { body: "y" }, c: { body: "z" } };
  assert.deepEqual(mergeCollections(base, local, remote), { a: { body: "x" }, c: { body: "z" } });
  // With no base, nothing's taken for deleted.
  assert.deepEqual(mergeCollections(undefined, local, remote), remote);
});
