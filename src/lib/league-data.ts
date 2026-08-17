import {
  SleeperBracketMatch,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperRoster,
  SleeperTransaction,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getMatchups,
  getTransactions,
  getWinnersBracket,
} from "./sleeper";
import { combinePoints, displayManagerName } from "./format";
import { resolvePlayerNames } from "./players";

export interface StandingsRow {
  rosterId: number;
  ownerId: string | null;
  managerName: string;
  teamName: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
}

function userForRoster(
  roster: SleeperRoster,
  usersById: Map<string, SleeperLeagueUser>
): SleeperLeagueUser | undefined {
  return roster.owner_id ? usersById.get(roster.owner_id) : undefined;
}

function rankStandings(rows: Omit<StandingsRow, "rank">[]): StandingsRow[] {
  const sorted = [...rows].sort((a, b) => {
    const aGames = a.wins + a.losses + a.ties;
    const bGames = b.wins + b.losses + b.ties;
    const aPct = aGames ? (a.wins + a.ties * 0.5) / aGames : 0;
    const bPct = bGames ? (b.wins + b.ties * 0.5) / bGames : 0;
    if (bPct !== aPct) return bPct - aPct;
    return b.pointsFor - a.pointsFor;
  });
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}

/** Standings as reported live by Sleeper (rosters[].settings) — accurate for "current" and completed seasons. */
export function buildLiveStandings(
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[]
): StandingsRow[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const rows = rosters.map((roster) => {
    const user = userForRoster(roster, usersById);
    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      managerName: user?.display_name || "Unclaimed team",
      teamName: displayManagerName(user),
      avatar: user?.avatar ?? null,
      wins: roster.settings.wins ?? 0,
      losses: roster.settings.losses ?? 0,
      ties: roster.settings.ties ?? 0,
      pointsFor: combinePoints(roster.settings.fpts, roster.settings.fpts_decimal),
      pointsAgainst: combinePoints(roster.settings.fpts_against, roster.settings.fpts_against_decimal),
    };
  });
  return rankStandings(rows);
}

interface Tally {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** Reconstructs standings as of a given week by replaying matchup results — needed for accurate weekly recaps. */
export function buildStandingsThroughWeek(
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[],
  matchupsByWeek: Map<number, SleeperMatchup[]>,
  throughWeek: number
): StandingsRow[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const tallies = new Map<number, Tally>();
  for (const roster of rosters) {
    tallies.set(roster.roster_id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });
  }

  for (let week = 1; week <= throughWeek; week++) {
    const weekMatchups = matchupsByWeek.get(week) ?? [];
    const byMatchupId = new Map<number, SleeperMatchup[]>();
    for (const m of weekMatchups) {
      if (m.matchup_id == null) continue;
      const list = byMatchupId.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchupId.set(m.matchup_id, list);
    }
    for (const pair of byMatchupId.values()) {
      if (pair.length !== 2) continue; // bye or malformed data
      const [a, b] = pair;
      const tallyA = tallies.get(a.roster_id);
      const tallyB = tallies.get(b.roster_id);
      if (!tallyA || !tallyB) continue;
      tallyA.pointsFor += a.points;
      tallyA.pointsAgainst += b.points;
      tallyB.pointsFor += b.points;
      tallyB.pointsAgainst += a.points;
      if (a.points > b.points) {
        tallyA.wins += 1;
        tallyB.losses += 1;
      } else if (b.points > a.points) {
        tallyB.wins += 1;
        tallyA.losses += 1;
      } else {
        tallyA.ties += 1;
        tallyB.ties += 1;
      }
    }
  }

  const rows = rosters.map((roster) => {
    const user = userForRoster(roster, usersById);
    const tally = tallies.get(roster.roster_id)!;
    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      managerName: user?.display_name || "Unclaimed team",
      teamName: displayManagerName(user),
      avatar: user?.avatar ?? null,
      ...tally,
    };
  });
  return rankStandings(rows);
}

export interface LeagueSummary {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  standings: StandingsRow[];
  currentWeek: number;
}

