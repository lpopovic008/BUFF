import test from "node:test";
import assert from "node:assert/strict";
import {
  computeKickoffSlots,
  gameMapPosition,
  kickoffSlotColor,
  kickoffSlotLabel,
  leagueColor,
  leagueTint,
} from "./game-map";
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

test("kickoff slots come back in chronological order, one per distinct window", () => {
  const wed = game({ id: "wed", kickoff: "2026-09-09T23:00:00" }); // Wed 7pm local
  const thu = game({ id: "thu", kickoff: "2026-09-10T23:00:00" }); // Thu 7pm local
  const sunNoon = game({ id: "sun-noon", kickoff: "2026-09-13T13:00:00" }); // Sun 1pm local
  const sunNoon2 = game({ id: "sun-noon-2", kickoff: "2026-09-13T13:00:00" }); // same window as sunNoon
  const sunNight = game({ id: "sun-night", kickoff: "2026-09-13T20:20:00" }); // Sun 8:20pm local
  const mon = game({ id: "mon", kickoff: "2026-09-14T20:15:00" }); // Mon 8:15pm local

  const { slotIndexByGameId, slots } = computeKickoffSlots([mon, sunNight, sunNoon2, sunNoon, thu, wed]);

  assert.equal(slots.length, 5); // sunNoon and sunNoon2 share one window
  assert.equal(slotIndexByGameId.get("wed"), 0);
  assert.equal(slotIndexByGameId.get("thu"), 1);
  assert.equal(slotIndexByGameId.get("sun-noon"), 2);
  assert.equal(slotIndexByGameId.get("sun-noon-2"), 2);
  assert.equal(slotIndexByGameId.get("sun-night"), 3);
  assert.equal(slotIndexByGameId.get("mon"), 4);
});

test("games with an unparseable kickoff are left out of the slot map rather than crashing", () => {
  const { slotIndexByGameId, slots } = computeKickoffSlots([game({ id: "bad", kickoff: "not a date" })]);
  assert.equal(slots.length, 0);
  assert.equal(slotIndexByGameId.has("bad"), false);
});

test("kickoff colour spans the full gradient across however many slots there are", () => {
  assert.equal(kickoffSlotColor(0, 1), "var(--kickoff-1)");
  assert.equal(kickoffSlotColor(0, 6), "var(--kickoff-1)");
  assert.equal(kickoffSlotColor(5, 6), "var(--kickoff-6)");
  // Only 3 slots this week — still stretches across the same 6-stop gradient.
  assert.equal(kickoffSlotColor(0, 3), "var(--kickoff-1)");
  assert.equal(kickoffSlotColor(2, 3), "var(--kickoff-6)");
});

test("kickoff label reads like \"Wed 7p\"", () => {
  assert.equal(kickoffSlotLabel(new Date("2026-09-09T19:00:00").getTime()), "Wed 7p");
  assert.equal(kickoffSlotLabel(new Date("2026-09-13T13:00:00").getTime()), "Sun 1p");
  assert.equal(kickoffSlotLabel(new Date("2026-09-13T00:00:00").getTime()), "Sun 12a");
});
