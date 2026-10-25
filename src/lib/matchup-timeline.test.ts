import test from "node:test";
import assert from "node:assert/strict";
import { gameWindows, leadPieces, liveProjection, SLEEPER_LAG_MS, sleeperDiffers, teamPace, teamTimeline } from "./matchup-timeline";

test("gameWindows merges overlapping games into the week's windows", () => {
  assert.deepEqual(
    gameWindows([
      { from: 100, to: 200 },
      { from: 10, to: 50 },
      { from: 150, to: 300 },
      { from: 400, to: 400 }, // no time at all
    ]),
    [
      { from: 10, to: 50 },
      { from: 100, to: 300 },
    ]
  );
});

test("teamTimeline merges starters' plays into one running total, the rest of their points last", () => {
  const step = (playId: string, at: number, delta: number) => ({ playId, at, period: 1, clock: "", text: "", delta, total: 0 });
  const steps = teamTimeline([
    { playerId: "a", name: "A", steps: [step("1", 10, 6), step("3", 30, 1)], makeUp: { at: 40, delta: -0.5 } },
    { playerId: "b", name: "B", steps: [step("2", 20, 2.5)], makeUp: null },
  ]);
  assert.deepEqual(
    steps.map(({ playId, name, total }) => ({ playId, name, total })),
    [
      { playId: "1", name: "A", total: 6 },
      { playId: "2", name: "B", total: 8.5 },
      { playId: "3", name: "A", total: 9.5 },
      { playId: "a:rest", name: "A", total: 9 },
    ]
  );
});

test("teamPace spreads each starter's projection over their own game", () => {
  const starters = [
    { projected: 10, from: 0, to: 100 },
    { projected: 20, from: 200, to: 300 },
  ];
  assert.equal(teamPace(starters, 50), 5);
  assert.equal(teamPace(starters, 150), 10);
  assert.equal(teamPace(starters, 250), 20);
  assert.equal(teamPace(starters, 400), 30);
});

test("leadPieces cuts the week wherever either total moved, with who led", () => {
  const mine = [{ at: 10, total: 6 }];
  const theirs = [{ at: 20, total: 8 }];
  assert.deepEqual(
    leadPieces(mine, theirs, 0, 30).map(({ from, to, lead }) => ({ from, to, lead })),
    [
      { from: 0, to: 10, lead: null },
      { from: 10, to: 20, lead: true },
      { from: 20, to: 30, lead: false },
    ]
  );
});

test("liveProjection counts projections until a starter's game is over, then their points", () => {
  assert.equal(
    liveProjection([
      { points: 22.4, projected: 18, final: true },
      { points: 9.1, projected: 15.5, final: false },
      { points: 3, projected: null, final: false },
    ]),
    40.9
  );
});

test("sleeperDiffers waits for Sleeper to count the latest plays before calling its total different", () => {
  const MIN = 60_000;
  const at = (minute: number, total: number) => ({ playId: String(minute), at: minute * MIN, period: 1, clock: "", text: "", delta: 0, total });
  // 6 points at minute 0, 2.5 more (8.5) at minute 30.
  const steps = [at(0, 6), at(30, 8.5)];
  const now = 30 * MIN + SLEEPER_LAG_MS / 2;
  // Sleeper still at 6, or already at 8.5: just catching up.
  assert.equal(sleeperDiffers(steps, 6, now), false);
  assert.equal(sleeperDiffers(steps, 8.5, now), false);
  // Neither: different for real.
  assert.equal(sleeperDiffers(steps, 7, now), true);
  // Still at 6 well after the second play: different for real.
  assert.equal(sleeperDiffers(steps, 6, 30 * MIN + SLEEPER_LAG_MS), true);
  // No plays: anything but 0 is.
  assert.equal(sleeperDiffers([], 0, now), false);
  assert.equal(sleeperDiffers([], 1, now), true);
});
