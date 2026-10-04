import test from "node:test";
import assert from "node:assert/strict";
import { appendPoint, normalCdf, shouldRecord, teamOutlook, timeline, winProbability, WinProbPoint } from "./win-probability";

test("normalCdf matches known values", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1) - 0.841345) < 1e-5);
  assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-3);
});

test("pregame, the better projection is favored; level projections are a coin flip", () => {
  const starters = (proj: number) => Array.from({ length: 9 }, () => ({ points: 0, projection: proj, remaining: 1 }));
  const p = winProbability(teamOutlook(0, starters(15)), teamOutlook(0, starters(12)));
  assert.ok(p > 0.7 && p < 0.95, `favorite at ${p}`);
  assert.ok(Math.abs(winProbability(teamOutlook(0, starters(14)), teamOutlook(0, starters(14))) - 0.5) < 1e-6);
});

test("as games run out the leader's chance climbs to certainty", () => {
  const left = (remaining: number) => [{ points: 0, projection: 10, remaining }];
  const early = winProbability(teamOutlook(110, left(0.8)), teamOutlook(100, left(0.8)));
  const late = winProbability(teamOutlook(110, left(0.1)), teamOutlook(100, left(0.1)));
  assert.ok(late > early, `${late} > ${early}`);
  assert.equal(winProbability(teamOutlook(110, left(0)), teamOutlook(100, left(0))), 1);
  assert.equal(winProbability(teamOutlook(100, left(0)), teamOutlook(100, left(0))), 0.5);
});

test("a team with players still to play can come back", () => {
  // Down 20 with a 25-point projection left to play, against a finished team.
  const p = winProbability(teamOutlook(80, [{ points: 0, projection: 25, remaining: 1 }]), teamOutlook(100, []));
  assert.ok(p > 0.5 && p < 0.8, `${p}`);
});

const pt = (t: number, p: number, a = 0, b = 0): WinProbPoint => ({ t, p, a, b });

test("readings are kept when they move, not more than every 15s, and at least every 5 minutes", () => {
  assert.equal(shouldRecord(undefined, pt(0, 0.5)), true);
  assert.equal(shouldRecord(pt(0, 0.5), pt(5_000, 0.6)), false);
  assert.equal(shouldRecord(pt(0, 0.5), pt(20_000, 0.6)), true);
  assert.equal(shouldRecord(pt(0, 0.5), pt(20_000, 0.5)), false);
  assert.equal(shouldRecord(pt(0, 0.5), pt(20_000, 0.5, 6)), true);
  assert.equal(shouldRecord(pt(0, 0.5), pt(300_000, 0.5)), true);
});

test("a long line is thinned from the oldest end", () => {
  let h: WinProbPoint[] = [];
  for (let i = 0; i < 12; i++) h = appendPoint(h, pt(i, 0.5), 10);
  assert.ok(h.length <= 10);
  assert.equal(h.at(-1)!.t, 11);
  assert.equal(h[0].t, 0);
});

test("the timeline shrinks the dead time between game windows", () => {
  const M = 60_000;
  // Thursday night (readings 20 minutes apart), then Sunday, three days later.
  const sun = 72 * 60 * M;
  const { xs, breaks } = timeline([pt(0, 0.5), pt(20 * M, 0.6), pt(40 * M, 0.55), pt(sun, 0.4), pt(sun + 20 * M, 0.3)]);
  assert.equal(xs[0], 0);
  assert.equal(xs.at(-1), 1);
  assert.equal(breaks.length, 1);
  // The 3-day gap takes a sliver; the two game windows take nearly everything.
  assert.ok(xs[3] - xs[2] < 0.1, `${xs[3] - xs[2]}`);
});
