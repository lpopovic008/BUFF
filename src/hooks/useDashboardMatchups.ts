"use client";

import { useEffect, useState } from "react";
import { getLeagueRosters, getLeagueUsers, getMatchups } from "@/lib/sleeper";
import { DashboardMatchupTeam, findMyMatchup } from "@/lib/league-data";
import { resolvePlayers } from "@/lib/players";
import { RankedPlayer, topPlayersByValue } from "@/lib/matchup-players";
import rawSnapshot from "@/data/player-values.json";
import { PlayerValuesSnapshot } from "@/lib/player-values";

const snapshot = rawSnapshot as unknown as PlayerValuesSnapshot;

// Sleeper's own matchups endpoint is the live-scoring source of truth during
// games; re-polling it periodically is how this dashboard "updates live"
// without needing a websocket — the same 60s server-side cache the rest of
// the app uses already keeps this from hammering the API.
const REFRESH_MS = 45_000;

export interface DashboardMatchupSide {
  rosterId: number;
  teamName: string;
  points: number;
  topPlayers: RankedPlayer[];
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
    getMatchups(target.leagueId, week),
    getLeagueRosters(target.leagueId),
    getLeagueUsers(target.leagueId),
  ]);
  const matchup = findMyMatchup(matchups, rosters, users, target.myRosterId);
  if (!matchup) return [target.leagueId, null];

  const allIds = [...matchup.my.playerIds, ...(matchup.opponent?.playerIds ?? [])];
  const resolved = await resolvePlayers(allIds);
  const byId = new Map(resolved.map((p) => [p.playerId, p]));

  const sideView = (side: DashboardMatchupTeam): DashboardMatchupSide => ({
    rosterId: side.rosterId,
    teamName: side.teamName,
    points: side.points,
    topPlayers: topPlayersByValue(
      side.playerIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p)),
      side.playersPoints,
      snapshot,
      3
    ),
  });

  return [
    target.leagueId,
    { my: sideView(matchup.my), opponent: matchup.opponent ? sideView(matchup.opponent) : null },
  ];
}

/** Loads each league's current matchup + top-3-by-KTC-value players per side, and re-polls Sleeper while mounted so scores update live during games. */
export function useDashboardMatchups(
  targets: MatchupTarget[],
  week: number | null
): Record<string, DashboardMatchupView | null> {
  const [byLeague, setByLeague] = useState<Record<string, DashboardMatchupView | null>>({});

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
    const interval = setInterval(loadAll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [targets, week]);

  return byLeague;
}
