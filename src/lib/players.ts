import { promises as fs } from "fs";
import path from "path";

// The /players/nfl endpoint is a multi-megabyte dump of every NFL player.
// It only changes with roster moves league-wide (rarely, intraday), so we
// cache it to disk for a day and resolve names from that cache. Failures
// (no network, first run offline) degrade gracefully to raw player ids.

const CACHE_PATH = path.join(process.cwd(), "data", "cache", "players.json");
const TTL_MS = 24 * 60 * 60 * 1000;

interface PlayerRecord {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
}

interface PlayersCache {
  fetchedAt: number;
  players: Record<string, PlayerRecord>;
}

let memoryCache: PlayersCache | null = null;

async function readDiskCache(): Promise<PlayersCache | null> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as PlayersCache;
  } catch {
    return null;
  }
}

async function writeDiskCache(cache: PlayersCache): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache));
}

async function loadPlayers(): Promise<PlayersCache | null> {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < TTL_MS) {
    return memoryCache;
  }
  const disk = await readDiskCache();
  if (disk && Date.now() - disk.fetchedAt < TTL_MS) {
    memoryCache = disk;
    return disk;
  }
  try {
    const res = await fetch("https://api.sleeper.app/v1/players/nfl", {
      next: { revalidate: TTL_MS / 1000 },
    });
    if (!res.ok) return disk ?? null;
    const players = (await res.json()) as Record<string, PlayerRecord>;
    const fresh: PlayersCache = { fetchedAt: Date.now(), players };
    memoryCache = fresh;
    await writeDiskCache(fresh).catch(() => {});
    return fresh;
  } catch {
    // Offline or blocked network — fall back to a stale disk cache if we have one.
    return disk ?? null;
  }
}

/** Resolves player ids to display names, e.g. "Bijan Robinson (RB)". Falls back to the raw id. */
export async function resolvePlayerNames(
  playerIds: string[]
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(playerIds));
  const cache = await loadPlayers();
  const out: Record<string, string> = {};
  for (const id of unique) {
    const record = cache?.players[id];
    if (record?.full_name) {
      out[id] = record.position ? `${record.full_name} (${record.position})` : record.full_name;
    } else {
      out[id] = `Player ${id}`;
    }
  }
  return out;
}
