import test from "node:test";
import assert from "node:assert/strict";
import { positionValueRankIndexFor, positionValueRanksById, seasonLinesById, valuesByPlayerId } from "./matchup-players";
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

test("seasonLinesById ranks by season points within position, with points a game, skipping players who haven't played", () => {
  const lines = seasonLinesById(
    statsSnapshot([
      statLine("101", "WR", 4, 80),
      statLine("102", "WR", 2, 60),
      statLine("104", "WR", 0, 0),
      statLine("105", "RB", 2, 20),
    ])
  );
  assert.deepEqual(lines.get("101"), { rank: 1, ppg: 20 });
  assert.deepEqual(lines.get("102"), { rank: 2, ppg: 30 });
  assert.equal(lines.has("104"), false);
  assert.deepEqual(lines.get("105"), { rank: 1, ppg: 10 });
});

test("positionValueRanksById ranks KTC values within position, keyed by Sleeper id, kickers by Sleeper's K", () => {
  const snapshot = valuesSnapshot([value("Ja'Marr Chase", "WR", 9500), value("Justin Jefferson", "WR", 9000), value("Brandon Aubrey", "PK", 900)]);
  const ids = new Map([
    ["WR-jamarr chase", "7564"],
    ["WR-justin jefferson", "6794"],
    ["K-brandon aubrey", "11533"],
  ]);
  const ranks = positionValueRanksById(snapshot, { listType: "dynasty", format: "oneQB", tep: "standard" }, ids);
  assert.equal(ranks.get("7564"), 1);
  assert.equal(ranks.get("6794"), 2);
  assert.equal(ranks.get("11533"), 1);
});

test("valuesByPlayerId matches KTC names to Sleeper ids by position and name", () => {
  const snapshot = valuesSnapshot([value("Ja'Marr Chase", "WR", 9500), value("Nobody Known", "WR", 100)]);
  const ids = valuesByPlayerId(snapshot, { listType: "dynasty", format: "oneQB", tep: "standard" }, new Map([["WR-jamarr chase", "7564"]]));
  assert.deepEqual([...ids], [["7564", 9500]]);
});
