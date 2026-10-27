import test from "node:test";
import assert from "node:assert/strict";
import { inWindow, PLAY_PAGE, windowAround } from "./play-window";

test("windowAround loads a page of plays with the one asked for in the middle", () => {
  assert.deepEqual(windowAround(400, 500), { start: 385, end: 415 });
  assert.ok(inWindow(windowAround(400, 500), 400));
  assert.equal(windowAround(400, 500).end - windowAround(400, 500).start, PLAY_PAGE);
});

test("windowAround shifts in from either end of the plays rather than run past it", () => {
  assert.deepEqual(windowAround(3, 500), { start: 0, end: 30 });
  assert.deepEqual(windowAround(498, 500), { start: 470, end: 500 });
  assert.deepEqual(windowAround(5, 12), { start: 0, end: 12 });
});
