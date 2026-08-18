"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getLeagueUsers, isDynastyLeague, leagueQBFormat } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { RankedPlayer, ValueMetric, rankPlayersByValue } from "@/lib/matchup-players";
import { displayManagerName } from "@/lib/format";
import rawSnapshot from "@/data/player-values.json";
import { PlayerValuesSnapshot } from "@/lib/player-values";

const snapshot = rawSnapshot as unknown as PlayerValuesSnapshot;

export interface TeamRosterView {
  rosterId: number;
  teamName: string;
  players: RankedPlayer[];
}

export interface LeagueTeamRosters {
  leagueId: string;
  leagueName: string;
  metric: ValueMetric;
  myRosterId: number | null;
  teams: TeamRosterView[];
}

/** Every team's roster + KTC values in one league — scored dynasty vs fantasy and 1QB vs Superflex to match how that league actually plays, for the Values tab's swipeable "My Teams" carousel. */
export function useLeagueTeamRosters(
  leagueId: string | null,
  sleeperUserId: string | null
): LeagueTeamRosters | null {
  const [data, setData] = useState<LeagueTeamRosters | null>(null);

  useEffect(() => {
    if (!leagueId) {
      queueMicrotask(() => setData(null));
      return;
    }
    let cancelled = false;

    (async () => {
      const [league, rosters, users] = await Promise.all([
        getLeague(leagueId),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
      ]);
      if (cancelled || !league) return;

      const usersById = new Map(users.map((u) => [u.user_id, u]));
      const resolved = await resolvePlayers(rosters.flatMap((r) => r.players ?? []));
      if (cancelled) return;
      const byId = new Map(resolved.map((p) => [p.playerId, p]));

      const metric: ValueMetric = {
        listType: isDynastyLeague(league) ? "dynasty" : "fantasy",
        format: leagueQBFormat(league),
        tep: "standard",
      };

      const teams: TeamRosterView[] = rosters.map((r) => {
        const rosterPlayers = (r.players ?? [])
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        return {
          rosterId: r.roster_id,
          teamName: displayManagerName(r.owner_id ? usersById.get(r.owner_id) : undefined),
          players: rankPlayersByValue(rosterPlayers, {}, snapshot, metric),
        };
      });

      setData({
        leagueId,
        leagueName: league.name,
        metric,
        myRosterId: rosters.find((r) => r.owner_id === sleeperUserId)?.roster_id ?? null,
        teams,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, sleeperUserId]);

  return data;
}
