import test from "node:test";
import assert from "node:assert/strict";
import { recapWeekFor } from "./sleeper";

test("the League Room's write-ups open on last week's until Thursday, then this week's", () => {
  // Tuesday and Wednesday: last week's.
  assert.equal(recapWeekFor(10, 2), 9);
  assert.equal(recapWeekFor(10, 3), 9);
  // Thursday on, through Monday: this week's.
  for (const day of [4, 5, 6, 0, 1]) assert.equal(recapWeekFor(10, day), 10);
  // Never before the preseason's.
  assert.equal(recapWeekFor(0, 2), 0);
});
