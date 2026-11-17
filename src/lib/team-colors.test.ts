import test from "node:test";
import assert from "node:assert/strict";
import { NFL_TEAMS } from "./nfl-logos";
import { teamColor, teamName, teamSecondary } from "./team-colors";

test("every team has a name to paint in its end zone, and a color", () => {
  for (const team of NFL_TEAMS) {
    assert.notEqual(teamName(team), team, team);
    assert.match(teamColor(team), /^#[0-9a-f]{6}$/i, team);
    assert.match(teamSecondary(team), /^#[0-9a-f]{6}$/i, team);
  }
  assert.equal(teamName("CHI"), "Bears");
  assert.equal(teamName("XYZ"), "XYZ");
});
