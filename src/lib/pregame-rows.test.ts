import test from "node:test";
import assert from "node:assert/strict";
import { positionRows, shortName } from "./pregame-rows";
import type { GroupedStarter } from "./my-starters";

test("shortName keeps the first initial and the whole last name, and a defense as it is", () => {
  assert.equal(shortName("Patrick Mahomes", "QB"), "P. Mahomes");
  assert.equal(shortName("Amon-Ra St. Brown", "WR"), "A. St. Brown");
  assert.equal(shortName("Marvin Harrison Jr.", "WR"), "M. Harrison Jr.");
  assert.equal(shortName("Kansas City Chiefs", "DEF"), "Kansas City Chiefs");
  assert.equal(shortName("Taysom", "TE"), "Taysom");
});

test("positionRows lines each position up across the two teams, best projection first", () => {
  const p = (id: string, position: string, team: string, projected: number | null): GroupedStarter => ({
    playerId: id,
    name: id,
    position,
    team,
    leagueIds: [],
    points: null,
    pointsByLeague: {},
    projected,
  });
  const rows = positionRows(
    [
      p("gb-wr2", "WR", "GB", 8),
      p("det-te", "TE", "DET", 9),
      p("det-wr1", "WR", "DET", 15),
      p("gb-qb", "QB", "GB", 18),
      p("gb-wr1", "WR", "GB", 12),
      p("det-qb", "QB", "DET", 20),
      p("det-wr2", "WR", "DET", 10),
      p("det-wr3", "WR", "DET", null),
    ],
    "GB"
  );
  assert.deepEqual(
    rows.map(([away, home]) => [away?.playerId ?? null, home?.playerId ?? null]),
    [
      ["det-qb", "gb-qb"],
      ["det-wr1", "gb-wr1"],
      ["det-wr2", "gb-wr2"],
      ["det-wr3", null],
      ["det-te", null],
    ]
  );
});
