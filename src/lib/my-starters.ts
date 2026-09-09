// Groups every starter you have across all your leagues into the NFL games
// they're actually playing in, so one glance says who's on the field in each
// window. Pure logic — the fetching lives in hooks/useMyStarters.ts.

import { NFLGame } from "./nfl-schedule";
import { computeKickoffSlots, kickoffSlotLabel } from "./game-map";

export interface StarterEntry {
  playerId: string;
  name: string;
  position: string;
  /** NFL team abbreviation — null for an empty lineup slot or an unresolved player. */
  team: string | null;
  leagueId: string;
  leagueName: string;
}

/** A starter deduped across leagues — one row per unique player, with every league they're started in. */
export interface GroupedStarter {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  leagueIds: string[];
}

export interface GameStarters {
  game: NFLGame;
  /** Your starters in this game, deduped by player, then by position. */
  players: GroupedStarter[];
}

/**
 * Collapses per-league starter entries into one row per unique player,
 * accumulating the leagues they're started in (in first-appearance order)
 * so a player rostered in two or more leagues shows up once with a
 * `leagueIds` list instead of one row per league.
 */
export function dedupeStarters(starters: StarterEntry[]): GroupedStarter[] {
  const byPlayer = new Map<string, GroupedStarter>();
  for (const starter of starters) {
    const existing = byPlayer.get(starter.playerId);
    if (existing) {
      existing.leagueIds.push(starter.leagueId);
    } else {
      byPlayer.set(starter.playerId, {
        playerId: starter.playerId,
        name: starter.name,
        position: starter.position,
        team: starter.team,
        leagueIds: [starter.leagueId],
      });
    }
  }
  return [...byPlayer.values()];
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
): { games: GameStarters[]; notPlaying: GroupedStarter[] } {
  const gameForTeam = new Map<string, NFLGame>();
  for (const game of games) {
    gameForTeam.set(game.homeTeam, game);
    gameForTeam.set(game.awayTeam, game);
  }

  const byGameId = new Map<string, { game: NFLGame; players: StarterEntry[] }>();
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

  const grouped = [...byGameId.values()]
    .sort((a, b) => kickoffTime(a.game) - kickoffTime(b.game))
    .map((entry) => ({
      game: entry.game,
      players: dedupeStarters(entry.players).sort(
        (a, b) => positionRank(a.position) - positionRank(b.position) || a.name.localeCompare(b.name)
      ),
    }));
  return { games: grouped, notPlaying: dedupeStarters(notPlaying) };
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

/** The whole game header, e.g. "SF vs LAR @ 8:20 PM Thu" — away team first. */
export function formatGameHeader(game: NFLGame, now: Date = new Date()): string {
  return `${game.awayTeam} vs ${game.homeTeam} @ ${formatKickoff(game.kickoff, now)}`;
}

/** Just the team matchup half of a game header, e.g. "SF vs LAR" — away team first, no kickoff. */
export function formatTeamMatchup(game: NFLGame): string {
  return `${game.awayTeam} vs ${game.homeTeam}`;
}

/** One kickoff window's worth of games — one column in the starters-by-game swipe view. */
export interface TimeBlockColumn {
  /** e.g. "Wed 8p" — same labeling as the map's kickoff legend, so the two stay recognizable as the same scale. */
  label: string;
  games: GameStarters[];
}

/**
 * Buckets this week's games into columns by kickoff window (same windowing
 * as the map's kickoff gradient — see computeKickoffSlots), earliest first:
 * every Wednesday-night game in one column, every Sunday-1pm game in the
 * next, and so on. Games within a column keep the kickoff order they arrive
 * in (groupStartersByGame already sorts the whole list chronologically).
 * A game whose kickoff can't be parsed still needs somewhere to live — it
 * lands in a trailing "TBD" column rather than vanishing.
 */
export function groupGamesByTimeBlock(games: GameStarters[]): TimeBlockColumn[] {
  const { slotIndexByGameId, slots } = computeKickoffSlots(games.map((g) => g.game));
  const columns: TimeBlockColumn[] = slots.map((slot) => ({
    label: kickoffSlotLabel(slot.sortTime),
    games: [],
  }));

  const unresolved: GameStarters[] = [];
  for (const entry of games) {
    const slotIndex = slotIndexByGameId.get(entry.game.id);
    if (slotIndex === undefined) {
      unresolved.push(entry);
      continue;
    }
    columns[slotIndex].games.push(entry);
  }
  if (unresolved.length > 0) columns.push({ label: "TBD", games: unresolved });

  return columns.filter((col) => col.games.length > 0);
}
