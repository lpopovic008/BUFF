// Data layer for the War Room Console (/warroom) — a HUD-style dashboard.
// Every number here is either read straight from Sleeper or derived from
// Sleeper data the app already fetches elsewhere (league-data.ts,
// matchup-players.ts). Two things Sleeper's public API doesn't expose at all
// — per-player live projections and a play-by-play scoring feed — are
// approximated (see `seasonAvg`-based "vs pace" below) or replaced with real
// data that serves the same spot on screen (the transaction feed). Anywhere
// a number is a heuristic rather than a fact Sleeper reports, it's noted here
// and the UI's own card copy says so too.

import {
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperRoster,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getMatchups,
  getTransactions,
  isDynastyLeague,
  leagueQBFormat,
} from "./sleeper";
import { buildLineupSlots, buildStandingsThroughWeek } from "./league-data";
import { displayManagerName } from "./format";
import { resolvePlayers, ResolvedPlayer } from "./players";
import { RankedPlayer, ValueMetric, rankPlayersByValue } from "./matchup-players";
import rawSnapshot from "@/data/player-values.json";
import { PlayerValuesSnapshot } from "./player-values";

const snapshot = rawSnapshot as unknown as PlayerValuesSnapshot;

const RADAR_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type RadarPosition = (typeof RADAR_POSITIONS)[number];

export interface WarRoomLineupPlayer {
  slot: string;
  playerId: string;
  name: string;
  position: string;
  /** NFL team code — also the key into TEAM_CITIES for the Territory Map's stadium lookup. */
  team: string | null;
  /** This week's live/final points so far — 0 before kickoff. */
  actual: number;
  /**
   * This player's own average points per game across completed weeks this
   * season. Sleeper has no live per-player projection to compare against, so
   * "exceeding expectations" is read against their own season pace instead.
   * Falls back to `actual` (a neutral 1.0 ratio) for a player with no
   * history yet, e.g. a just-added waiver pickup.
   */
  seasonAvg: number;
}

export interface HeadToHeadRecord {
  rosterId: number;
  wins: number;
  losses: number;
  lastMargin: number | null;
}

export interface WarRoomManager {
  rosterId: number;
  ownerId: string | null;
  name: string;
  initial: string;
  wins: number;
  losses: number;
  ties: number;
  /** Percentile (0-100) of this roster's KTC value at QB/RB/WR/TE vs the rest of the league. */
  radar: Record<RadarPosition, number>;
  livePoints: number;
  opponentRosterId: number | null;
  opponentLivePoints: number | null;
  lineup: WarRoomLineupPlayer[];
  /** 0-100, derived from the live matchup margin — Sleeper publishes no win-probability field. */
  winChance: number;
  /** 0-100, derived from the gap to this week's current league-high score. */
  topScorerChance: number;
  /** 0-100 gauge, 50 = exactly on this team's own season-average pace. */
  vsPaceGauge: number;
  headToHead: Map<number, HeadToHeadRecord>;
  /** Cumulative win% after each completed week (real, from replayed standings). */
  seasonForm: number[];
  /**
   * A straight line from 0 (kickoff) to the real current point differential
   * vs this week's opponent. Sleeper has no historical intra-week scoring
   * snapshots, so the path between those two real endpoints is a straight
   * interpolation, not a recorded trace.
   */
  momentum: number[];
}

export interface SonarBlip {
  margin: number;
  label: string;
}

export interface WarRoomData {
  leagueId: string;
  leagueName: string;
  week: number;
  completedWeeks: number;
  myRosterId: number;
  you: WarRoomManager;
  others: WarRoomManager[];
  transactionSummaries: string[];
  sonarBlips: SonarBlip[];
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function percentileRank(values: number[], value: number): number {
  if (values.length <= 1) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v < value).length;
  return Math.round((rank / (sorted.length - 1)) * 100);
}

