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
