"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getLeagueUsers, getMatchups } from "@/lib/sleeper";
import { buildLeagueMatchups } from "@/lib/league-data";
import { resolvePlayers, ResolvedPlayer } from "@/lib/players";

// Same live-scoring poll cadence as the dashboard's matchup card.
const REFRESH_MS = 45_000;

export interface ResolvedSlot {
  slot: string;
  player: ResolvedPlayer | null;
  livePoints: number;
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

/** Every matchup for a league's week, full starting lineups resolved to names, re-polled while mounted so points update live during games. */
export function useLeagueMatchupCarousel(leagueId: string | null, week: number | null): ResolvedMatchupGame[] | null {
  const [games, setGames] = useState<ResolvedMatchupGame[] | null>(null);

  useEffect(() => {
    if (!leagueId || week == null) {
      queueMicrotask(() => setGames(null));
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

      const withNames: ResolvedMatchupGame[] = raw.map((g) => ({
        matchupId: g.matchupId,
        teams: g.teams.map((t) => ({
          rosterId: t.rosterId,
          teamName: t.teamName,
          points: t.points,
          slots: t.slots.map((s) => ({
            slot: s.slot,
            player: s.playerId ? (byId.get(s.playerId) ?? null) : null,
            livePoints: s.playerId ? (t.playersPoints[s.playerId] ?? 0) : 0,
          })),
        })),
      }));
      if (!cancelled) setGames(withNames);
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [leagueId, week]);

  return games;
}
