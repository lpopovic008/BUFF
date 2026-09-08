// Groups every starter you have across all your leagues into the NFL games
// they're actually playing in, so one glance says who's on the field in each
// window. Pure logic — the fetching lives in hooks/useMyStarters.ts.

import { NFLGame } from "./nfl-schedule";

export interface StarterEntry {
  playerId: string;
  name: string;
  position: string;
  /** NFL team abbreviation — null for an empty lineup slot or an unresolved player. */
  team: string | null;
  leagueId: string;
  leagueName: string;
}

export interface GameStarters {
  game: NFLGame;
  /** Your starters in this game, home team's players first, then by position. */
  players: StarterEntry[];
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

function positionRank(position: string): number {
  const i = POSITION_ORDER.indexOf(position);
  return i === -1 ? POSITION_ORDER.length : i;
}

function kickoffTime(game: NFLGame): number {
  const t = new Date(game.kickoff).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/**
 * Splits your starters across the week's games. Only games you actually have
 * someone in come back, earliest kickoff first; anyone whose team isn't
 * playing this week (bye, or an empty lineup slot) is handed back separately
 * rather than dropped, so a bye never silently hides a player.
 */
export function groupStartersByGame(
  starters: StarterEntry[],
  games: NFLGame[]
): { games: GameStarters[]; notPlaying: StarterEntry[] } {
  const gameForTeam = new Map<string, NFLGame>();
  for (const game of games) {
    gameForTeam.set(game.homeTeam, game);
    gameForTeam.set(game.awayTeam, game);
  }

  const byGameId = new Map<string, GameStarters>();
  const notPlaying: StarterEntry[] = [];
  for (const starter of starters) {
    const game = starter.team ? gameForTeam.get(starter.team) : undefined;
    if (!game) {
      notPlaying.push(starter);
      continue;
    }
    const bucket = byGameId.get(game.id) ?? { game, players: [] };
    bucket.players.push(starter);
    byGameId.set(game.id, bucket);
  }

  const grouped = [...byGameId.values()].sort((a, b) => kickoffTime(a.game) - kickoffTime(b.game));
  for (const entry of grouped) {
    entry.players.sort(
      (a, b) =>
        positionRank(a.position) - positionRank(b.position) || a.name.localeCompare(b.name)
    );
  }
  return { games: grouped, notPlaying };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The kickoff half of a game header: "8:20 PM Thu" for anything inside the
 * next week, and "8:20 PM 9/10" beyond that, where a weekday alone stops
 * telling you which week it means.
 */
export function formatKickoff(kickoff: string, now: Date = new Date()): string {
  const at = new Date(kickoff);
  if (Number.isNaN(at.getTime())) return "TBD";
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const withinAWeek = at.getTime() - now.getTime() < 7 * DAY_MS;
  const day = withinAWeek
    ? at.toLocaleDateString([], { weekday: "short" })
    : `${at.getMonth() + 1}/${at.getDate()}`;
  return `${time} ${day}`;
}

/** The whole game header, e.g. "LAR vs SF @ 8:20 PM Thu" — host first, which is what "vs" means. */
export function formatGameHeader(game: NFLGame, now: Date = new Date()): string {
  return `${game.homeTeam} vs ${game.awayTeam} @ ${formatKickoff(game.kickoff, now)}`;
}
