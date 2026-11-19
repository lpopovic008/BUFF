import test from "node:test";
import assert from "node:assert/strict";
import {
  abroadOnMap,
  computeKickoffSlots,
  gameMapPosition,
  gameState,
  kickoffSlotColor,
  kickoffSlotLabel,
  kickoffSlotLongLabel,
  kickoffBlockLabel,
  leagueColor,
  leagueTint,
} from "./game-map";
import { NFLGame } from "./nfl-schedule";
import { TEAM_CITIES } from "./team-cities";
import { US_PROJECTED_OUTLINE_PATH } from "./us-outline";
import { MAP_BOUNDS } from "./projector";

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

const abroad = (id: string, city: string, country: string) =>
  game({ id, homeTeam: "JAX", venue: { name: null, city, state: null, country }, neutralSite: true });

test("a game abroad is pinned at its city in its country, drawn small under the southwest", () => {
  const { countries, positions } = abroadOnMap([game(), abroad("mel", "Melbourne", "Australia")]);
  assert.deepEqual(
    countries.map((c) => c.name),
    ["Australia"]
  );
  const [au] = countries;
  const [x, y] = positions.get("mel")!;
  // Melbourne: in the country's southeast, near its bottom.
  assert.ok(x > au.left + au.width * 0.6 && x < au.left + au.width, `x ${x}`);
  assert.ok(y > au.top + au.height * 0.75 && y < au.top + au.height, `y ${y}`);
  // The game at home isn't moved.
  assert.equal(positions.has("1"), false);
});

test("countries abroad sit within the lower 48's extent, clear of its outline, so the map's fit is the same", () => {
  const { countries } = abroadOnMap([
    abroad("a", "London", "England"),
    abroad("b", "Munich", "Germany"),
    abroad("c", "São Paulo", "Brazil"),
    abroad("d", "Ciudad de México", "Mexico"),
  ]);
  assert.equal(countries.length, 4);
  const us = [...US_PROJECTED_OUTLINE_PATH.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  for (const c of countries) {
    assert.ok(c.left >= MAP_BOUNDS.minX && c.left + c.width <= MAP_BOUNDS.maxX, c.name);
    assert.ok(c.top >= MAP_BOUNDS.minY && c.top + c.height <= MAP_BOUNDS.maxY, c.name);
    const inside = us.filter(([x, y]) => x >= c.left && x <= c.left + c.width && y >= c.top && y <= c.top + c.height);
    assert.deepEqual(inside, [], c.name);
  }
  // Side by side, not over one another.
  for (let i = 1; i < countries.length; i++) assert.ok(countries[i].left >= countries[i - 1].left + countries[i - 1].width, countries[i].name);
});

test("games abroad in the same country share it; one in a country not on file still gets a spot", () => {
  const { countries, positions } = abroadOnMap([abroad("a", "London", "United Kingdom"), abroad("b", "London", "England"), abroad("c", "Tokyo", "Japan")]);
  assert.deepEqual(
    countries.map((c) => c.name),
    ["UK"]
  );
  assert.notDeepEqual(positions.get("a"), positions.get("b"));
  assert.ok(positions.get("c"));
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

test("kickoff windows are only ever Morning, Noon, Afternoon or Night", () => {
  const label = (iso: string) => kickoffSlotLongLabel(new Date(iso).getTime());
  assert.equal(label("2026-09-13T09:30:00"), "Sunday Morning");
  assert.equal(label("2026-09-13T10:00:00"), "Sunday Morning");
  assert.equal(label("2026-09-13T13:00:00"), "Sunday Noon");
  assert.equal(label("2026-09-13T16:25:00"), "Sunday Afternoon");
  assert.equal(label("2026-09-13T20:20:00"), "Sunday Night");
  // Past midnight still counts as the night before.
  assert.equal(label("2026-09-14T00:30:00"), "Sunday Night");
});

test("a 10am and a 9:30am kickoff share one Sunday Morning window", () => {
  const london = game({ id: "lon", kickoff: "2026-09-13T09:30:00" });
  const west = game({ id: "west", kickoff: "2026-09-13T10:00:00" });
  const { slots, slotIndexByGameId } = computeKickoffSlots([london, west]);
  assert.equal(slots.length, 1);
  assert.equal(slotIndexByGameId.get("lon"), slotIndexByGameId.get("west"));
  assert.equal(kickoffBlockLabel(london), "Sunday Morning");
  assert.equal(kickoffBlockLabel(game({ id: "x", kickoff: "nope" })), "TBD");
});

test("a game's state is its stadium's: the home team's, a matched neutral venue's, none abroad", () => {
  assert.equal(gameState(game()), "CA");
  assert.equal(gameState(game({ homeTeam: "PHI" })), "PA");
  const atBuffalo = game({
    venue: { name: "Highmark Stadium", city: "Orchard Park", state: "NY", country: "USA" },
    neutralSite: true,
  });
  assert.equal(gameState(atBuffalo), "NY");
  const london = game({
    venue: { name: "Tottenham Hotspur Stadium", city: "London", state: null, country: "England" },
    neutralSite: true,
  });
  assert.equal(gameState(london), null);
});
