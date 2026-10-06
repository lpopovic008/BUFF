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
 * writes them to local config, preserving what's already stored for leagues
 * we've seen before (nickname, order, hidden) and refreshing each one's
 * commissioner flag from Sleeper.
 */
export async function discoverAndSaveLeagues(
  username: string,
  season: string
): Promise<AppConfig> {
  const user = await getUserByUsername(username);
  if (!user) throw new UserNotFoundError(username);

  const leagues = await getUserLeagues(user.user_id, season);
  const existingConfig = getConfig();
  const stored = existingConfig.leagues;
  const found = new Set(leagues.map((l) => l.league_id));

  // Keep leagues we already track in the order the user arranged them, then
  // append anything newly joined. Re-running discovery must never reshuffle a
  // hand-picked order back into whatever order Sleeper returned.
  const tracked: TrackedLeague[] = stored.filter((l) => found.has(l.leagueId));
  const knownIds = new Set(tracked.map((l) => l.leagueId));
  // is_owner is Sleeper's own commissioner flag for each league — re-read
  // for every league, so a handed-over league updates too.
  const commish = new Map(
    await Promise.all(
      leagues.map(async (league) => {
        const leagueUsers = await getLeagueUsers(league.league_id);
        // An empty list is a failed fetch, not a league with nobody in it: keep what's stored.
        const isOwner = leagueUsers.length > 0 ? Boolean(leagueUsers.find((u) => u.user_id === user.user_id)?.is_owner) : undefined;
        return [league.league_id, isOwner] as const;
      })
    )
  );
  for (const l of tracked) l.isCommish = commish.get(l.leagueId) ?? l.isCommish;

  for (const league of leagues) {
    if (knownIds.has(league.league_id)) continue;
    tracked.push({
      leagueId: league.league_id,
      nickname: league.name,
      isCommish: commish.get(league.league_id) ?? false,
    });
  }

  const config: AppConfig = {
    sleeperUsername: username,
    sleeperUserId: user.user_id,
    season,
    leagues: tracked,
    externalLeagues: existingConfig.externalLeagues,
    googleClientId: existingConfig.googleClientId,
  };
  saveConfig(config);
  return config;
}
