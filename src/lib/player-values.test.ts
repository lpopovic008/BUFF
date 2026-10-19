import test from "node:test";
import assert from "node:assert/strict";
import { shownGrade, valueGrade } from "./player-values";

test("valueGrade keeps a KTC value's tens and ones as the decimals that split a tie", () => {
  assert.equal(valueGrade(9999), 99.99);
  assert.equal(valueGrade(4850), 48.5);
  assert.ok(valueGrade(9999) > valueGrade(9990));
});

test("shownGrade shows only the whole grade", () => {
  assert.equal(shownGrade(valueGrade(9999)), 99);
  assert.equal(shownGrade(valueGrade(9990)), 99);
  assert.equal(shownGrade(valueGrade(1000)), 10);
  assert.equal(shownGrade(valueGrade(850)), 8);
});
