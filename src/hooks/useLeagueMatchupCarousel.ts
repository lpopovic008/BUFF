"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getLeagueUsers, getMatchups, isDynastyLeague, leagueQBFormat } from "@/lib/sleeper";
import { buildLeagueMatchups } from "@/lib/league-data";
import { resolvePlayers, ResolvedPlayer } from "@/lib/players";
import { positionPpgRankIndexFor, positionValueRankIndexFor, ValueMetric } from "@/lib/matchup-players";
import { normalizeName } from "@/lib/name-match";
import { PlayerValuesSnapshot } from "@/lib/player-values";
import { PlayerStatsSnapshot } from "@/lib/player-stats";
import rawValuesSnapshot from "@/data/player-values.json";
import rawStatsSnapshot from "@/data/player-stats.json";

const valuesSnapshot = rawValuesSnapshot as unknown as PlayerValuesSnapshot;
const statsSnapshot = rawStatsSnapshot as unknown as PlayerStatsSnapshot;

// Same live-scoring poll cadence as the dashboard's matchup card.
const REFRESH_MS = 45_000;

export interface ResolvedSlot {
  slot: string;
  player: ResolvedPlayer | null;
  livePoints: number;
  /** This player's rank among others at their position by points-per-game this season, or null if they haven't played / couldn't be found. */
  posRank: number | null;
  /** This player's dynasty/fantasy trade-value rank among others at their position, or null if KTC has no value for them. */
  valueRank: number | null;
}

export interface ResolvedMatchupTeam {
  rosterId: number;
  teamName: string;
  points: number;
  slots: ResolvedSlot[];
}

export interface ResolvedMatchupGame {
  matchupId: number;
  teams: ResolvedMatchupTeam[];
}

export interface LeagueMatchupCarouselData {
  games: ResolvedMatchupGame[];
  /** Whichever of "Dynasty"/"Fantasy" this league actually is, for the value-rank column header. */
  valueRankLabel: "Dynasty" | "Fantasy";
}

/** Every matchup for a league's week, full starting lineups resolved to names, re-polled while mounted so points update live during games. */
export function useLeagueMatchupCarousel(leagueId: string | null, week: number | null): LeagueMatchupCarouselData | null {
  const [data, setData] = useState<LeagueMatchupCarouselData | null>(null);

  useEffect(() => {
    if (!leagueId || week == null) {
      queueMicrotask(() => setData(null));
      return;
    }
    const id = leagueId;
    const currentWeek = week;
    let cancelled = false;

    async function load() {
      const [league, rosters, users, matchups] = await Promise.all([
        getLeague(id),
        getLeagueRosters(id),
        getLeagueUsers(id),
        getMatchups(id, currentWeek),
      ]);
      if (!league || cancelled) return;

      const raw = buildLeagueMatchups(league, matchups, rosters, users);
      const allIds = raw.flatMap((g) =>
        g.teams.flatMap((t) => t.slots.map((s) => s.playerId).filter((pid): pid is string => pid !== null))
      );
      const resolved = await resolvePlayers(allIds);
      if (cancelled) return;
      const byId = new Map(resolved.map((p) => [p.playerId, p]));

      const metric: ValueMetric = {
        listType: isDynastyLeague(league) ? "dynasty" : "fantasy",
        format: leagueQBFormat(league),
        tep: "standard",
      };
      const valueRankIdx = positionValueRankIndexFor(valuesSnapshot, metric);
      const ppgRankIdx = positionPpgRankIndexFor(statsSnapshot, league.scoring_settings);

      const withNames: ResolvedMatchupGame[] = raw.map((g) => ({
        matchupId: g.matchupId,
        teams: g.teams.map((t) => ({
          rosterId: t.rosterId,
          teamName: t.teamName,
          points: t.points,
          slots: t.slots.map((s) => {
            const player = s.playerId ? (byId.get(s.playerId) ?? null) : null;
            return {
              slot: s.slot,
              player,
              livePoints: s.playerId ? (t.playersPoints[s.playerId] ?? 0) : 0,
              posRank: player ? (ppgRankIdx.get(player.playerId) ?? null) : null,
              valueRank: player ? (valueRankIdx.get(normalizeName(player.name)) ?? null) : null,
            };
          }),
        })),
      }));
      if (!cancelled) {
        setData({ games: withNames, valueRankLabel: metric.listType === "dynasty" ? "Dynasty" : "Fantasy" });
      }
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [leagueId, week]);

  return data;
}
