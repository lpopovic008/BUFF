import test from "node:test";
import assert from "node:assert/strict";
import { valueGrade } from "./player-values";

test("valueGrade keeps a KTC value's thousands and hundreds places", () => {
  assert.equal(valueGrade(9999), 99);
  assert.equal(valueGrade(4850), 48);
  assert.equal(valueGrade(1000), 10);
  assert.equal(valueGrade(850), 8);
});
