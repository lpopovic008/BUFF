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
  metadata?: { team_name?: string; [key: string]: unknown } | null;
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

/** Current NFL week, defaulting to 1 if Sleeper is unreachable. */
export async function getCurrentWeek(): Promise<number> {
  const state = await getNFLState();
  return state?.week && state.week >= 1 ? state.week : 1;
}

export function avatarUrl(avatarId: string | null | undefined): string | null {
  if (!avatarId) return null;
  return `https://sleepercdn.com/avatars/thumbs/${avatarId}`;
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
