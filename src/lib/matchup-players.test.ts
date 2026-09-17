import test from "node:test";
import assert from "node:assert/strict";
import { positionPpgRankIndexFor, positionValueRankIndexFor } from "./matchup-players";
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

test("positionPpgRankIndexFor ranks by points-per-game within position, ignoring players with no games played", () => {
  const snapshot = statsSnapshot([
    statLine("101", "WR", 2, 40), // 20 ppg
    statLine("102", "WR", 2, 30), // 15 ppg
    statLine("103", "WR", 1, 25), // 25 ppg, fewer games but still ranked
    statLine("104", "WR", 0, 0), // hasn't played — excluded
    statLine("105", "RB", 2, 20), // own group, ranks #1 among RBs
  ]);
  const idx = positionPpgRankIndexFor(snapshot);
  assert.equal(idx.get("103"), 1);
  assert.equal(idx.get("101"), 2);
  assert.equal(idx.get("102"), 3);
  assert.equal(idx.has("104"), false);
  assert.equal(idx.get("105"), 1);
});
