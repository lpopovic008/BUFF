// Typed client for the public Sleeper API (https://docs.sleeper.com/).
// No API key is required, but every league/user id must be discovered
// first via username lookup. All requests are read-only, made directly
// from the browser (Sleeper's API is CORS-open), and de-duplicated /
// short-cached in memory for the life of the tab so re-rendering the same
// view doesn't refire the same request.

const BASE = "https://api.sleeper.app/v1";

const inflight = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();

async function sleeperFetch<T>(path: string, ttlSeconds: number): Promise<T | null> {
  const cached = inflight.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise as Promise<T | null>;
  }

  const promise = (async () => {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Sleeper API ${path} failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    if (!text || text === "null") return null;
    return JSON.parse(text) as T;
  })();

  inflight.set(path, { expiresAt: Date.now() + ttlSeconds * 1000, promise });
  promise.catch(() => inflight.delete(path)); // don't cache failures
  return promise as Promise<T | null>;
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeagueSettings {
  num_teams?: number;
  playoff_week_start?: number;
  leg?: number;
  /** 0 = redraft, 1 = keeper, 2 = dynasty. */
  type?: number;
  [key: string]: unknown;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  season_type: string;
  sport: string;
  status: string;
  avatar: string | null;
  previous_league_id: string | null;
  draft_id: string | null;
  settings: SleeperLeagueSettings;
  scoring_settings?: Record<string, number>;
  roster_positions?: string[];
}

/** Whether player values for this league should be read as dynasty (long-term asset value) rather than redraft/fantasy (this-season-only). */
export function isDynastyLeague(league: SleeperLeague): boolean {
  return league.settings.type === 2;
}

/** "superflex" if any roster slot lets a second QB start (Sleeper's SUPER_FLEX slot code); "oneQB" otherwise. */
export function leagueQBFormat(league: SleeperLeague): "oneQB" | "superflex" {
  return (league.roster_positions ?? []).includes("SUPER_FLEX") ? "superflex" : "oneQB";
}

export interface SleeperRosterSettings {
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_decimal?: number;
  fpts_against: number;
  fpts_against_decimal?: number;
  waiver_position?: number;
  [key: string]: unknown;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  league_id: string;
  players?: string[] | null;
  starters?: string[] | null;
  settings: SleeperRosterSettings;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  is_owner?: boolean;
  metadata?: { team_name?: string; avatar?: string | null; [key: string]: unknown } | null;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  players?: string[] | null;
  starters?: string[] | null;
  players_points?: Record<string, number> | null;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: "trade" | "waiver" | "free_agent";
  status: string;
  leg: number;
  creator: string;
  created: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  waiver_budget?: { sender: number; receiver: number; amount: number }[];
}

export interface SleeperBracketMatch {
  r: number;
  m: number;
  t1: number | null;
  t2: number | null;
  w?: number | null;
  l?: number | null;
  p?: number | null;
}

export interface SleeperNFLState {
  week: number;
  season: string;
  season_type: string;
  league_season: string;
  display_week: number;
}

export async function getUserByUsername(username: string): Promise<SleeperUser | null> {
  return sleeperFetch<SleeperUser>(`/user/${encodeURIComponent(username)}`, 3600);
}

export async function getUserLeagues(
  userId: string,
  season: string,
  sport: "nfl" = "nfl"
): Promise<SleeperLeague[]> {
  const leagues = await sleeperFetch<SleeperLeague[]>(
    `/user/${userId}/leagues/${sport}/${season}`,
    300
  );
  return leagues ?? [];
}

