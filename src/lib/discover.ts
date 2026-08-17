import { getUserByUsername, getUserLeagues, getLeagueUsers } from "./sleeper";
import { AppConfig, TrackedLeague, getConfig, saveConfig } from "./localStore";

export class UserNotFoundError extends Error {
  constructor(username: string) {
    super(`No Sleeper user found for "${username}".`);
    this.name = "UserNotFoundError";
  }
}

/**
 * Looks up every league the given Sleeper user plays in for a season and
 * writes them to local config, preserving any per-league overrides (nickname,
 * commish flag) already stored for leagues we've seen before.
 */
export async function discoverAndSaveLeagues(
  username: string,
  season: string
): Promise<AppConfig> {
  const user = await getUserByUsername(username);
  if (!user) throw new UserNotFoundError(username);

  const leagues = await getUserLeagues(user.user_id, season);
  const stored = getConfig().leagues;
  const found = new Set(leagues.map((l) => l.league_id));

  // Keep leagues we already track in the order the user arranged them, then
  // append anything newly joined. Re-running discovery must never reshuffle a
  // hand-picked order back into whatever order Sleeper returned.
  const tracked: TrackedLeague[] = stored.filter((l) => found.has(l.leagueId));
  const knownIds = new Set(tracked.map((l) => l.leagueId));

  for (const league of leagues) {
    if (knownIds.has(league.league_id)) continue;
    // is_owner is Sleeper's own commissioner flag for this league.
    const leagueUsers = await getLeagueUsers(league.league_id);
    const me = leagueUsers.find((u) => u.user_id === user.user_id);
    tracked.push({
      leagueId: league.league_id,
      nickname: league.name,
      isCommish: Boolean(me?.is_owner),
    });
  }

  const config: AppConfig = {
    sleeperUsername: username,
    sleeperUserId: user.user_id,
    season,
    leagues: tracked,
  };
  saveConfig(config);
  return config;
}
