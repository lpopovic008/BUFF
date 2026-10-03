import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLosersBracket,
  getMatchups,
  getWinnersBracket,
  SleeperMatchup,
} from "./sleeper";
import { findLeagueProfile, managerName, payoutsForSeason, LeagueProfile } from "./league-config";
import { computePayoutLedger, PayoutLedger } from "./payouts";
import { SeasonResults } from "./payout-plan";
import { buildLiveStandings, finalPlacements } from "./league-data";
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

  const baseProfile = profileOverride ?? findLeagueProfile(league.name);
  if (!baseProfile) return null;
  // Resolve this season's rules once, up front, so everything downstream
  // (the ledger engine, MoneyBoard) can keep reading profile.payouts as
  // before without knowing seasons can have different rules.
  const profile: LeagueProfile = { ...baseProfile, payouts: payoutsForSeason(baseProfile, league.season) };

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

export interface LeagueSeason {
  leagueName: string;
  season: string;
  /** The league's hand-configured commissioner rules, if it has any (see league-config.ts). */
  profile: LeagueProfile | null;
  results: SeasonResults;
}

/**
 * Everything a payout plan is played against: every week's matchups through
 * the championship, and the final finishing order once the playoffs are
 * decided. Works for any league, configured or not.
 */
export async function loadLeagueSeason(leagueId: string): Promise<LeagueSeason | null> {
  const league = await getLeague(leagueId);
  if (!league) return null;
  const baseProfile = findLeagueProfile(league.name);
  const profile = baseProfile ? { ...baseProfile, payouts: payoutsForSeason(baseProfile, league.season) } : null;

  const [rosters, users, winners, losers] = await Promise.all([
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getWinnersBracket(leagueId),
    getLosersBracket(leagueId),
  ]);
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const names = new Map<number, string>(
    rosters.map((r) => [
      r.roster_id,
      managerName(profile, r.roster_id, displayManagerName(r.owner_id ? usersById.get(r.owner_id) : undefined)),
    ])
  );

  const playoffStart = Number(league.settings.playoff_week_start) || 15;
  const regularSeasonWeeks = Math.max(1, playoffStart - 1);
  // The championship is the last round of the winners bracket.
  const rounds = winners.reduce((max, m) => Math.max(max, m.r), 0) || 3;
  const lastWeek = Math.min(18, regularSeasonWeeks + rounds);

  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);
  const weekData = await Promise.all(weeks.map((w) => getMatchups(leagueId, w)));
  const matchupsByWeek = new Map<number, SleeperMatchup[]>(weeks.map((w, i) => [w, weekData[i]]));

  // The final order exists once the championship is decided (or Sleeper has closed the season).
  const final = winners.find((m) => m.p === 1);
  const decided = league.status === "complete" || (final?.w != null && final?.l != null);
  const finalOrder = decided
    ? finalPlacements(buildLiveStandings(rosters, users), winners, losers).map((row) => row.rosterId)
    : null;

  return {
    leagueName: league.name,
    season: league.season,
    profile,
    results: {
      rosterIds: rosters.map((r) => r.roster_id),
      names,
      matchupsByWeek,
      regularSeasonWeeks,
      lastWeek,
      finalOrder,
      playoffTeams: Number(league.settings.playoff_teams) || undefined,
    },
  };
}
