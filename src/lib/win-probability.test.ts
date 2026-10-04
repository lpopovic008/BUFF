import test from "node:test";
import assert from "node:assert/strict";
import {
  appendPoint,
  GameClock,
  mergeLines,
  normalCdf,
  packLine,
  readMatchup,
  shouldRecord,
  spreadShare,
  teamOutlook,
  timeline,
  unpackLine,
  winProbability,
  withReading,
  WinProbPoint,
} from "./win-probability";

test("normalCdf matches known values", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1) - 0.841345) < 1e-5);
  assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-3);
});

test("pregame chances match Sleeper's own app (2026 week 4, Epstein Island)", () => {
  // [projected totals (from Sleeper's app), the win chance Sleeper showed for the first team].
  const week4: [number, number, number][] = [
    [168.84, 139.03, 68],
    [124.56, 140.58, 39],
    [170.05, 152.75, 60],
    [133.59, 148.69, 40],
    [174.58, 175.32, 50],
  ];
  for (const [a, b, sleeper] of week4) {
    const team = (proj: number) => teamOutlook(0, [{ points: 0, projection: proj, remaining: 1 }]);
    const p = winProbability(team(a), team(b));
    assert.equal(Math.round(p * 100), sleeper, `${a} vs ${b}: ${(p * 100).toFixed(1)}% (Sleeper ${sleeper}%)`);
  }
  // Level projections are a coin flip.
  const nine = (proj: number) => Array.from({ length: 9 }, () => ({ points: 0, projection: proj, remaining: 1 }));
  assert.ok(Math.abs(winProbability(teamOutlook(0, nine(14)), teamOutlook(0, nine(14))) - 0.5) < 1e-6);
});

test("mid-game chances match Sleeper's own app to within a point (2026 week 4, Epstein Island, Sunday afternoon)", () => {
  // [pregame totals, points so far, points still to come (Sleeper's live projection less the points), Sleeper's chance for A].
  const live: [number, number, number, number, number, number, number][] = [
    [168.84, 139.03, 58.56, 54.5, 48.03, 87.41, 18],
    [124.56, 140.58, 53.9, 99.52, 63.59, 23.46, 42],
    [170.05, 152.75, 68.54, 91.64, 92.55, 40.41, 76],
    [133.59, 148.69, 59.0, 71.74, 50.03, 90.89, 10],
    [174.58, 175.32, 90.42, 89.56, 71.91, 66.66, 56],
  ];
  for (const [fullA, fullB, ptsA, ptsB, leftA, leftB, sleeper] of live) {
    const share = spreadShare(1 - (leftA + leftB) / (fullA + fullB));
    const team = (pts: number, left: number) => teamOutlook(pts, [{ points: 0, projection: left, remaining: 1 }], share);
    const p = winProbability(team(ptsA, leftA), team(ptsB, leftB)) * 100;
    assert.ok(Math.abs(p - sleeper) < 1, `${ptsA}+${leftA} vs ${ptsB}+${leftB}: ${p.toFixed(1)}% (Sleeper ${sleeper}%)`);
  }
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

test("readMatchup: pregame from projections, live from points and the clock, byes add nothing", () => {
  const games = new Map<string, GameClock>([
    ["BUF", { state: "in", period: 3, clockSeconds: 450, kickoff: "2026-10-04T17:00Z" }],
    ["KC", { state: "pre", period: 0, clockSeconds: 0, kickoff: "2026-10-04T20:25Z" }],
  ]);
  const a = { points: 20, starters: [{ playerId: "allen", team: "BUF", points: 20 }] };
  const b = { points: 0, starters: [{ playerId: "mahomes", team: "KC", points: 0 }, { playerId: "bye", team: "SEA", points: 0 }] };
  const r = readMatchup(a, b, { allen: 24, mahomes: 22, bye: 15 }, games);
  assert.equal(r.started, true);
  assert.equal(r.live, true);
  assert.equal(r.allDone, false);
  assert.equal(r.firstKickoff, Date.parse("2026-10-04T17:00Z"));
  // Pregame: 24 vs 22 (the bye counts for nothing) — a slight favorite.
  assert.ok(r.pregameP > 0.5 && r.pregameP < 0.6, `${r.pregameP}`);
  // Now: 20 + 24 × 0.375 = 29 expected against 22 — a clearer one.
  assert.ok(r.p > r.pregameP, `${r.p}`);
});

test("withReading keeps live readings and one final one", () => {
  const pt = (t: number, p: number): WinProbPoint => ({ t, p, a: 0, b: 0 });
  assert.equal(withReading([], pt(0, 0.6), false, false), null);
  assert.equal(withReading([], pt(0, 0.6), true, false)?.length, 1);
  const done = withReading([pt(0, 0.6)], pt(1000, 1), false, true);
  assert.equal(done?.length, 2);
  assert.equal(withReading(done!, pt(400_000, 1), false, true), null);
});

test("lines merge in time order and pack round-trip", () => {
  const a = [{ t: 0, p: 0.5, a: 0, b: 0 }, { t: 60_000, p: 0.6, a: 1, b: 0 }];
  const b = [{ t: 5_000, p: 0.55, a: 0, b: 0 }, { t: 120_000, p: 0.7, a: 2, b: 0 }];
  const m = mergeLines(a, b);
  assert.deepEqual(m.map((x) => x.t), [0, 60_000, 120_000]);
  assert.deepEqual(unpackLine(packLine(m)), m);
  assert.deepEqual(unpackLine("junk"), []);
});
