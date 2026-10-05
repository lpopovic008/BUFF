"use client";

import { useEffect, useState } from "react";
import { getLeagueRosters, getLeagueUsers, getMatchups } from "@/lib/sleeper";
import { DashboardMatchupTeam, findMyMatchup } from "@/lib/league-data";
import { LIVE_TTL_SECONDS } from "@/lib/live-clock";
import { useLiveTick } from "@/hooks/useLiveTick";

// Sleeper's own matchups endpoint is the live-scoring source of truth during
// games; reloading it on every tick of the shared live clock is how this
// dashboard "updates live" without needing a websocket.

export interface DashboardMatchupSide {
  rosterId: number;
  teamName: string;
  points: number;
}

export interface DashboardMatchupView {
  my: DashboardMatchupSide;
  opponent: DashboardMatchupSide | null;
}

export interface MatchupTarget {
  leagueId: string;
  myRosterId: number;
}

async function loadOne(target: MatchupTarget, week: number): Promise<[string, DashboardMatchupView | null]> {
  const [matchups, rosters, users] = await Promise.all([
    getMatchups(target.leagueId, week, LIVE_TTL_SECONDS),
    getLeagueRosters(target.leagueId),
    getLeagueUsers(target.leagueId),
  ]);
  const matchup = findMyMatchup(matchups, rosters, users, target.myRosterId);
  if (!matchup) return [target.leagueId, null];

  const sideView = (side: DashboardMatchupTeam): DashboardMatchupSide => ({
    rosterId: side.rosterId,
    teamName: side.teamName,
    points: side.points,
  });

  return [
    target.leagueId,
    { my: sideView(matchup.my), opponent: matchup.opponent ? sideView(matchup.opponent) : null },
  ];
}

/**
 * Loads each league's current matchup — team names and live score per side —
 * and reloads it on every live-clock tick so scores update during games.
 */
export function useDashboardMatchups(
  targets: MatchupTarget[],
  week: number | null
): Record<string, DashboardMatchupView | null> {
  const [byLeague, setByLeague] = useState<Record<string, DashboardMatchupView | null>>({});
  const tick = useLiveTick();

  useEffect(() => {
    if (week == null || targets.length === 0) {
      return;
    }
    const currentWeek = week;
    let cancelled = false;

    async function loadAll() {
      const results = await Promise.all(targets.map((t) => loadOne(t, currentWeek)));
      if (!cancelled) setByLeague(Object.fromEntries(results));
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [targets, week, tick]);

  return byLeague;
}
