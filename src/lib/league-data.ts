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
  getLosersBracket,
  getMatchups,
  getTransactions,
  getWinnersBracket,
} from "./sleeper";
import { combinePoints, displayManagerName } from "./format";
import { resolvePlayerNames, resolvePlayers } from "./players";

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
    /** Every rostered player that week (starters + bench), for identifying which team a picked player belongs to before/without scoring. */
    playerIds: string[];
    /** Just the starting lineup — for "who led the scoring" callouts, where crediting a bench player would be misleading. */
    starterIds: string[];
    /** Live/final per-player points that week, keyed by player id. */
    playersPoints: Record<string, number>;
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
        playerIds: (t.players ?? []).filter((id) => id && id !== "0"),
        starterIds: (t.starters ?? []).filter((id) => id && id !== "0"),
        playersPoints: t.players_points ?? {},
      };
    }),
  }));
}

const BENCH_SLOTS = new Set(["BN", "IR", "TAXI"]);

export interface LineupSlot {
  slot: string;
  playerId: string | null;
}

/** Zips a team's starters against the league's roster_positions to get labeled starting-lineup slots (QB, RB, FLEX, ...) in Sleeper's own slot order — `starters` is always positionally aligned to the non-bench entries of roster_positions. */
export function buildLineupSlots(
  rosterPositions: string[] | undefined,
  starters: string[] | null | undefined
): LineupSlot[] {
  const starterSlots = (rosterPositions ?? []).filter((p) => !BENCH_SLOTS.has(p));
  const ids = starters ?? [];
  return starterSlots.map((slot, i) => ({
    slot,
    playerId: ids[i] && ids[i] !== "0" ? ids[i] : null,
  }));
}

export interface LeagueMatchupTeam {
  rosterId: number;
  teamName: string;
  points: number;
  slots: LineupSlot[];
  playersPoints: Record<string, number>;
}

export interface LeagueMatchupGame {
  matchupId: number;
  teams: LeagueMatchupTeam[];
}