export async function getLeagueSummary(leagueId: string, currentWeek: number): Promise<LeagueSummary | null> {
  const league = await getLeague(leagueId);
  if (!league) return null;
  const [rosters, users] = await Promise.all([getLeagueRosters(leagueId), getLeagueUsers(leagueId)]);
  const standings = buildLiveStandings(rosters, users);
  return { league, rosters, users, standings, currentWeek };
}

export interface MatchupGame {
  matchupId: number;
  teams: {
    rosterId: number;
    teamName: string;
    managerName: string;
    avatar: string | null;
    points: number;
  }[];
}

export function pairMatchups(
  matchups: SleeperMatchup[],
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[]
): MatchupGame[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const rostersById = new Map(rosters.map((r) => [r.roster_id, r]));
  const byMatchupId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    const id = m.matchup_id ?? -m.roster_id; // negative sentinel keeps byes distinct
    const list = byMatchupId.get(id) ?? [];
    list.push(m);
    byMatchupId.set(id, list);
  }
  return Array.from(byMatchupId.entries()).map(([matchupId, teams]) => ({
    matchupId,
    teams: teams.map((t) => {
      const roster = rostersById.get(t.roster_id);
      const user = roster ? userForRoster(roster, usersById) : undefined;
      return {
        rosterId: t.roster_id,
        teamName: displayManagerName(user),
        managerName: user?.display_name || "Unclaimed team",
        avatar: user?.avatar ?? null,
        points: t.points,
      };
    }),
  }));
}

export interface DashboardMatchupTeam {
  rosterId: number;
  teamName: string;
  points: number;
  /** Starters (falls back to the full roster if starters aren't set yet). */
  playerIds: string[];
  /** Live/actual per-player points so far this week, from Sleeper — 0 before kickoff. */
  playersPoints: Record<string, number>;
}

export interface DashboardMatchup {
  matchupId: number;
  my: DashboardMatchupTeam;
  /** Null on a bye (odd team count) or if the matchup schedule isn't set yet. */
  opponent: DashboardMatchupTeam | null;
}

/** Finds the given roster's matchup for a week's matchups and splits it into "my side" / "opponent side". */
export function findMyMatchup(
  matchups: SleeperMatchup[],
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[],
  myRosterId: number
): DashboardMatchup | null {
  const mine = matchups.find((m) => m.roster_id === myRosterId);
  if (!mine) return null;

  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const rostersById = new Map(rosters.map((r) => [r.roster_id, r]));
  const teamName = (rosterId: number) => {
    const roster = rostersById.get(rosterId);
    const user = roster ? userForRoster(roster, usersById) : undefined;
    return displayManagerName(user);
  };
  const toTeam = (m: SleeperMatchup): DashboardMatchupTeam => {
    const starters = (m.starters ?? []).filter((id) => id && id !== "0");
    const roster = (m.players ?? []).filter((id) => id && id !== "0");
    return {
      rosterId: m.roster_id,
      teamName: teamName(m.roster_id),
      points: m.points,
      playerIds: starters.length > 0 ? starters : roster,
      playersPoints: m.players_points ?? {},
    };
  };

  const opponent =
    mine.matchup_id != null
      ? matchups.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== myRosterId)
      : undefined;

  return {
    matchupId: mine.matchup_id ?? -mine.roster_id,
    my: toTeam(mine),
    opponent: opponent ? toTeam(opponent) : null,
  };
}

export interface WeekRecapData {
  league: SleeperLeague;
  week: number;
  games: MatchupGame[];
  standingsBefore: StandingsRow[];
  standingsAfter: StandingsRow[];
  topScorer: { teamName: string; points: number } | null;
  lowScorer: { teamName: string; points: number } | null;
  closestGame: { a: string; b: string; margin: number } | null;
  biggestBlowout: { winner: string; loser: string; margin: number } | null;
  leagueAverage: number;
  transactions: SleeperTransaction[];
  transactionSummaries: string[];
}

