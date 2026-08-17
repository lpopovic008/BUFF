import { promises as fs } from "fs";
import path from "path";

// Flat-file persistence for app config and the weekly recap archive.
// This is intentionally simple (no DB) so the dashboard runs anywhere with
// a writable disk — a home server, a Docker container, a long-lived VM.
// Serverless platforms with ephemeral/read-only filesystems (e.g. default
// Vercel deploys) will not persist writes between requests; see README.

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const RECAPS_DIR = path.join(DATA_DIR, "recaps");

export interface TrackedLeague {
  leagueId: string;
  nickname?: string;
  isCommish: boolean;
}

export interface AppConfig {
  sleeperUsername: string | null;
  sleeperUserId: string | null;
  season: string;
  leagues: TrackedLeague[];
}

const DEFAULT_CONFIG: AppConfig = {
  sleeperUsername: null,
  sleeperUserId: null,
  season: String(new Date().getFullYear()),
  leagues: [],
};

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(RECAPS_DIR, { recursive: true });
}

export async function getConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function upsertLeague(league: TrackedLeague): Promise<AppConfig> {
  const config = await getConfig();
  const existingIndex = config.leagues.findIndex((l) => l.leagueId === league.leagueId);
  if (existingIndex >= 0) {
    config.leagues[existingIndex] = { ...config.leagues[existingIndex], ...league };
  } else {
    config.leagues.push(league);
  }
  await saveConfig(config);
  return config;
}

export async function removeLeague(leagueId: string): Promise<AppConfig> {
  const config = await getConfig();
  config.leagues = config.leagues.filter((l) => l.leagueId !== leagueId);
  await saveConfig(config);
  return config;
}

export interface SavedRecap {
  leagueId: string;
  season: string;
  week: number;
  title: string;
  body: string;
  savedAt: string;
}

function recapFileName(season: string, week: number): string {
  return `${season}-week${String(week).padStart(2, "0")}.json`;
}

export async function saveRecap(recap: SavedRecap): Promise<void> {
  await ensureDataDir();
  const dir = path.join(RECAPS_DIR, recap.leagueId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, recapFileName(recap.season, recap.week));
  await fs.writeFile(file, JSON.stringify(recap, null, 2));
}

export async function getRecap(
  leagueId: string,
  season: string,
  week: number
): Promise<SavedRecap | null> {
  try {
    const file = path.join(RECAPS_DIR, leagueId, recapFileName(season, week));
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as SavedRecap;
  } catch {
    return null;
  }
}

export async function listRecaps(leagueId: string): Promise<SavedRecap[]> {
  try {
    const dir = path.join(RECAPS_DIR, leagueId);
    const files = await fs.readdir(dir);
    const recaps = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const raw = await fs.readFile(path.join(dir, f), "utf8");
          return JSON.parse(raw) as SavedRecap;
        })
    );
    return recaps.sort((a, b) => (a.season === b.season ? b.week - a.week : b.season.localeCompare(a.season)));
  } catch {
    return [];
  }
}

export async function deleteRecap(leagueId: string, season: string, week: number): Promise<void> {
  try {
    const file = path.join(RECAPS_DIR, leagueId, recapFileName(season, week));
    await fs.unlink(file);
  } catch {
    // already gone
  }
}
