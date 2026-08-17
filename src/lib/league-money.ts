import { getLeague, getLeagueRosters, getLeagueUsers, getMatchups, SleeperMatchup } from "./sleeper";
import { findLeagueProfile, LeagueProfile } from "./league-config";
import { computePayoutLedger, PayoutLedger } from "./payouts";
import { displayManagerName } from "./format";

export interface LeagueMoney {
  profile: LeagueProfile;
  leagueName: string;
  season: string;
  ledger: PayoutLedger;
}

/**
 * Loads everything needed for the money view of a league. Returns null when the
 * league has no commissioner profile configured — the rest of the app works
 * unchanged for those.
 */
export async function loadLeagueMoney(
  leagueId: string,
  profileOverride?: LeagueProfile
): Promise<LeagueMoney | null> {
  const league = await getLeague(leagueId);
  if (!league) return null;

  const profile = profileOverride ?? findLeagueProfile(league.name);
  if (!profile) return null;

  const [rosters, users] = await Promise.all([getLeagueRosters(leagueId), getLeagueUsers(leagueId)]);
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const rosterNames = new Map<number, string>(
    rosters.map((r) => [
      r.roster_id,
      displayManagerName(r.owner_id ? usersById.get(r.owner_id) : undefined),
    ])
  );

  // One request per regular-season week. sleeperFetch de-dupes and caches these
  // per tab, so revisiting the page doesn't refetch the whole season.
  const weeks = Array.from({ length: profile.payouts.regularSeasonWeeks }, (_, i) => i + 1);
  const weekData = await Promise.all(weeks.map((w) => getMatchups(leagueId, w)));
  const matchupsByWeek = new Map<number, SleeperMatchup[]>();
  weeks.forEach((w, i) => matchupsByWeek.set(w, weekData[i]));

  const ledger = computePayoutLedger({
    matchupsByWeek,
    rosterNames,
    profile,
    teamCount: rosters.length || Object.keys(profile.managerNamesByRosterId).length,
  });

  return { profile, leagueName: league.name, season: league.season, ledger };
}
