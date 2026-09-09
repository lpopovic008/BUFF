// Where a game belongs on the dashboard's US map, and which colour marks each
// league in the starters list.

import { isOutsideUS, NFLGame } from "./nfl-schedule";
import { TEAM_CITIES } from "./warroom-team-cities";

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
  if (isOutsideUS(game)) return null;

  if (game.neutralSite && game.venue?.city) {
    const label = game.venue.state ? `${game.venue.city}, ${game.venue.state}` : game.venue.city;
    const match = Object.values(TEAM_CITIES).find(
      (city) => city.city.toLowerCase() === label.toLowerCase()
    );
    if (match) return match.pos;
  }

  return TEAM_CITIES[game.homeTeam]?.pos ?? null;
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
 * A fixed slot for an international game's dot, in a small cluster tucked
 * into the map's top-right corner — there's no meaningful US position for a
 * game played abroad, so these get their own reserved row instead.
 */
export function internationalSlotPosition(index: number): [number, number] {
  const perRow = 4;
  const spacing = 14;
  const originX = 258;
  const originY = 10;
  return [originX + (index % perRow) * spacing, originY + Math.floor(index / perRow) * spacing];
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

/**
 * Buckets games into their kickoff window — weekday plus a coarse 3-hour
 * block, so every Thursday-night game lands together, every Sunday-1pm game
 * lands together, distinct from the 4:05/4:25 window and from Sunday night —
 * without hardcoding the league's actual slot schedule (byes, flexes, and
 * international windows all still fall out naturally).
 */
function kickoffBucketKey(kickoff: string): { key: string; sortTime: number } | null {
  const at = new Date(kickoff);
  if (Number.isNaN(at.getTime())) return null;
  const weekday = at.getDay();
  const hourBlock = Math.floor(at.getHours() / 3);
  return { key: `${weekday}-${hourBlock}`, sortTime: at.getTime() };
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