/** Sum of a roster's KTC value at one position group. Unranked players (K, DST, etc.) don't count toward any axis. */
function positionValueSum(players: RankedPlayer[], position: RadarPosition): number {
  return players
    .filter((p) => p.position === position && p.ktcValue != null)
    .reduce((sum, p) => sum + (p.ktcValue ?? 0), 0);
}

export async function loadWarRoomData(
  leagueId: string,
  myUserId: string | null,
  currentWeek: number
): Promise<WarRoomData | null> {
  const league = await getLeague(leagueId);
  if (!league) return null;

  const [rosters, users] = await Promise.all([getLeagueRosters(leagueId), getLeagueUsers(leagueId)]);
  const myRoster = rosters.find((r) => r.owner_id != null && r.owner_id === myUserId);
  if (!myRoster) return null;

  const completedWeeks = Math.max(0, currentWeek - 1);

  const [currentMatchups, historicalWeeks, transactions, allResolvedPlayers] = await Promise.all([
    getMatchups(leagueId, currentWeek),
    Promise.all(Array.from({ length: completedWeeks }, (_, i) => getMatchups(leagueId, i + 1))),
    getTransactions(leagueId, currentWeek),
    resolvePlayers(rosters.flatMap((r) => r.players ?? [])),
  ]);

  const matchupsByWeek = new Map<number, SleeperMatchup[]>();
  historicalWeeks.forEach((weekMatchups, i) => matchupsByWeek.set(i + 1, weekMatchups));

  const playersById = new Map(allResolvedPlayers.map((p) => [p.playerId, p]));
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const currentByRoster = new Map(currentMatchups.map((m) => [m.roster_id, m]));

  // Per-player season-average points, from every completed week's players_points.
  const playerPointHistory = new Map<string, { sum: number; weeks: number }>();
  for (const weekMatchups of historicalWeeks) {
    for (const m of weekMatchups) {
      for (const [playerId, pts] of Object.entries(m.players_points ?? {})) {
        const entry = playerPointHistory.get(playerId) ?? { sum: 0, weeks: 0 };
        entry.sum += pts;
        entry.weeks += 1;
        playerPointHistory.set(playerId, entry);
      }
    }
  }
  const seasonAvgFor = (playerId: string, fallback: number): number => {
    const h = playerPointHistory.get(playerId);
    return h && h.weeks > 0 ? h.sum / h.weeks : fallback;
  };

  const metric: ValueMetric = {
    listType: isDynastyLeague(league) ? "dynasty" : "fantasy",
    format: leagueQBFormat(league),
    tep: "standard",
  };

  // KTC value sums per roster, per position — the basis for the radar's percentiles.
  const positionSumsByRoster = new Map<number, Record<RadarPosition, number>>();
  for (const roster of rosters) {
    const rosterPlayers = (roster.players ?? [])
      .map((id) => playersById.get(id))
      .filter((p): p is ResolvedPlayer => Boolean(p));
    const ranked = rankPlayersByValue(rosterPlayers, {}, snapshot, metric);
    const sums = Object.fromEntries(
      RADAR_POSITIONS.map((pos) => [pos, positionValueSum(ranked, pos)])
    ) as Record<RadarPosition, number>;
    positionSumsByRoster.set(roster.roster_id, sums);
  }

  // Head-to-head: replay every completed week's pairings.
  const headToHeadByRoster = new Map<number, Map<number, HeadToHeadRecord>>();
  for (const roster of rosters) headToHeadByRoster.set(roster.roster_id, new Map());
  for (const weekMatchups of historicalWeeks) {
    const byMatchupId = new Map<number, SleeperMatchup[]>();
    for (const m of weekMatchups) {
      if (m.matchup_id == null) continue;
      const list = byMatchupId.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchupId.set(m.matchup_id, list);
    }
    for (const pair of byMatchupId.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      recordHeadToHead(headToHeadByRoster, a.roster_id, b.roster_id, a.points - b.points);
      recordHeadToHead(headToHeadByRoster, b.roster_id, a.roster_id, b.points - a.points);
    }
  }

  // Season form: cumulative win% after each completed week.
  const seasonFormByRoster = new Map<number, number[]>();
  for (const roster of rosters) seasonFormByRoster.set(roster.roster_id, []);
  for (let w = 1; w <= completedWeeks; w++) {
    const standingsThroughW = buildStandingsThroughWeek(rosters, users, matchupsByWeek, w);
    for (const row of standingsThroughW) {
      const games = row.wins + row.losses + row.ties;
      const pct = games > 0 ? Math.round(((row.wins + row.ties * 0.5) / games) * 100) : 0;
      seasonFormByRoster.get(row.rosterId)?.push(pct);
    }
  }

  // Each team's own season-average total (sum of their roster's per-week points), for the "vs pace" gauge.
  const teamWeeklyTotals = new Map<number, number[]>();
  for (const roster of rosters) teamWeeklyTotals.set(roster.roster_id, []);
  for (const weekMatchups of historicalWeeks) {
    for (const m of weekMatchups) {
      teamWeeklyTotals.get(m.roster_id)?.push(m.points);
    }
  }
  const seasonAvgTotalFor = (rosterId: number, fallback: number): number => {
    const totals = teamWeeklyTotals.get(rosterId) ?? [];
    if (totals.length === 0) return fallback;
    return totals.reduce((s, v) => s + v, 0) / totals.length;
  };

  const highestLiveScore = Math.max(0, ...currentMatchups.map((m) => m.points));

  const buildManager = (roster: SleeperRoster): WarRoomManager => {
    const user = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const name = displayManagerName(user);
    const current = currentByRoster.get(roster.roster_id);
    const livePoints = current?.points ?? 0;
    const opponent = current?.matchup_id != null
      ? currentMatchups.find((m) => m.matchup_id === current.matchup_id && m.roster_id !== roster.roster_id)
      : undefined;
    const marginNow = opponent ? livePoints - opponent.points : 0;

    const slots = buildLineupSlots(league.roster_positions, current?.starters);
    const lineup: WarRoomLineupPlayer[] = slots.map((slot) => {
      const player = slot.playerId ? playersById.get(slot.playerId) : undefined;
      const actual = slot.playerId ? current?.players_points?.[slot.playerId] ?? 0 : 0;
      return {
        slot: slot.slot,
        playerId: slot.playerId ?? "",
        name: player?.name ?? "Empty",
        position: player?.position ?? slot.slot,
        team: player?.team ?? null,
        actual,
        seasonAvg: slot.playerId ? seasonAvgFor(slot.playerId, actual) : actual,
      };
    });

    const seasonAvgTotal = seasonAvgTotalFor(roster.roster_id, livePoints || 1);
    const vsPaceGauge = clamp(Math.round((livePoints / (seasonAvgTotal || 1) - 0.5) * 100), 0, 100);
    const winChance = clamp(Math.round(50 + marginNow * 2.5), 1, 99);
    const gapToLead = Math.max(0, highestLiveScore - livePoints);
    const topScorerChance = clamp(Math.round(100 - gapToLead * 4), 2, 96);

    const radarSums = positionSumsByRoster.get(roster.roster_id) ?? { QB: 0, RB: 0, WR: 0, TE: 0 };
    const radar = Object.fromEntries(
      RADAR_POSITIONS.map((pos) => [
        pos,
        percentileRank(rosters.map((r) => positionSumsByRoster.get(r.roster_id)?.[pos] ?? 0), radarSums[pos]),
      ])
    ) as Record<RadarPosition, number>;

    const momentum = Array.from({ length: 12 }, (_, i) => (marginNow * i) / 11);

    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      name,
      initial: initialOf(name),
      wins: roster.settings.wins ?? 0,
      losses: roster.settings.losses ?? 0,
      ties: roster.settings.ties ?? 0,
      radar,
      livePoints,
      opponentRosterId: opponent?.roster_id ?? null,
      opponentLivePoints: opponent?.points ?? null,
      lineup,
      winChance,
      topScorerChance,
      vsPaceGauge,
      headToHead: headToHeadByRoster.get(roster.roster_id) ?? new Map(),
      seasonForm: seasonFormByRoster.get(roster.roster_id) ?? [],
      momentum,
    };
  };

  const you = buildManager(myRoster);
  const others = rosters.filter((r) => r.roster_id !== myRoster.roster_id).map(buildManager);

  const transactionSummaries = await buildTransactionSummariesLocal(transactions, rosters, usersById);

  const sonarBlips = closestLiveMargins(currentMatchups, rosters, usersById);

  return {
    leagueId,
    leagueName: league.name,
    week: currentWeek,
    completedWeeks,
    myRosterId: myRoster.roster_id,
    you,
    others,
    transactionSummaries,
    sonarBlips,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function recordHeadToHead(
  byRoster: Map<number, Map<number, HeadToHeadRecord>>,
  rosterId: number,
  opponentId: number,
  margin: number
) {
  const opponents = byRoster.get(rosterId);
  if (!opponents) return;
  const record = opponents.get(opponentId) ?? { rosterId: opponentId, wins: 0, losses: 0, lastMargin: null };
  if (margin > 0) record.wins += 1;
  else if (margin < 0) record.losses += 1;
  record.lastMargin = margin;
  opponents.set(opponentId, record);
}

async function buildTransactionSummariesLocal(
  transactions: Awaited<ReturnType<typeof getTransactions>>,
  rosters: SleeperRoster[],
  usersById: Map<string, SleeperLeagueUser>
): Promise<string[]> {
  const completed = transactions.filter((t) => t.status === "complete");
  if (completed.length === 0) return [];
  const rostersById = new Map(rosters.map((r) => [r.roster_id, r]));
  const teamName = (rosterId: number) => {
    const roster = rostersById.get(rosterId);
    const user = roster?.owner_id ? usersById.get(roster.owner_id) : undefined;
    return displayManagerName(user);
  };
  const allPlayerIds = completed.flatMap((t) => [...Object.keys(t.adds ?? {}), ...Object.keys(t.drops ?? {})]);
  const resolved = await resolvePlayers(allPlayerIds);
  const nameById = new Map(resolved.map((p) => [p.playerId, p.name]));

  const summaries: string[] = [];
  for (const t of completed) {
    if (t.type === "trade") {
      const teams = t.roster_ids.map(teamName).join(" ↔ ");
      summaries.push(`Trade: ${teams}`);
      continue;
    }
    const label = t.type === "waiver" ? "Waiver" : "Free agent";
    for (const [playerId, rosterId] of Object.entries(t.adds ?? {})) {
      summaries.push(`${label}: ${teamName(rosterId)} added ${nameById.get(playerId) ?? "a player"}`);
    }
  }
  return summaries;
}

function closestLiveMargins(
  currentMatchups: SleeperMatchup[],
  rosters: SleeperRoster[],
  usersById: Map<string, SleeperLeagueUser>
): SonarBlip[] {
  const rostersById = new Map(rosters.map((r) => [r.roster_id, r]));
  const teamName = (rosterId: number) => {
    const roster = rostersById.get(rosterId);
    const user = roster?.owner_id ? usersById.get(roster.owner_id) : undefined;
    return displayManagerName(user);
  };
  const byMatchupId = new Map<number, SleeperMatchup[]>();
  for (const m of currentMatchups) {
    if (m.matchup_id == null) continue;
    const list = byMatchupId.get(m.matchup_id) ?? [];
    list.push(m);
    byMatchupId.set(m.matchup_id, list);
  }
  const margins: SonarBlip[] = [];
  for (const pair of byMatchupId.values()) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    const margin = Math.abs(a.points - b.points);
    const leader = a.points >= b.points ? a : b;
    const trailer = a.points >= b.points ? b : a;
    margins.push({ margin, label: `${teamName(leader.roster_id)} vs ${teamName(trailer.roster_id)}` });
  }
  return margins.sort((x, y) => x.margin - y.margin).slice(0, 5);
}