/** Every matchup for a week, each side's full starting lineup broken out by slot — the data behind the league page's Sleeper-style matchup carousel. */
export function buildLeagueMatchups(
  league: SleeperLeague,
  matchups: SleeperMatchup[],
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[]
): LeagueMatchupGame[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const rostersById = new Map(rosters.map((r) => [r.roster_id, r]));
  const teamName = (rosterId: number) => {
    const roster = rostersById.get(rosterId);
    const user = roster ? userForRoster(roster, usersById) : undefined;
    return displayManagerName(user);
  };
  const byMatchupId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    const id = m.matchup_id ?? -m.roster_id;
    const list = byMatchupId.get(id) ?? [];
    list.push(m);
    byMatchupId.set(id, list);
  }
  return Array.from(byMatchupId.entries()).map(([matchupId, teams]) => ({
    matchupId,
    teams: teams.map((m) => ({
      rosterId: m.roster_id,
      teamName: teamName(m.roster_id),
      points: m.points,
      slots: buildLineupSlots(league.roster_positions, m.starters),
      playersPoints: m.players_points ?? {},
    })),
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
  /** The single highest-scoring individual starter across every roster this week. */
  topPlayer: { playerId: string; name: string; teamName: string; points: number } | null;
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

  let topPlayer: WeekRecapData["topPlayer"] = null;
  {
    let topPlayerId: string | null = null;
    let topPlayerPoints = -Infinity;
    let topPlayerRosterId: number | null = null;
    for (const m of thisWeekMatchups) {
      const starters = (m.starters ?? []).filter((id) => id && id !== "0");
      for (const id of starters) {
        const pts = m.players_points?.[id];
        if (pts != null && pts > topPlayerPoints) {
          topPlayerPoints = pts;
          topPlayerId = id;
          topPlayerRosterId = m.roster_id;
        }
      }
    }
    if (topPlayerId && topPlayerRosterId != null) {
      const [resolved] = await resolvePlayers([topPlayerId]);
      const team = allTeamsScored.find((t) => t.rosterId === topPlayerRosterId);
      topPlayer = {
        playerId: topPlayerId,
        name: resolved?.name ?? `Player ${topPlayerId}`,
        teamName: team?.teamName ?? "Unclaimed team",
        points: topPlayerPoints,
      };
    }
  }

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
    topPlayer,
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
  /**
   * For a finished season these are the real final placements, decided by the
   * playoff and consolation games that were actually played (see
   * finalPlacements). For a season still under way they're the current
   * standings — which is not a finish, so read `complete` before treating
   * `rank` as one.
   */
  standings: StandingsRow[];
  champion: StandingsRow | null;
  runnerUp: StandingsRow | null;
  /** At least one game has been played, so the records/standings mean something. */
  hasResults: boolean;
  /** The season is over — its championship has been decided (or Sleeper has closed the league out). Only then is `rank` a final finish. */
  complete: boolean;
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
  /** Best *finished* placement across every completed season — null until this manager has finished one. */
  bestFinishRank: number | null;
  seasons: {
    season: string;
    /** Final placement, or null while the season is still being played. */
    rank: number | null;
    record: string;
    champion: boolean;
    complete: boolean;
  }[];
}

/** Walks the previous_league_id chain and reconstructs each season's final placements + champion. */
export async function getLeagueSeasonHistory(leagueId: string): Promise<SeasonRecord[]> {
  const seasons: SeasonRecord[] = [];
  let currentId: string | null = leagueId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const league = await getLeague(currentId);
    if (!league) break;
    const [rosters, users, winners, losers] = await Promise.all([
      getLeagueRosters(currentId),
      getLeagueUsers(currentId),
      getWinnersBracket(currentId),
      getLosersBracket(currentId),
    ]);
    const seeded = buildLiveStandings(rosters, users);
    const { champion, runnerUp } = deriveChampionship(winners, seeded);
    // Sleeper flips a league to "complete" once the season closes out, but it
    // can lag right after the final — a decided championship game is the
    // stronger signal, so either one counts.
    const complete = league.status === "complete" || champion !== null;
    const hasResults = seeded.some((row) => row.wins + row.losses + row.ties > 0);
    const standings = complete ? finalPlacements(seeded, winners, losers) : seeded;
    seasons.push({
      season: league.season,
      leagueId: currentId,
      leagueName: league.name,
      standings,
      // Re-resolve against the final order so champion/runnerUp carry the
      // placement-corrected rank rather than the seeding one.
      champion: champion ? standings.find((r) => r.rosterId === champion.rosterId) ?? champion : null,
      runnerUp: runnerUp ? standings.find((r) => r.rosterId === runnerUp.rosterId) ?? runnerUp : null,
      hasResults,
      complete,
    });
    currentId = league.previous_league_id || null;
  }
  return seasons;
}

/**
 * Orders one bracket's teams by what they actually did in it.
 *
 * Sleeper marks the games that decide a placement with `p` — `p: 1` is the
 * championship, `p: 3` the 3rd-place game, `p: 5` the 5th-place game, and so
 * on — so the winner of a `p` game finishes `p` and its loser `p + 1`. Teams
 * knocked out without a placement game to land in are ordered by how deep
 * they got (the last round they appear in), then by seed.
 */
function orderBracket(bracket: SleeperBracketMatch[], seedIndex: Map<number, number>): number[] {
  const placement = new Map<number, number>();
  const lastRound = new Map<number, number>();
  const note = (rosterId: number | null | undefined, round: number) => {
    if (rosterId == null) return;
    lastRound.set(rosterId, Math.max(lastRound.get(rosterId) ?? 0, round));
  };

  for (const match of bracket) {
    // t1/t2 are a roster id once known, or a {w|l: matchId} reference before
    // that round's feeder game has been played — only the numbers are teams.
    if (typeof match.t1 === "number") note(match.t1, match.r);
    if (typeof match.t2 === "number") note(match.t2, match.r);
    note(match.w, match.r);
    note(match.l, match.r);
    if (match.p == null) continue;
    // First placement wins: a roster should only ever land one, but never let
    // a later game demote a team that already has its place.
    if (match.w != null && !placement.has(match.w)) placement.set(match.w, match.p);
    if (match.l != null && !placement.has(match.l)) placement.set(match.l, match.p + 1);
  }

  const seedOf = (rosterId: number) => seedIndex.get(rosterId) ?? Number.MAX_SAFE_INTEGER;
  const participants = [...lastRound.keys()];
  const placed = participants
    .filter((id) => placement.has(id))
    .sort((a, b) => placement.get(a)! - placement.get(b)!);
  const eliminated = participants
    .filter((id) => !placement.has(id))
    .sort((a, b) => (lastRound.get(b)! - lastRound.get(a)!) || seedOf(a) - seedOf(b));
  return [...placed, ...eliminated];
}

/**
 * A season's real final order, from the games that were actually played.
 *
 * Regular-season record only sets the seeding — it's what next year's draft
 * order gets built from, not where anyone finished. The finish comes out of
 * the two brackets: the winners bracket settles the top of the table (its `p`
 * values are absolute places), and the consolation bracket settles everyone
 * who missed the playoffs (its `p` values restart at 1 within that bracket,
 * so they slot in after every team the winners bracket placed). Anyone in
 * neither bracket falls to the bottom in seed order.
 */
export function finalPlacements(
  standings: StandingsRow[],
  winners: SleeperBracketMatch[],
  losers: SleeperBracketMatch[]
): StandingsRow[] {
  const seedIndex = new Map(standings.map((row, i) => [row.rosterId, i]));
  const order: number[] = [];
  const push = (rosterId: number) => {
    if (!order.includes(rosterId) && seedIndex.has(rosterId)) order.push(rosterId);
  };

  orderBracket(winners, seedIndex).forEach(push);
  orderBracket(losers, seedIndex).forEach(push);
  for (const row of standings) push(row.rosterId);

  const byRosterId = new Map(standings.map((row) => [row.rosterId, row]));
  return order.map((rosterId, i) => ({ ...byRosterId.get(rosterId)!, rank: i + 1 }));
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

/**
 * Career totals across every linked season.
 *
 * A season only contributes a *finish* (best finish, championship, a rank in
 * the per-season list) once it's actually been played out. A season still
 * under way — including one that hasn't kicked off, where every team sits at
 * 0-0 and the "standings" are just roster order — would otherwise hand
 * everyone a placement they never earned.
 */
export function aggregateCareerStats(seasons: SeasonRecord[]): ManagerCareerStats[] {
  const byUser = new Map<string, ManagerCareerStats>();
  // Oldest season first so `seasons` arrays read chronologically.
  const chronological = [...seasons].reverse();
  for (const season of chronological) {
    if (!season.hasResults) continue; // nothing played yet — no record, no finish
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
      const isChampion = season.complete && season.champion?.ownerId === row.ownerId;
      const isRunnerUp = season.complete && season.runnerUp?.ownerId === row.ownerId;
      if (isChampion) stats.championships += 1;
      if (isRunnerUp) stats.runnerUps += 1;
      if (season.complete) {
        stats.bestFinishRank = stats.bestFinishRank
          ? Math.min(stats.bestFinishRank, row.rank)
          : row.rank;
      }
      stats.seasons.push({
        season: season.season,
        rank: season.complete ? row.rank : null,
        record: `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`,
        champion: isChampion,
        complete: season.complete,
      });
    }
  }
  return Array.from(byUser.values()).sort((a, b) => b.championships - a.championships || b.wins - a.wins);
}
