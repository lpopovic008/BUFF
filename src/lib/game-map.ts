// Where a game belongs on the dashboard's US map, and which colour marks each
// league in the starters list.

import { COUNTRY_OUTLINES, CountryOutline } from "./country-outlines";
import { isOutsideUS, NFLGame } from "./nfl-schedule";
import { TEAM_CITIES, TeamCity } from "./team-cities";

/**
 * A game's [x, y] in the US map's viewBox, or null when it can't be plotted —
 * either it's being played abroad (those get listed off to the side instead)
 * or the home team has no stadium on file.
 *
 * Normally that's just the home team's stadium. A neutral-site game inside the
 * US is played somewhere else entirely, so its venue city is matched against
 * the stadium list first and only falls back to the home team if nothing
 * matches.
 */
export function gameMapPosition(game: NFLGame): [number, number] | null {
  return gameStadium(game)?.pos ?? null;
}

/**
 * The postal code of the state a game is played in — the state of the same
 * stadium gameMapPosition plots it at — or null abroad or when unknown.
 */
export function gameState(game: NFLGame): string | null {
  const city = gameStadium(game)?.city;
  return city ? city.slice(city.lastIndexOf(", ") + 2) : null;
}

/** The stadium a game is placed at (see gameMapPosition). */
function gameStadium(game: NFLGame): TeamCity | null {
  if (isOutsideUS(game)) return null;

  if (game.neutralSite && game.venue?.city) {
    const label = game.venue.state ? `${game.venue.city}, ${game.venue.state}` : game.venue.city;
    const match = Object.values(TEAM_CITIES).find(
      (city) => city.city.toLowerCase() === label.toLowerCase()
    );
    if (match) return match;
  }

  return TEAM_CITIES[game.homeTeam] ?? null;
}

// Distinct hues from the app's own series palette, skipping the status colours
// so a league is never mistaken for a good/bad signal. They shift with the
// theme because they're tokens, not fixed hex.
const LEAGUE_COLOR_TOKENS = [
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-7",
  "--series-5",
  "--series-6",
  "--series-4",
  "--series-8",
];

/** The solid colour marking one league, by its position in the tracked list. Wraps if there are more leagues than colours. */
export function leagueColor(index: number): string {
  return `var(${LEAGUE_COLOR_TOKENS[index % LEAGUE_COLOR_TOKENS.length]})`;
}

/** The same colour at low opacity, for softly tinting a player row behind its text. */
export function leagueTint(index: number, percent = 12): string {
  return `color-mix(in srgb, ${leagueColor(index)} ${percent}%, transparent)`;
}

/**
 * A fixed slot for a game played abroad. There's no meaningful US position
 * for it, so these sit south of the border below Arizona — the first about
 * half a state's height clear of it, each next one a step further out on a
 * diagonal running southwest, clear of every real stadium.
 */
export function internationalSlotPosition(index: number): [number, number] {
  const [originX, originY] = [80, 166];
  const [stepX, stepY] = [-6, 7];
  return [originX + index * stepX, originY + index * stepY];
}

/**
 * Where the countries of games abroad are drawn small on the US map (map units): under California, Arizona and New
 * Mexico, left of Texas — inside the lower 48's own extent, so the map's fitted the same with them as without.
 */
const ABROAD_AREA = { left: 26, top: 151, right: 114, bottom: 184 };
/** The most a country's drawn across (or down), in map units: small, beside the states. */
const COUNTRY_MOST = 30;
/** Between two countries side by side (map units). */
const COUNTRY_GAP = 5;
/** How far apart games in the same city are pinned (map units), so each shows. */
const SAME_CITY_STEP = 3;

