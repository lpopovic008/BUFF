import test from "node:test";
import assert from "node:assert/strict";
import { lastActions, pendingPlayPoints, PENDING_PLAY_MS } from "./live-play-points";
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
