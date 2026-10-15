import test from "node:test";
import assert from "node:assert/strict";
import { lastActions, pendingPlayPoints, PENDING_PLAY_MS, pacePieces, periodStarts, pointsTimeline } from "./live-play-points";
import { GamePlay } from "./play-by-play";

function play(id: string, text: string, offense = "BUF"): GamePlay {
  return { id, gameId: "g", sequence: 1, text, type: "Rush", period: 1, clock: "", offense, scoring: false, turnover: false, yards: 0, redZone: false, downDistance: null, at: null };
}

const allen = { playerId: "allen", name: "Josh Allen", position: "QB", team: "BUF" };
const now = 1_000_000;

test("pendingPlayPoints counts plays seen after Sleeper's number last changed", () => {
  const plays = [
    { play: play("1", "J.Allen right end for 10 yards"), seenAt: now - 60_000 }, // before Sleeper moved: already counted
    { play: play("2", "J.Allen right end for 20 yards"), seenAt: now - 10_000 }, // since: pending
  ];
  assert.deepEqual(pendingPlayPoints(plays, [allen], new Map([["allen", now - 30_000]]), now), { allen: 2 });
});

test("pendingPlayPoints skips plays from the first load, stale plays, and players Sleeper hasn't reported", () => {
  const changed = new Map([["allen", now - 10 * 60_000]]);
  assert.deepEqual(pendingPlayPoints([{ play: play("1", "J.Allen right end for 10 yards"), seenAt: 0 }], [allen], changed, now), {});
  assert.deepEqual(
    pendingPlayPoints([{ play: play("1", "J.Allen right end for 10 yards"), seenAt: now - PENDING_PLAY_MS }], [allen], changed, now),
    {}
  );
  assert.deepEqual(pendingPlayPoints([{ play: play("1", "J.Allen right end for 10 yards"), seenAt: now }], [allen], new Map(), now), {});
});

test("lastActions keeps each player's latest play that moved their points", () => {
  const kincaid = { playerId: "kincaid", name: "Dalton Kincaid", position: "TE", team: "BUF" };
  const cook = { playerId: "cook", name: "James Cook", position: "RB", team: "BUF" };
  const at = (seq: number, text: string): GamePlay => ({ ...play(String(seq), text), sequence: seq, at: seq * 1000 });
  const plays = [
    at(2, "J.Allen pass short left to D.Kincaid for 12 yards"),
    at(1, "J.Allen right end for 10 yards"),
    at(3, "J.Allen pass incomplete deep right to D.Kincaid."), // named, but nothing earned
  ];
  assert.deepEqual(lastActions(plays, [allen, kincaid, cook]), {
    allen: { at: 2000, delta: 0.48 },
    kincaid: { at: 2000, delta: 2.2 },
  });
});

test("pointsTimeline runs a player's total up play by play, in game order", () => {
  const at = (seq: number, text: string, period = 1): GamePlay => ({ ...play(String(seq), text), sequence: seq, period, at: seq * 1000 });
  const plays = [
    at(3, "J.Allen pass short left to D.Kincaid for 12 yards", 2),
    at(1, "J.Allen right end for 10 yards"),
    at(2, "J.Allen pass incomplete deep right to D.Kincaid."), // nothing earned
    { ...at(4, "J.Allen left end for 5 yards", 2), at: null }, // no time given
  ];
  assert.deepEqual(
    pointsTimeline(plays, allen).map(({ playId, delta, total }) => ({ playId, delta, total })),
    [
      { playId: "1", delta: 1, total: 1 },
      { playId: "3", delta: 0.48, total: 1.48 },
    ]
  );
  assert.deepEqual(periodStarts(plays), [
    { period: 1, at: 1000 },
    { period: 2, at: 3000 },
  ]);
});

test("pacePieces splits the line where it falls behind the projection's pace", () => {
  // Pace climbs from 0 at t=0 to 10 at t=100. They score 5 at t=10, so they lead until pace reaches 5 at t=50.
  assert.deepEqual(pacePieces([{ at: 10, total: 5 }], 0, 80, 100, 10), [
    { from: 0, to: 10, value: 0, onPace: false },
    { from: 10, to: 50, value: 5, onPace: true },
    { from: 50, to: 80, value: 5, onPace: false },
  ]);
  // No projection: nothing to measure against.
  assert.deepEqual(pacePieces([{ at: 10, total: 5 }], 0, 20, 100, null), [
    { from: 0, to: 10, value: 0, onPace: null },
    { from: 10, to: 20, value: 5, onPace: null },
  ]);
});