/** A country games are being played in abroad, drawn small on the US map (see abroadOnMap). */
export interface AbroadCountry {
  name: string;
  /** Its outline, in map units. */
  path: string;
  /** Its extent, in map units. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Other names ESPN might give a venue's city, as country-outlines.ts names it. */
const CITY_ALIASES: Record<string, string> = {
  "ciudad de mexico": "mexico city",
  cdmx: "mexico city",
  munchen: "munich",
  "frankfurt am main": "frankfurt",
  roma: "rome",
  milano: "milan",
  rio: "rio de janeiro",
};

/** A name lower-cased, its accents off (São Paulo, Düsseldorf). */
const plain = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** The outline of the country a game abroad is played in, if it's one drawn (see country-outlines.ts). */
function countryOf(game: NFLGame): CountryOutline | null {
  const country = game.venue?.country;
  if (!country) return null;
  const name = plain(country);
  return COUNTRY_OUTLINES.find((c) => c.spellings.includes(name)) ?? null;
}

/**
 * The games played abroad on the US map: each country they're in drawn small under California, Arizona and New Mexico
 * (side by side, smaller the more there are), and each game pinned in its own country at the city it's played in (its
 * middle, for a city not on file). A country not on file has its games in holding spots there instead (see
 * internationalSlotPosition).
 */
export function abroadOnMap(games: NFLGame[]): { countries: AbroadCountry[]; positions: Map<string, [number, number]> } {
  const abroad = games.filter(isOutsideUS);
  const outlines = [...new Set(abroad.map(countryOf).filter((c): c is CountryOutline => c !== null))];
  const area = { width: ABROAD_AREA.right - ABROAD_AREA.left, height: ABROAD_AREA.bottom - ABROAD_AREA.top };
  // As big as lets them all fit across, up to the most.
  const most = Math.min(COUNTRY_MOST, area.height, (area.width - (outlines.length - 1) * COUNTRY_GAP) / Math.max(1, outlines.length));
  const sized = outlines.map((c) => ({ outline: c, scale: most / Math.max(c.width, c.height) }));
  const across = sized.reduce((sum, c) => sum + c.outline.width * c.scale, 0) + (sized.length - 1) * COUNTRY_GAP;
  let left = ABROAD_AREA.left + (area.width - across) / 2;
  const placed = sized.map(({ outline, scale }) => {
    const at = { outline, scale, left, top: ABROAD_AREA.top };
    left += outline.width * scale + COUNTRY_GAP;
    return at;
  });
  const r = (v: number) => Math.round(v * 100) / 100;
  const countries = placed.map(({ outline, scale, left: x0, top: y0 }) => ({
    name: outline.name,
    path: outline.path.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${r(x0 + Number(x) * scale)},${r(y0 + Number(y) * scale)}`),
    left: x0,
    top: y0,
    width: outline.width * scale,
    height: outline.height * scale,
  }));
  const positions = new Map<string, [number, number]>();
  const pinned = new Map<string, number>();
  let held = 0;
  for (const game of abroad) {
    const outline = countryOf(game);
    const at = outline ? placed.find((p) => p.outline === outline) : undefined;
    if (!at) {
      positions.set(game.id, internationalSlotPosition(held++));
      continue;
    }
    const city = game.venue?.city ? plain(game.venue.city) : "";
    const [cx, cy] = at.outline.cities[CITY_ALIASES[city] ?? city] ?? [at.outline.width / 2, at.outline.height / 2];
    const spot = `${at.outline.name}:${cx},${cy}`;
    const before = pinned.get(spot) ?? 0;
    pinned.set(spot, before + 1);
    positions.set(game.id, [at.left + cx * at.scale + before * SAME_CITY_STEP, at.top + cy * at.scale]);
  }
  return { countries, positions };
}

// Kickoff-time gradient tokens (see globals.css) — cool/dark for the week's
// earliest window through warm/light for its latest.
const KICKOFF_GRADIENT_TOKENS = [
  "--kickoff-1",
  "--kickoff-2",
  "--kickoff-3",
  "--kickoff-4",
  "--kickoff-5",
  "--kickoff-6",
];

/** One of the week's distinct kickoff windows (e.g. every Sunday-1pm game shares one), earliest first. */
export interface KickoffSlot {
  /** The earliest kickoff (ms) among games in this window — what orders slots and labels the legend. */
  sortTime: number;
}

// The four parts of a day a kickoff window can fall in, by local start hour.
// Anything before 5am belongs to the previous day's Night (a late West Coast
// kickoff seen from further east is still that evening's game).
const DAYPARTS: { name: string; from: number }[] = [
  { name: "Morning", from: 5 },
  { name: "Noon", from: 12 },
  { name: "Afternoon", from: 15 },
  { name: "Night", from: 18 },
];
const NIGHT_SPILLS_UNTIL = 5;

/** The calendar day (local) a kickoff counts toward, and which part of it. */
function daypart(at: Date): { day: Date; part: number } {
  const hour = at.getHours();
  if (hour < NIGHT_SPILLS_UNTIL) {
    const day = new Date(at);
    day.setDate(day.getDate() - 1);
    return { day, part: DAYPARTS.length - 1 };
  }
  let part = 0;
  DAYPARTS.forEach((p, i) => {
    if (hour >= p.from) part = i;
  });
  return { day: at, part };
}

/**
 * Buckets games into their kickoff window — the day plus Morning, Noon,
 * Afternoon or Night — so every Thursday-night game lands together, every
 * Sunday-1pm game lands together, distinct from the 4:05/4:25 window and
 * from Sunday night — without hardcoding the league's actual slot schedule
 * (byes, flexes, and international windows all still fall out naturally).
 */
function kickoffBucketKey(kickoff: string): { key: string; sortTime: number } | null {
  const at = new Date(kickoff);
  if (Number.isNaN(at.getTime())) return null;
  const { day, part } = daypart(at);
  return { key: `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}-${part}`, sortTime: at.getTime() };
}

/**
 * Orders this week's games into their distinct kickoff windows, earliest
 * first, and maps each game to its position among them — the input to
 * kickoffSlotColor. A week with a Wednesday opener, Thursday night, three
 * Sunday windows, and Monday night comes back with 6 slots in that order;
 * a lighter week comes back with fewer, and the gradient still spans its
 * full range across whatever's actually on the slate.
 */
export function computeKickoffSlots(games: NFLGame[]): {
  slotIndexByGameId: Map<string, number>;
  slots: KickoffSlot[];
} {
  const earliestByBucket = new Map<string, number>();
  for (const game of games) {
    const bucket = kickoffBucketKey(game.kickoff);
    if (!bucket) continue;
    const existing = earliestByBucket.get(bucket.key);
    if (existing === undefined || bucket.sortTime < existing) {
      earliestByBucket.set(bucket.key, bucket.sortTime);
    }
  }

  const orderedKeys = [...earliestByBucket.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key);
  const slotIndexByKey = new Map(orderedKeys.map((key, i) => [key, i]));

  const slotIndexByGameId = new Map<string, number>();
  for (const game of games) {
    const bucket = kickoffBucketKey(game.kickoff);
    if (!bucket) continue;
    slotIndexByGameId.set(game.id, slotIndexByKey.get(bucket.key) ?? 0);
  }

  return {
    slotIndexByGameId,
    slots: orderedKeys.map((key) => ({ sortTime: earliestByBucket.get(key)! })),
  };
}

/** The gradient colour for a game's kickoff-window rank among `totalSlots` this week — first slot gets the coolest stop, last gets the warmest. */
export function kickoffSlotColor(slotIndex: number, totalSlots: number): string {
  if (totalSlots <= 1) return `var(${KICKOFF_GRADIENT_TOKENS[0]})`;
  const steps = KICKOFF_GRADIENT_TOKENS.length - 1;
  const token = KICKOFF_GRADIENT_TOKENS[Math.round((slotIndex * steps) / (totalSlots - 1))];
  return `var(${token})`;
}

/** A compact "Wed 8p" label for a kickoff-window's legend entry. */
export function kickoffSlotLabel(sortTime: number): string {
  const at = new Date(sortTime);
  const weekday = at.toLocaleDateString([], { weekday: "short" });
  let hour = at.getHours() % 12;
  if (hour === 0) hour = 12;
  const meridiem = at.getHours() < 12 ? "a" : "p";
  return `${weekday} ${hour}${meridiem}`;
}

/** A human-readable "Thursday Night" / "Sunday Noon" label for a kickoff window — only ever Morning, Noon, Afternoon or Night — for a section header with room to spell it out (unlike the map legend's compact kickoffSlotLabel). */
export function kickoffSlotLongLabel(sortTime: number): string {
  const { day, part } = daypart(new Date(sortTime));
  return `${day.toLocaleDateString([], { weekday: "long" })} ${DAYPARTS[part].name}`;
}

/** The kickoff window label a game falls in (see kickoffSlotLongLabel), or "TBD" when its kickoff can't be read — the key the dashboard toggles whole slates by. */
export function kickoffBlockLabel(game: NFLGame): string {
  const t = new Date(game.kickoff).getTime();
  return Number.isNaN(t) ? "TBD" : kickoffSlotLongLabel(t);
}
