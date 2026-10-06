import test from "node:test";
import assert from "node:assert/strict";
import { positionBlendRankIndexFor, positionValueRankIndexFor, valuesByPlayerId } from "./matchup-players";
import { PlayerValue, PlayerValuesSnapshot } from "./player-values";
import { PlayerStatLine, PlayerStatsSnapshot } from "./player-stats";

function value(name: string, position: string, oneQBStandard: number): PlayerValue {
  return {
    name,
    position,
    team: null,
    age: null,
    values: { oneQBStandard, oneQBTep: oneQBStandard, superflexStandard: oneQBStandard, superflexTep: oneQBStandard },
  };
}

function valuesSnapshot(dynasty: PlayerValue[]): PlayerValuesSnapshot {
  return { updatedAt: null, source: "keeptradecut", dynasty, fantasy: dynasty };
}

test("positionValueRankIndexFor ranks players within their own position only", () => {
  const snapshot = valuesSnapshot([
    value("Justin Jefferson", "WR", 9000),
    value("Chris Olave", "WR", 5000),
    value("Ja'Marr Chase", "WR", 9500),
    value("Christian McCaffrey", "RB", 8000),
  ]);
  const idx = positionValueRankIndexFor(snapshot, { listType: "dynasty", format: "oneQB", tep: "standard" });
  assert.equal(idx.get("justin jefferson"), 2);
  assert.equal(idx.get("chris olave"), 3);
  assert.equal(idx.get("jamarr chase"), 1);
  // RB is its own group, so McCaffrey ranks #1 among RBs despite a lower raw value than every WR above.
  assert.equal(idx.get("christian mccaffrey"), 1);
});

function statLine(playerId: string, position: string, gamesPlayed: number, ptsPpr: number): PlayerStatLine {
  return { playerId, position, gamesPlayed, ptsPpr, ptsHalfPpr: ptsPpr, ptsStd: ptsPpr };
}

function statsSnapshot(players: PlayerStatLine[]): PlayerStatsSnapshot {
  return { updatedAt: null, season: "2025", throughWeek: 2, players };
}

test("positionBlendRankIndexFor blends season points and points per game within position, skipping players who haven't played", () => {
  const snapshot = statsSnapshot([
    statLine("101", "WR", 4, 80), // most points, 20/game: (1 + 0.95) / 2
    statLine("102", "WR", 4, 60), // 15/game: (0.75 + 0.71) / 2
    statLine("103", "WR", 2, 42), // missed two games but 21/game: (0.525 + 1) / 2 — ahead of 102
    statLine("104", "WR", 0, 0), // hasn't played — excluded
    statLine("105", "RB", 2, 20), // own group, ranks #1 among RBs
  ]);
  const idx = positionBlendRankIndexFor(snapshot);
  assert.equal(idx.get("101"), 1);
  assert.equal(idx.get("103"), 2);
  assert.equal(idx.get("102"), 3);
  assert.equal(idx.has("104"), false);
  assert.equal(idx.get("105"), 1);
});

test("positionBlendRankIndexFor weighs in dynasty value as a third part, except at positions with no values", () => {
  const snapshot = statsSnapshot([
    statLine("201", "RB", 4, 80),
    statLine("202", "RB", 4, 70), // a bit behind on points, far ahead on value
    statLine("301", "K", 4, 40),
    statLine("302", "K", 4, 36),
  ]);
  const values = new Map([
    ["201", 2000],
    ["202", 9000],
  ]);
  const idx = positionBlendRankIndexFor(snapshot, undefined, values);
  assert.equal(idx.get("202"), 1);
  assert.equal(idx.get("201"), 2);
  // No kicker has a value, so kickers rank on points alone.
  assert.equal(idx.get("301"), 1);
  assert.equal(idx.get("302"), 2);
  // Without values the RBs go back to points order.
  assert.equal(positionBlendRankIndexFor(snapshot).get("201"), 1);
});

test("valuesByPlayerId matches KTC names to Sleeper ids by position and name", () => {
  const snapshot = valuesSnapshot([value("Ja'Marr Chase", "WR", 9500), value("Nobody Known", "WR", 100)]);
  const ids = valuesByPlayerId(snapshot, { listType: "dynasty", format: "oneQB", tep: "standard" }, new Map([["WR-jamarr chase", "7564"]]));
  assert.deepEqual([...ids], [["7564", 9500]]);
});
