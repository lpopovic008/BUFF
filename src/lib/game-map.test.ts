import test from "node:test";
import assert from "node:assert/strict";
import { gameMapPosition, leagueColor, leagueTint } from "./game-map";
import { NFLGame } from "./nfl-schedule";
import { TEAM_CITIES } from "./warroom-team-cities";

function game(over: Partial<NFLGame> = {}): NFLGame {
  return {
    id: "1",
    homeTeam: "LAR",
    awayTeam: "SF",
    kickoff: "2026-09-11T00:35Z",
    state: "pre",
    homeScore: 0,
    awayScore: 0,
    venue: { name: "SoFi Stadium", city: "Inglewood", state: "CA", country: "USA" },
    neutralSite: false,
    ...over,
  };
}

test("a normal game plots at the home team's stadium", () => {
  assert.deepEqual(gameMapPosition(game()), TEAM_CITIES.LAR.pos);
});

test("a game played abroad has no map position", () => {
  // The real 2026 week 1 opener: LAR are nominally home, but it's in Melbourne.
  const melbourne = game({
    venue: { name: "Melbourne Cricket Ground", city: "Melbourne", state: "VIC", country: "Australia" },
    neutralSite: true,
  });
  assert.equal(gameMapPosition(melbourne), null);
});

test("a London game has no map position either", () => {
  const london = game({
    homeTeam: "JAX",
    venue: { name: "Tottenham Hotspur Stadium", city: "London", state: null, country: "England" },
    neutralSite: true,
  });
  assert.equal(gameMapPosition(london), null);
});

test("a neutral-site game inside the US plots at its actual venue, not the home team's stadium", () => {
  const atBuffalo = game({
    homeTeam: "LAR",
    venue: { name: "Highmark Stadium", city: "Orchard Park", state: "NY", country: "USA" },
    neutralSite: true,
  });
  assert.deepEqual(gameMapPosition(atBuffalo), TEAM_CITIES.BUF.pos);
  assert.notDeepEqual(gameMapPosition(atBuffalo), TEAM_CITIES.LAR.pos);
});

test("a neutral US venue that matches no stadium falls back to the home team", () => {
  const nowhere = game({
    venue: { name: "Somewhere Field", city: "Nowhere", state: "ZZ", country: "USA" },
    neutralSite: true,
  });
  assert.deepEqual(gameMapPosition(nowhere), TEAM_CITIES.LAR.pos);
});

test("a game with no venue data is still plotted at the home stadium", () => {
  assert.deepEqual(gameMapPosition(game({ venue: null })), TEAM_CITIES.LAR.pos);
});

test("an unknown home team has no position rather than a wrong one", () => {
  assert.equal(gameMapPosition(game({ homeTeam: "XXX", venue: null })), null);
});

test("league colours are distinct and wrap once they run out", () => {
  const first8 = Array.from({ length: 8 }, (_, i) => leagueColor(i));
  assert.equal(new Set(first8).size, 8);
  assert.equal(leagueColor(8), leagueColor(0));
});

test("a league's tint is its own colour, just faint", () => {
  assert.ok(leagueTint(0).includes(leagueColor(0)));
  assert.match(leagueTint(0), /color-mix/);
});
