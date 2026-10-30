import test from "node:test";
import assert from "node:assert/strict";
import { halftimeSpan, lastActions, pendingPlayPoints, PENDING_PLAY_MS, pacePieces, paceShare, periodStarts, pointsTimeline } from "./live-play-points";
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

test("halftimeSpan runs from the 2nd quarter's last play to the 3rd's first", () => {
  const at = (seq: number, period: number, ms: number | null): GamePlay => ({ ...play(String(seq), "x"), sequence: seq, period, at: ms });
  assert.deepEqual(halftimeSpan([at(1, 2, 1000), at(2, 2, 2000), at(3, 3, 5000), at(4, 3, 6000), at(5, 2, null)]), { from: 2000, to: 5000 });
  assert.equal(halftimeSpan([at(1, 2, 1000)]), null);
  // The half over (the scoreboard says so), the 3rd quarter not begun: halftime from the 2nd's last play to now.
  assert.deepEqual(halftimeSpan([at(1, 2, 1000), at(2, 2, 2000)], 4000), { from: 2000, to: 4000 });
  // Once the 3rd's begun, its first play ends it, whatever now is.
  assert.deepEqual(halftimeSpan([at(1, 2, 2000), at(2, 3, 5000)], 9000), { from: 2000, to: 5000 });
});

test("pointsTimeline scores each play under a league's own rules, bonuses on the play that earns them", () => {
  const kincaid = { playerId: "kincaid", name: "Dalton Kincaid", position: "TE", team: "BUF" };
  const at = (seq: number, text: string, extra: Partial<GamePlay> = {}): GamePlay => ({ ...play(String(seq), text), sequence: seq, at: seq * 1000, ...extra });
  const plays = [
    at(1, "J.Allen pass short left to D.Kincaid to BUF 40 for 60 yards", { downDistance: "2nd & 5" }),
    at(2, "J.Allen pass short left to D.Kincaid to MIA 10 for 45 yards", { downDistance: "1st & 10" }),
  ];
  // Half PPR, a 0.5 TE premium, a point per first down, 3 for a 100-yard game.
  const scoring = { rec: 0.5, rec_yd: 0.1, bonus_rec_te: 0.5, rec_fd: 1, bonus_rec_yd_100: 3 };
  assert.deepEqual(
    pointsTimeline(plays, kincaid, scoring).map(({ delta, total }) => ({ delta, total })),
    [
      { delta: 8, total: 8 }, // 0.5 + 0.5 + 6 + 1
      { delta: 9.5, total: 17.5 }, // 0.5 + 0.5 + 4.5 + 1, and past 100 yards: + 3
    ]
  );
});

test("pointsTimeline moves a defense's points-allowed bracket as the other side scores", () => {
  const bufDef = { playerId: "BUF", name: "BUF D/ST", position: "DEF", team: "BUF" };
  const at = (seq: number, text: string, score: { home: number; away: number }): GamePlay => ({ ...play(String(seq), text, "MIA"), sequence: seq, at: seq * 1000, score });
  const plays = [
    at(1, "T.Tagovailoa pass short right to T.Hill for 5 yards", { home: 0, away: 0 }),
    { ...at(2, "T.Tagovailoa sacked at MIA 20 for -6 yards", { home: 0, away: 0 }), type: "Sack" },
    at(3, "J.Waddle 20 yard pass from T.Tagovailoa, TOUCHDOWN", { home: 7, away: 0 }),
  ];
  // BUF is away at MIA: MIA's points are the ones it allows.
  const steps = pointsTimeline(plays, bufDef, undefined, { home: "MIA", away: "BUF" });
  assert.deepEqual(
    steps.map(({ playId, delta, total }) => ({ playId, delta, total })),
    [
      { playId: "1:allowed", delta: 10, total: 10 }, // a shutout so far
      { playId: "2", delta: 1, total: 11 }, // the sack
      { playId: "3:allowed", delta: -6, total: 5 }, // 7 allowed: the bracket's 10 down to 4
    ]
  );
});

test("paceShare runs from kickoff to about the end, halftime left out", () => {
  const MIN = 60_000;
  const play = (id: string, period: number, at: number) => ({ id, gameId: "g", sequence: Number(id), text: "", type: "", period, clock: "", offense: null, scoring: false, turnover: false, yards: 0, redZone: false, downDistance: null, at }) as GamePlay;
  // 180 minutes of game: at 90 it's half done.
  assert.equal(paceShare(0, [], 90 * MIN, 180 * MIN), 0.5);
  // A 20-minute halftime from 80 to 100 doesn't count toward it.
  const plays = [play("1", 2, 80 * MIN), play("2", 3, 100 * MIN)];
  assert.equal(paceShare(0, plays, 100 * MIN, 180 * MIN), 80 / 160);
  assert.equal(paceShare(0, plays, 90 * MIN, 180 * MIN), 80 / 160);
  // At halftime (the scoreboard says the half's over), the clock stops counting from the half's last play.
  assert.equal(paceShare(0, [play("1", 2, 80 * MIN)], 95 * MIN, 180 * MIN, true), 80 / 165);
  // Past the expected end, the game's simply as far along as it can be.
  assert.equal(paceShare(0, [], 200 * MIN, 180 * MIN), 1);
});