export async function getLeague(leagueId: string): Promise<SleeperLeague | null> {
  return sleeperFetch<SleeperLeague>(`/league/${leagueId}`, 300);
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  const rosters = await sleeperFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`, 60);
  return rosters ?? [];
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
  const users = await sleeperFetch<SleeperLeagueUser[]>(`/league/${leagueId}/users`, 300);
  return users ?? [];
}

export async function getMatchups(
  leagueId: string,
  week: number
): Promise<SleeperMatchup[]> {
  const matchups = await sleeperFetch<SleeperMatchup[]>(
    `/league/${leagueId}/matchups/${week}`,
    60
  );
  return matchups ?? [];
}

export async function getTransactions(
  leagueId: string,
  week: number
): Promise<SleeperTransaction[]> {
  const txns = await sleeperFetch<SleeperTransaction[]>(
    `/league/${leagueId}/transactions/${week}`,
    60
  );
  return txns ?? [];
}

export async function getWinnersBracket(leagueId: string): Promise<SleeperBracketMatch[]> {
  const bracket = await sleeperFetch<SleeperBracketMatch[]>(
    `/league/${leagueId}/winners_bracket`,
    300
  );
  return bracket ?? [];
}

/** Never throws — callers use this only to pick a sensible default view, so a Sleeper outage shouldn't 500 the page. */
export async function getNFLState(): Promise<SleeperNFLState | null> {
  try {
    return await sleeperFetch<SleeperNFLState>(`/state/nfl`, 300);
  } catch {
    return null;
  }
}

interface SleeperProjectionEntry {
  player_id: string;
  stats?: { pts_ppr?: number; pts_half_ppr?: number; pts_std?: number } | null;
}

const PROJECTIONS_BASE = "https://api.sleeper.app/projections/nfl";
const projectionsCache = new Map<string, { expiresAt: number; promise: Promise<Record<string, number>> }>();

/**
 * This week's fantasy point projection per player, keyed by player id.
 * Unlike everything else in this file, this isn't part of Sleeper's
 * documented public API (docs.sleeper.com has no projections endpoint) —
 * it's the same undocumented endpoint the Sleeper app itself and various
 * community tools rely on. Never throws and returns an empty map on any
 * failure (network error, unexpected response shape, endpoint change), so
 * callers should treat a missing player id as "no projection available"
 * and fall back to their own estimate rather than assuming a real outage.
 */
export async function getWeeklyProjections(season: string, week: number): Promise<Record<string, number>> {
  const key = `${season}-${week}`;
  const cached = projectionsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    try {
      const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
      const url =
        `${PROJECTIONS_BASE}/${season}/${week}?season_type=regular&` +
        positions.map((p) => `position[]=${p}`).join("&");
      const res = await fetch(url);
      if (!res.ok) return {};
      const data = (await res.json()) as SleeperProjectionEntry[] | null;
      const out: Record<string, number> = {};
      for (const entry of data ?? []) {
        const pts = entry.stats?.pts_ppr ?? entry.stats?.pts_half_ppr ?? entry.stats?.pts_std;
        if (entry.player_id && typeof pts === "number") out[entry.player_id] = pts;
      }
      return out;
    } catch {
      return {};
    }
  })();

  projectionsCache.set(key, { expiresAt: Date.now() + 300 * 1000, promise });
  return promise;
}

/**
 * The fantasy week to show matchups/standings for. During the NFL preseason,
 * Sleeper's `week` field counts preseason weeks (1, 2, 3...), not fantasy
 * weeks — fantasy schedules don't start until the regular season, so using
 * that number directly would fetch/display a nonexistent or wrong week.
 * Preview regular season week 1 instead until the real season begins.
 */
export async function getCurrentWeek(): Promise<number> {
  const state = await getNFLState();
  if (!state) return 1;
  if (state.season_type === "pre") return 1;
  return state.week && state.week >= 1 ? state.week : 1;
}

/**
 * Which week's recap write-up should be open right now. Unlike `getCurrentWeek`,
 * this is 0 during the preseason (the free-write "Preseason" slot) and, once the
 * season starts, holds on the just-finished week through Tuesday night — Sleeper's
 * own `week` counter flips over on Tuesday, right when Monday Night Football has
 * just settled and there's a recap left to write — before advancing to the next
 * week's slot at Wednesday 12am.
 */
export async function getRecapWeek(): Promise<number> {
  const state = await getNFLState();
  if (!state) return 0;
  if (state.season_type === "pre") return 0;
  const week = state.week && state.week >= 1 ? state.week : 1;
  const isTuesday = new Date().getDay() === 2;
  return isTuesday && week > 1 ? week - 1 : week;
}

export function avatarUrl(avatarId: string | null | undefined): string | null {
  if (!avatarId) return null;
  return `https://sleepercdn.com/avatars/thumbs/${avatarId}`;
}

/**
 * A manager's team-branded picture for this league — the custom image they
 * set on their roster (Sleeper stores it as `metadata.avatar`, already a
 * full CDN URL for a custom upload) — rather than their personal Sleeper
 * account avatar. Falls back to the account avatar only if no team picture
 * was set, same as Sleeper's own app does.
 */
export function teamAvatarUrl(user: SleeperLeagueUser | undefined | null): string | null {
  const teamAvatar = user?.metadata?.avatar;
  if (teamAvatar) return teamAvatar.startsWith("http") ? teamAvatar : avatarUrl(teamAvatar);
  return avatarUrl(user?.avatar);
}

/** Sleeper's player headshot CDN — same convention as avatarUrl, keyed by player id instead of avatar id. Not every player has a real photo; callers should handle a broken image. */
export function playerHeadshotUrl(playerId: string): string {
  return `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;
}

/** Walks the previous_league_id chain to find every linked season, newest first. */
export async function getLeagueHistoryChain(leagueId: string): Promise<SleeperLeague[]> {
  const chain: SleeperLeague[] = [];
  let currentId: string | null = leagueId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const league = await getLeague(currentId);
    if (!league) break;
    chain.push(league);
    currentId = league.previous_league_id || null;
  }
  return chain;
}
