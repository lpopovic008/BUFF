// The /players/nfl endpoint is a multi-megabyte dump of every NFL player.
// It only changes with roster moves league-wide (rarely, intraday), so we
// fetch it once per browser tab and keep it in memory — no disk/localStorage
// cache, since 5MB+ comfortably blows past typical localStorage quotas.
// Failures (no network) degrade gracefully to raw player ids.

import { normalizeName } from "./name-match";

interface PlayerRecord {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  active?: boolean;
  age?: number | null;
  years_exp?: number | null;
  college?: string | null;
  number?: number | string | null;
  /** Where they stand on their team's depth chart at their position (1, the starter). */
  depth_chart_order?: number | null;
  /** Inches, as a string ("74"). */
  height?: string | null;
  weight?: string | null;
}

let cache: Record<string, PlayerRecord> | null = null;
let inflight: Promise<Record<string, PlayerRecord> | null> | null = null;

async function loadPlayers(): Promise<Record<string, PlayerRecord> | null> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("https://api.sleeper.app/v1/players/nfl")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, PlayerRecord> | null) => {
        cache = data;
        return data;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Who a player is beyond his name: age, years in the league, college, jersey number, height (inches) and weight. */
export interface PlayerBio {
  age: number | null;
  yearsExp: number | null;
  college: string | null;
  number: string | null;
  height: number | null;
  weight: number | null;
}

export async function getPlayerBio(playerId: string): Promise<PlayerBio | null> {
  const record = (await loadPlayers())?.[playerId];
  if (!record) return null;
  const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    age: num(record.age),
    yearsExp: num(record.years_exp),
    college: record.college || null,
    number: record.number == null || record.number === "" ? null : String(record.number),
    height: num(record.height),
    weight: num(record.weight),
  };
}

/** Resolves player ids to display names, e.g. "Bijan Robinson (RB)". Falls back to the raw id. */
export async function resolvePlayerNames(playerIds: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(playerIds));
  const players = await loadPlayers();
  const out: Record<string, string> = {};
  for (const id of unique) {
    const record = players?.[id];
    if (record?.full_name) {
      out[id] = record.position ? `${record.full_name} (${record.position})` : record.full_name;
    } else {
      out[id] = `Player ${id}`;
    }
  }
  return out;
}

export interface ResolvedPlayer {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
}

/** Same lookup as resolvePlayerNames but keeps name/position/team separate for cross-referencing against other sources (e.g. KTC values by name). */
export async function resolvePlayers(playerIds: string[]): Promise<ResolvedPlayer[]> {
  const unique = Array.from(new Set(playerIds)).filter((id) => id && id !== "0");
  const players = await loadPlayers();
  return unique.map((id) => {
    const record = players?.[id];
    return {
      playerId: id,
      name: record?.full_name || `Player ${id}`,
      position: record?.position ?? "UNK",
      team: record?.team ?? null,
    };
  });
}

let idIndexCache: Map<string, string> | null = null;

/**
 * Maps `${position}-${normalizeName(fullName)}` -> Sleeper player_id, built
 * from the full player dump — for matching a name-only source (KTC, yafsb's
 * ADP data) to Sleeper's id-keyed data, e.g. the projections endpoint. Not
 * cached if the underlying dump fails to load, so a later retry can still
 * succeed once the network is back.
 */
export async function loadPlayerIdIndex(): Promise<Map<string, string>> {
  if (idIndexCache) return idIndexCache;
  const players = await loadPlayers();
  if (!players) return new Map();
  const idx = new Map<string, string>();
  for (const [id, record] of Object.entries(players)) {
    if (!record.full_name || !record.position) continue;
    idx.set(`${record.position}-${normalizeName(record.full_name)}`, id);
  }
  idIndexCache = idx;
  return idx;
}

let teamIndexCache: Map<string, ResolvedPlayer[]> | null = null;

/**
 * Every active player, by NFL team — for matching a name-only source that
 * knows the team (ESPN's play-by-play, "J.Allen" on BUF) to a Sleeper id.
 * Empty if the dump fails to load (and not cached, so a later call can retry).
 */
export async function loadTeamPlayers(): Promise<Map<string, ResolvedPlayer[]>> {
  if (teamIndexCache) return teamIndexCache;
  const players = await loadPlayers();
  if (!players) return new Map();
  const idx = new Map<string, ResolvedPlayer[]>();
  for (const [id, record] of Object.entries(players)) {
    if (!record.team || record.active === false || !record.full_name || !record.position) continue;
    const list = idx.get(record.team) ?? [];
    list.push({ playerId: id, name: record.full_name, position: record.position, team: record.team });
    idx.set(record.team, list);
  }
  teamIndexCache = idx;
  return idx;
}

/** A player as their team's roster has them: their name, position, jersey number, and place on its depth chart. */
export interface RosterPlayer {
  name: string;
  position: string;
  number: string | null;
  depth: number | null;
}

let rosterCache: Map<string, RosterPlayer[]> | null = null;

/**
 * Every active player, by NFL team, with their jersey number — for putting the numbers ESPN's play-by-play names
 * ("J.Allen" on BUF, a tackler on the other side) on their jerseys. Empty if the dump fails to load (and not cached,
 * so a later call can retry).
 */
export async function loadRosters(): Promise<Map<string, RosterPlayer[]>> {
  if (rosterCache) return rosterCache;
  const players = await loadPlayers();
  if (!players) return new Map();
  const idx = new Map<string, RosterPlayer[]>();
  for (const record of Object.values(players)) {
    if (!record.team || record.active === false || !record.full_name || !record.position) continue;
    const list = idx.get(record.team) ?? [];
    list.push({
      name: record.full_name,
      position: record.position,
      number: record.number == null || record.number === "" ? null : String(record.number),
      depth: typeof record.depth_chart_order === "number" ? record.depth_chart_order : null,
    });
    idx.set(record.team, list);
  }
  rosterCache = idx;
  return idx;
}
