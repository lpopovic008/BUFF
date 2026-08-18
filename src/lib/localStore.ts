// Browser-only persistence for app config and the recap archive.
// GitHub Pages is static hosting — there's no server to write files to —
// so everything lives in this browser's localStorage instead. That means
// settings and saved recaps are per-browser, not synced across devices.

const CONFIG_KEY = "buff:config";
const RECAPS_KEY = "buff:recaps";
const BOWL_PICKS_KEY = "buff:bowl-picks";

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

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getConfig(): AppConfig {
  if (!isBrowser()) return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AppConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: AppConfig): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function upsertLeague(league: TrackedLeague): AppConfig {
  const config = getConfig();
  const i = config.leagues.findIndex((l) => l.leagueId === league.leagueId);
  if (i >= 0) config.leagues[i] = { ...config.leagues[i], ...league };
  else config.leagues.push(league);
  saveConfig(config);
  return config;
}

export function removeLeague(leagueId: string): AppConfig {
  const config = getConfig();
  config.leagues = config.leagues.filter((l) => l.leagueId !== leagueId);
  saveConfig(config);
  return config;
}

/**
 * Moves a league one slot up or down. The stored array order is the display
 * order everywhere, so this is all reordering needs to be.
 */
export function moveLeague(leagueId: string, direction: "up" | "down"): AppConfig {
  const config = getConfig();
  const from = config.leagues.findIndex((l) => l.leagueId === leagueId);
  if (from < 0) return config;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= config.leagues.length) return config;
  const [moved] = config.leagues.splice(from, 1);
  config.leagues.splice(to, 0, moved);
  saveConfig(config);
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

function recapKey(leagueId: string, season: string, week: number): string {
  return `${leagueId}:${season}:${week}`;
}

function readRecaps(): Record<string, SavedRecap> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(RECAPS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SavedRecap>) : {};
  } catch {
    return {};
  }
}

function writeRecaps(recaps: Record<string, SavedRecap>): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(RECAPS_KEY, JSON.stringify(recaps));
}

export function saveRecap(recap: SavedRecap): void {
  const recaps = readRecaps();
  recaps[recapKey(recap.leagueId, recap.season, recap.week)] = recap;
  writeRecaps(recaps);
}

export function getRecap(leagueId: string, season: string, week: number): SavedRecap | null {
  const recaps = readRecaps();
  return recaps[recapKey(leagueId, season, week)] ?? null;
}

export function listRecaps(leagueId: string): SavedRecap[] {
  const recaps = readRecaps();
  return Object.values(recaps)
    .filter((r) => r.leagueId === leagueId)
    .sort((a, b) => (a.season === b.season ? b.week - a.week : b.season.localeCompare(a.season)));
}

export function deleteRecap(leagueId: string, season: string, week: number): void {
  const recaps = readRecaps();
  delete recaps[recapKey(leagueId, season, week)];
  writeRecaps(recaps);
}

/** The commish's picks for a week's marquee matchup(s) — a name plus the two teams (by roster id) it's between, to build the recap's "Matchup of the Week"/"Honorable Mention" narrative around. */
export interface BowlGamePick {
  name: string;
  rosterIds: number[];
}

export interface RecapBowlPicks {
  bowlOfWeek: BowlGamePick;
  honorableBowl: BowlGamePick;
}

const EMPTY_BOWL_PICK: BowlGamePick = { name: "", rosterIds: [] };
const EMPTY_BOWL_PICKS: RecapBowlPicks = { bowlOfWeek: { ...EMPTY_BOWL_PICK }, honorableBowl: { ...EMPTY_BOWL_PICK } };

function readBowlPicks(): Record<string, RecapBowlPicks> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(BOWL_PICKS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RecapBowlPicks>) : {};
  } catch {
    return {};
  }
}

function writeBowlPicks(picks: Record<string, RecapBowlPicks>): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(BOWL_PICKS_KEY, JSON.stringify(picks));
}

/** Stored separately from SavedRecap so setting picks doesn't imply a recap draft has been saved. */
export function getBowlPicks(leagueId: string, season: string, week: number): RecapBowlPicks {
  const all = readBowlPicks();
  return all[recapKey(leagueId, season, week)] ?? EMPTY_BOWL_PICKS;
}

export function saveBowlPicks(leagueId: string, season: string, week: number, picks: RecapBowlPicks): void {
  const all = readBowlPicks();
  all[recapKey(leagueId, season, week)] = picks;
  writeBowlPicks(all);
}

/** Exports everything as a JSON blob the user can save as a manual backup or move to another browser. */
export function exportAllData(): string {
  return JSON.stringify(
    { config: getConfig(), recaps: readRecaps(), bowlPicks: readBowlPicks() },
    null,
    2
  );
}

export function importAllData(json: string): void {
  const parsed = JSON.parse(json) as {
    config?: AppConfig;
    recaps?: Record<string, SavedRecap>;
    bowlPicks?: Record<string, RecapBowlPicks>;
  };
  if (parsed.config) saveConfig(parsed.config);
  if (parsed.recaps) writeRecaps(parsed.recaps);
  if (parsed.bowlPicks) writeBowlPicks(parsed.bowlPicks);
}
