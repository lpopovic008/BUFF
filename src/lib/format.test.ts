import test from "node:test";
import assert from "node:assert/strict";
import { abbreviateFirstName } from "./format";

test("abbreviateFirstName shortens a normal two-word name", () => {
  assert.equal(abbreviateFirstName("Josh Allen"), "J. Allen");
});

test("abbreviateFirstName keeps a suffix on the last name", () => {
  assert.equal(abbreviateFirstName("Odell Beckham Jr."), "O. Beckham Jr.");
});

test("abbreviateFirstName leaves a single-word name unchanged", () => {
  assert.equal(abbreviateFirstName("Bills"), "Bills");
});

test("abbreviateFirstName tolerates extra whitespace", () => {
  assert.equal(abbreviateFirstName("  Chris   Olave  "), "C. Olave");
});
