// Browser-only persistence for app config and the recap archive.
// GitHub Pages is static hosting — there's no server to write files to —
// so everything lives in this browser's localStorage instead. That means
// settings and saved recaps are per-browser, not synced across devices.

import type { RecapModel } from "./recap-model";

const CONFIG_KEY = "buff:config";
const RECAPS_KEY = "buff:recaps";
const BOWL_PICKS_KEY = "buff:bowl-picks";
const DRAFT_TARGETS_KEY = "buff:draft-targets";

export interface TrackedLeague {
  leagueId: string;
  nickname?: string;
  isCommish: boolean;
}

/**
 * A league on another platform, tracked as an outbound link rather than a
 * full integration — this app has no ESPN/Yahoo login of its own, so
 * clicking through always opens the platform's own site in the browser's
 * normal (already logged-in-or-not) session. `leagueId`/`season` are parsed
 * from the pasted URL when possible so ESPN's public-league read API can be
 * tried client-side (see src/lib/espn.ts); Yahoo has no equivalent no-auth
 * endpoint, so its entries are link-only.
 */
export interface ExternalLeague {
  id: string;
  platform: "espn" | "yahoo";
  url: string;
  nickname?: string;
  leagueId?: string;
  season?: string;
}

export interface AppConfig {
  sleeperUsername: string | null;
  sleeperUserId: string | null;
  season: string;
  leagues: TrackedLeague[];
  externalLeagues: ExternalLeague[];
  /**
   * OAuth "Web application" Client ID for Google Identity Services (see
   * google-auth.ts), pasted in on Settings. Lets "Save to Doc" work without
   * anyone touching the repo's GitHub Actions variables — set per browser,
   * same as everything else in this config. Falls back to the build-time
   * NEXT_PUBLIC_GOOGLE_CLIENT_ID (see google-config.ts) when unset.
   */
  googleClientId: string | null;
}

const DEFAULT_CONFIG: AppConfig = {
  sleeperUsername: null,
  sleeperUserId: null,
  season: String(new Date().getFullYear()),
  leagues: [],
  externalLeagues: [],
  googleClientId: null,
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// A tiny pub-sub so google-drive-sync.ts can push to Drive shortly after any
// local write, without this file needing to know sync exists. Fired from the
// 4 low-level write functions below — every higher-level setter (saveRecap,
// upsertLeague, saveBowlPicks, ...) already funnels through one of them.
const localWriteListeners = new Set<() => void>();

export function onLocalWrite(listener: () => void): () => void {
  localWriteListeners.add(listener);
  return () => localWriteListeners.delete(listener);
}

function notifyLocalWrite(): void {
  for (const listener of localWriteListeners) listener();
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
  notifyLocalWrite();
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

export function addExternalLeague(league: Omit<ExternalLeague, "id">): AppConfig {
  const config = getConfig();
  config.externalLeagues.push({ ...league, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  saveConfig(config);
  return config;
}

export function removeExternalLeague(id: string): AppConfig {
  const config = getConfig();
  config.externalLeagues = config.externalLeagues.filter((l) => l.id !== id);
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
  /** The flat text this recap flattens to — what the archive list, save/copy actions, and Google Doc export all use. Always kept in sync with `model` when one is saved alongside it. */
  body: string;
  /**
   * The recap editor's per-header fields (see recap-model.ts), saved
   * alongside `body` so reopening this recap keeps every box independently
   * editable instead of collapsing back to one flat field. Absent for recaps
   * saved before the header boxes existed, or for leagues without the
   * commissioner house style — those reopen in the plain text box.
   */
  model?: RecapModel;
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
  notifyLocalWrite();
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
  notifyLocalWrite();
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

/**
 * Draft Room's tagged/marked target players — keyed by player identity
 * (position-name, see draftPoolKey), not grid position, so a tag survives a
 * mode switch (dynasty vs fantasy, 1QB vs superflex). Per-browser like
 * everything else here; there's no server to sync it across devices.
 */
export function getDraftTargets(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(DRAFT_TARGETS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveDraftTargets(keys: string[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(DRAFT_TARGETS_KEY, JSON.stringify(keys));
  notifyLocalWrite();
}

const SYNC_STATE_KEY = "buff:sync-state";

/**
 * This browser's own view of where it stands with Google Drive sync — never
 * part of exportAllData/importAllData's payload (it describes this browser,
 * not the league data) and writing it never fires onLocalWrite (it's not
 * itself data worth syncing, and doing so would make every sync retrigger
 * another sync).
 */
export interface SyncState {
  /** When this browser last changed anything, per Date.now() — bumped on every onLocalWrite notification. */
  lastLocalWriteAt: number;
  /** When this browser's data last matched what's on Drive (a push it made, or a pull it applied). */
  lastSyncedAt: number;
}

const DEFAULT_SYNC_STATE: SyncState = { lastLocalWriteAt: 0, lastSyncedAt: 0 };

export function getSyncState(): SyncState {
  if (!isBrowser()) return DEFAULT_SYNC_STATE;
  try {
    const raw = window.localStorage.getItem(SYNC_STATE_KEY);
    return raw ? { ...DEFAULT_SYNC_STATE, ...(JSON.parse(raw) as Partial<SyncState>) } : DEFAULT_SYNC_STATE;
  } catch {
    return DEFAULT_SYNC_STATE;
  }
}

export function saveSyncState(state: SyncState): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

/** Exports everything as a JSON blob the user can save as a manual backup or move to another browser. */
export function exportAllData(): string {
  return JSON.stringify(
    { config: getConfig(), recaps: readRecaps(), bowlPicks: readBowlPicks(), draftTargets: getDraftTargets() },
    null,
    2
  );
}

export function importAllData(json: string): void {
  const parsed = JSON.parse(json) as {
    config?: AppConfig;
    recaps?: Record<string, SavedRecap>;
    bowlPicks?: Record<string, RecapBowlPicks>;
    draftTargets?: string[];
  };
  if (parsed.config) saveConfig(parsed.config);
  if (parsed.recaps) writeRecaps(parsed.recaps);
  if (parsed.bowlPicks) writeBowlPicks(parsed.bowlPicks);
  if (parsed.draftTargets) saveDraftTargets(parsed.draftTargets);
}