export async function computeWeekRecap(leagueId: string, week: number): Promise<WeekRecapData | null> {
  const league = await getLeague(leagueId);
  if (!league) return null;
  const [rosters, users, thisWeekMatchups, transactions] = await Promise.all([
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getMatchups(leagueId, week),
    getTransactions(leagueId, week),
  ]);

  const matchupsByWeek = new Map<number, SleeperMatchup[]>();
  for (let w = 1; w <= week; w++) {
    const weekData = w === week ? thisWeekMatchups : await getMatchups(leagueId, w);
    matchupsByWeek.set(w, weekData);
  }

  const standingsBefore = buildStandingsThroughWeek(rosters, users, matchupsByWeek, week - 1);
  const standingsAfter = buildStandingsThroughWeek(rosters, users, matchupsByWeek, week);
  const games = pairMatchups(thisWeekMatchups, rosters, users);

  const allTeamsScored = games.flatMap((g) => g.teams);
  let topScorer: WeekRecapData["topScorer"] = null;
  let lowScorer: WeekRecapData["lowScorer"] = null;
  for (const t of allTeamsScored) {
    if (!topScorer || t.points > topScorer.points) topScorer = { teamName: t.teamName, points: t.points };
    if (!lowScorer || t.points < lowScorer.points) lowScorer = { teamName: t.teamName, points: t.points };
  }

  let closestGame: WeekRecapData["closestGame"] = null;
  let biggestBlowout: WeekRecapData["biggestBlowout"] = null;
  for (const g of games) {
    if (g.teams.length !== 2) continue;
    const [a, b] = g.teams;
    const margin = Math.abs(a.points - b.points);
    if (!closestGame || margin < closestGame.margin) {
      closestGame = { a: a.teamName, b: b.teamName, margin };
    }
    const winner = a.points >= b.points ? a : b;
    const loser = a.points >= b.points ? b : a;
    if (!biggestBlowout || margin > biggestBlowout.margin) {
      biggestBlowout = { winner: winner.teamName, loser: loser.teamName, margin };
    }
  }

  const leagueAverage = allTeamsScored.length
    ? allTeamsScored.reduce((sum, t) => sum + t.points, 0) / allTeamsScored.length
    : 0;

  const completedTxns = transactions.filter((t) => t.status === "complete");
  const transactionSummaries = await buildTransactionSummaries(completedTxns, rosters, users);

  return {
    league,
    week,
    games,
    standingsBefore,
    standingsAfter,
    topScorer,
    lowScorer,
    closestGame,
    biggestBlowout,
    leagueAverage,
    transactions: completedTxns,
    transactionSummaries,
  };
}

async function buildTransactionSummaries(
  transactions: SleeperTransaction[],
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[]
): Promise<string[]> {
  if (transactions.length === 0) return [];
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const rostersById = new Map(rosters.map((r) => [r.roster_id, r]));
  const teamName = (rosterId: number) => {
    const roster = rostersById.get(rosterId);
    const user = roster ? userForRoster(roster, usersById) : undefined;
    return displayManagerName(user);
  };

  const allPlayerIds = transactions.flatMap((t) => [
    ...Object.keys(t.adds ?? {}),
    ...Object.keys(t.drops ?? {}),
  ]);
  const playerNames = await resolvePlayerNames(allPlayerIds);

  const summaries: string[] = [];
  for (const t of transactions) {
    if (t.type === "trade") {
      const teams = t.roster_ids.map(teamName).join(" ↔ ");
      const movedPlayers = [...Object.keys(t.adds ?? {})].map((id) => playerNames[id]).join(", ");
      summaries.push(`Trade: ${teams}${movedPlayers ? ` — ${movedPlayers}` : ""}`);
      continue;
    }
    const label = t.type === "waiver" ? "Waiver" : "Free agent";
    const addsByRoster = new Map<number, string[]>();
    for (const [playerId, rosterId] of Object.entries(t.adds ?? {})) {
      const list = addsByRoster.get(rosterId) ?? [];
      list.push(playerNames[playerId]);
      addsByRoster.set(rosterId, list);
    }
    const dropsByRoster = new Map<number, string[]>();
    for (const [playerId, rosterId] of Object.entries(t.drops ?? {})) {
      const list = dropsByRoster.get(rosterId) ?? [];
      list.push(playerNames[playerId]);
      dropsByRoster.set(rosterId, list);
    }
    const rosterIds = new Set([...addsByRoster.keys(), ...dropsByRoster.keys()]);
    for (const rosterId of rosterIds) {
      const adds = addsByRoster.get(rosterId) ?? [];
      const drops = dropsByRoster.get(rosterId) ?? [];
      const parts = [];
      if (adds.length) parts.push(`added ${adds.join(", ")}`);
      if (drops.length) parts.push(`dropped ${drops.join(", ")}`);
      if (parts.length) summaries.push(`${label}: ${teamName(rosterId)} ${parts.join(", ")}`);
    }
  }
  return summaries;
}

