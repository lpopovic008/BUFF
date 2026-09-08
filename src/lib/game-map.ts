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
