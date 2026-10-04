"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getLeagueUsers, getMatchups } from "@/lib/sleeper";
import { buildLeagueMatchups } from "@/lib/league-data";
import { resolvePlayers, ResolvedPlayer } from "@/lib/players";
import { positionSeasonRankIndexFor } from "@/lib/matchup-players";
import { PlayerStatsSnapshot } from "@/lib/player-stats";
import rawStatsSnapshot from "@/data/player-stats.json";

const statsSnapshot = rawStatsSnapshot as unknown as PlayerStatsSnapshot;

// Same live-scoring poll cadence as the dashboard's matchup card.
const REFRESH_MS = 45_000;

export interface ResolvedSlot {
  slot: string;
  player: ResolvedPlayer | null;
  livePoints: number;
  /** This player's season rank at their position by fantasy points, e.g. "WR12", or null if they haven't played / couldn't be found. */
  seasonRank: string | null;
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

      const seasonRankIdx = positionSeasonRankIndexFor(statsSnapshot, league.scoring_settings);

      const withNames: ResolvedMatchupGame[] = raw.map((g) => ({
        matchupId: g.matchupId,
        teams: g.teams.map((t) => ({
          rosterId: t.rosterId,
          teamName: t.teamName,
          points: t.points,
          slots: t.slots.map((s) => {
            const player = s.playerId ? (byId.get(s.playerId) ?? null) : null;
            const rank = player ? seasonRankIdx.get(player.playerId) : undefined;
            return {
              slot: s.slot,
              player,
              livePoints: s.playerId ? (t.playersPoints[s.playerId] ?? 0) : 0,
              seasonRank: player && rank ? `${player.position}${rank}` : null,
            };
          }),
        })),
      }));
      if (!cancelled) {
        setData({ games: withNames });
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