export interface SeasonRecord {
  season: string;
  leagueId: string;
  leagueName: string;
  standings: StandingsRow[];
  champion: StandingsRow | null;
  runnerUp: StandingsRow | null;
}

export interface ManagerCareerStats {
  userId: string;
  displayName: string;
  avatar: string | null;
  seasonsPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  championships: number;
  runnerUps: number;
  bestFinishRank: number | null;
  seasons: { season: string; rank: number; record: string; champion: boolean }[];
}

/** Walks the previous_league_id chain and reconstructs a completed final standings + champion for each season. */
export async function getLeagueSeasonHistory(leagueId: string): Promise<SeasonRecord[]> {
  const seasons: SeasonRecord[] = [];
  let currentId: string | null = leagueId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const league = await getLeague(currentId);
    if (!league) break;
    const [rosters, users, bracket] = await Promise.all([
      getLeagueRosters(currentId),
      getLeagueUsers(currentId),
      getWinnersBracket(currentId),
    ]);
    const standings = buildLiveStandings(rosters, users);
    const { champion, runnerUp } = deriveChampionship(bracket, standings);
    seasons.push({
      season: league.season,
      leagueId: currentId,
      leagueName: league.name,
      standings,
      champion,
      runnerUp,
    });
    currentId = league.previous_league_id || null;
  }
  return seasons;
}

function deriveChampionship(
  bracket: SleeperBracketMatch[],
  standings: StandingsRow[]
): { champion: StandingsRow | null; runnerUp: StandingsRow | null } {
  const byRosterId = new Map(standings.map((s) => [s.rosterId, s]));
  const finalMatch = bracket.find((m) => m.p === 1);
  if (finalMatch && finalMatch.w != null && finalMatch.l != null) {
    return {
      champion: byRosterId.get(finalMatch.w) ?? null,
      runnerUp: byRosterId.get(finalMatch.l) ?? null,
    };
  }
  return { champion: null, runnerUp: null };
}

export function aggregateCareerStats(seasons: SeasonRecord[]): ManagerCareerStats[] {
  const byUser = new Map<string, ManagerCareerStats>();
  // Oldest season first so `seasons` arrays read chronologically.
  const chronological = [...seasons].reverse();
  for (const season of chronological) {
    for (const row of season.standings) {
      if (!row.ownerId) continue;
      let stats = byUser.get(row.ownerId);
      if (!stats) {
        stats = {
          userId: row.ownerId,
          displayName: row.managerName,
          avatar: row.avatar,
          seasonsPlayed: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          championships: 0,
          runnerUps: 0,
          bestFinishRank: null,
          seasons: [],
        };
        byUser.set(row.ownerId, stats);
      }
      stats.displayName = row.managerName;
      stats.avatar = row.avatar;
      stats.seasonsPlayed += 1;
      stats.wins += row.wins;
      stats.losses += row.losses;
      stats.ties += row.ties;
      stats.pointsFor += row.pointsFor;
      stats.pointsAgainst += row.pointsAgainst;
      const isChampion = season.champion?.ownerId === row.ownerId;
      const isRunnerUp = season.runnerUp?.ownerId === row.ownerId;
      if (isChampion) stats.championships += 1;
      if (isRunnerUp) stats.runnerUps += 1;
      stats.bestFinishRank = stats.bestFinishRank ? Math.min(stats.bestFinishRank, row.rank) : row.rank;
      stats.seasons.push({
        season: season.season,
        rank: row.rank,
        record: `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`,
        champion: isChampion,
      });
    }
  }
  return Array.from(byUser.values()).sort((a, b) => b.championships - a.championships || b.wins - a.wins);
}
