// Groups every starter you have across all your leagues into the NFL games
// they're actually playing in, so one glance says who's on the field in each
// window. Pure logic — the fetching lives in hooks/useMyStarters.ts.

import { NFLGame } from "./nfl-schedule";
import { computeKickoffSlots, kickoffBlockLabel, kickoffSlotColor, kickoffSlotLongLabel } from "./game-map";

export interface StarterEntry {
  playerId: string;
  name: string;
  position: string;
  /** NFL team abbreviation — null for an empty lineup slot or an unresolved player. */
  team: string | null;
  leagueId: string;
  leagueName: string;
  /** This week's fantasy points under this league's scoring — null when Sleeper hasn't posted the matchup yet. */
  points: number | null;
}

/** Whose a player in a game's list is: one of your starters, one you're facing this week, or anyone else in the game. */
export type PlayerSide = "mine" | "opponent" | "other";

/** A starter deduped across leagues — one row per unique player, with every league they're started in. */
export interface GroupedStarter {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  leagueIds: string[];
  /** Points under the first league's scoring (leagues can score differently); see pointsByLeague for the rest. */
  points: number | null;
  pointsByLeague: Record<string, number | null>;
  /** Whose player this is — your own when unset. */
  side?: PlayerSide;
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
      existing.pointsByLeague[starter.leagueId] = starter.points;
    } else {
      byPlayer.set(starter.playerId, {
        playerId: starter.playerId,
        name: starter.name,
        position: starter.position,
        team: starter.team,
        leagueIds: [starter.leagueId],
        points: starter.points,
        pointsByLeague: { [starter.leagueId]: starter.points },
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

/** Anyone in a live game: their PPR points so far this week and Sleeper's projection for it. */
export interface LivePlayerLine {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  points: number;
  projected: number | null;
}

/** Someone who isn't in your matchups shows up in a live game's list once they've scored, or if they're projected for at least this many points. */
export const LIVE_PROJECTION_FLOOR = 6;

/**
 * Everyone worth watching in one game of a live time block: your starters,
 * the starters you're facing, and anyone else in the game who has scored
 * (or lost) fantasy points or is projected for LIVE_PROJECTION_FLOOR or more.
 * A player in more than one of those shows once — yours first, then
 * opponents'. Ordered by points scored, then by projection.
 */
export function liveGameRows(
  game: NFLGame,
  mine: GroupedStarter[],
  opponent: GroupedStarter[],
  lines: LivePlayerLine[],
  projected: Record<string, number>
): GroupedStarter[] {
  const seen = new Set<string>();
  const rows: { row: GroupedStarter; points: number; projected: number }[] = [];
  const add = (row: GroupedStarter) => {
    if (seen.has(row.playerId)) return;
    seen.add(row.playerId);
    rows.push({ row, points: row.points ?? 0, projected: projected[row.playerId] ?? -Infinity });
  };
  for (const p of mine) add({ ...p, side: "mine" });
  for (const p of opponent) add({ ...p, side: "opponent" });
  for (const line of lines) {
    if (line.team !== game.homeTeam && line.team !== game.awayTeam) continue;
    if (line.points === 0 && (line.projected ?? 0) < LIVE_PROJECTION_FLOOR) continue;
    add({
      playerId: line.playerId,
      name: line.name,
      position: line.position,
      team: line.team,
      leagueIds: [],
      points: line.points,
      pointsByLeague: {},
      side: "other",
    });
  }
  return rows
    .sort((a, b) => b.points - a.points || b.projected - a.projected || a.row.name.localeCompare(b.row.name))
    .map((r) => r.row);
}

/**
 * Points from plays Sleeper hasn't counted yet, by player id, each with the
 * Sleeper number they were worked out against: once Sleeper's number moves
 * on, they no longer apply.
 */
export type PendingPoints = Record<string, { points: number; basis: number | null }>;

/** A player with points still to come added to their Sleeper number — under every league's scoring alike. */
function withPending(player: GroupedStarter, pending: PendingPoints[string] | undefined): GroupedStarter {
  if (!pending || pending.basis !== player.points) return player;
  const add = (points: number | null) => (points === null ? null : Math.round((points + pending.points) * 100) / 100);
  return {
    ...player,
    points: add(player.points),
    pointsByLeague: Object.fromEntries(Object.entries(player.pointsByLeague).map(([id, points]) => [id, add(points)])),
  };
}

/**
 * The starters list's games: just your starters in each game, except in a
 * time block that's being played, where each game lists everyone worth
 * watching (see liveGameRows). `pending` is points from plays Sleeper hasn't
 * counted yet (see PendingPoints), added on before anyone's sorted. Games come
 * back in kickoff order; one with nobody to list is left out.
 */
export function startersListGames(
  weekGames: NFLGame[],
  mine: GameStarters[],
  opponent: GameStarters[],
  liveBlocks: Set<string>,
  lines: LivePlayerLine[],
  projected: Record<string, number>,
  pending: PendingPoints = {}
): GameStarters[] {
  const adjust = (players: GroupedStarter[]) => players.map((p) => withPending(p, pending[p.playerId]));
  const mineByGameId = new Map(mine.map((g) => [g.game.id, adjust(g.players)]));
  if (liveBlocks.size === 0) return mine.map((g) => ({ game: g.game, players: mineByGameId.get(g.game.id)! }));
  const opponentByGameId = new Map(opponent.map((g) => [g.game.id, adjust(g.players)]));
  const adjustedLines = lines.map((l) => {
    const p = pending[l.playerId];
    return p && p.basis === l.points ? { ...l, points: Math.round((l.points + p.points) * 100) / 100 } : l;
  });
  const out: GameStarters[] = [];
  for (const game of [...weekGames].sort((a, b) => kickoffTime(a) - kickoffTime(b))) {
    const myPlayers = mineByGameId.get(game.id) ?? [];
    const players = liveBlocks.has(kickoffBlockLabel(game))
      ? liveGameRows(game, myPlayers, opponentByGameId.get(game.id) ?? [], adjustedLines, projected)
      : myPlayers;
    if (players.length > 0) out.push({ game, players });
  }
  return out;
}

/**
 * The kickoff windows (see kickoffBlockLabel) being played right now: at
 * least one game has kicked off and not every game is final.
 */
export function liveBlockLabels(games: NFLGame[]): Set<string> {
  const byLabel = new Map<string, NFLGame[]>();
  for (const game of games) {
    const label = kickoffBlockLabel(game);
    byLabel.set(label, [...(byLabel.get(label) ?? []), game]);
  }
  const live = new Set<string>();
  for (const [label, block] of byLabel) {
    if (block.some((g) => g.state !== "pre") && !block.every((g) => g.state === "post")) live.add(label);
  }
  return live;
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

/** Just the kickoff time, e.g. "8:20 PM" — no weekday, for a header that already states the day elsewhere. */
export function formatKickoffTime(kickoff: string): string {
  const at = new Date(kickoff);
  if (Number.isNaN(at.getTime())) return "TBD";
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The whole game header, e.g. "SF @ LAR — 8:20 PM Thu" — standard away-@-home notation. */
export function formatGameHeader(game: NFLGame, now: Date = new Date()): string {
  return `${formatTeamMatchup(game)} — ${formatKickoff(game.kickoff, now)}`;
}

/** Just the team matchup half of a game header, e.g. "SF @ LAR" — away team first, "@" meaning "at" the home team, no kickoff. */
export function formatTeamMatchup(game: NFLGame): string {
  return `${game.awayTeam} @ ${game.homeTeam}`;
}

/** One kickoff window's worth of games — one column in the starters-by-game swipe view. */
export interface TimeBlockColumn {
  /** e.g. "Sunday Noon" — a spelled-out window name, since the map's own legend already has the compact "Sun 1p" form. */
  label: string;
  games: GameStarters[];
  /** The same colour the map uses for this kickoff window (see kickoffSlotColor) — undefined for the trailing TBD column, which isn't a real window. */
  color?: string;
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
  const columns: TimeBlockColumn[] = slots.map((slot, i) => ({
    label: kickoffSlotLongLabel(slot.sortTime),
    games: [],
    color: kickoffSlotColor(i, slots.length),
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

/** Whether every game in a time block has ended. */
export function isBlockFinal(column: TimeBlockColumn): boolean {
  return column.games.length > 0 && column.games.every(({ game }) => game.state === "post");
}

/**
 * The time blocks with every finished one moved to the bottom, so the next
 * block to play (or the one being played) is always on top. Each group keeps
 * its kickoff order — the blocks still to come in time order, then the
 * finished ones in the order they were played.
 */
export function finishedBlocksLast(columns: TimeBlockColumn[]): TimeBlockColumn[] {
  return [...columns.filter((c) => !isBlockFinal(c)), ...columns.filter(isBlockFinal)];
}
