"use client";

import { useEffect, useState } from "react";
import { getLeagueRosters, getLeagueUsers } from "@/lib/sleeper";
import { displayManagerName } from "@/lib/format";

export interface LeagueTeamOption {
  rosterId: number;
  teamName: string;
}

/** Every team (manager + roster id) in the league — the pool the bowl-game team pickers select from. */
export function useLeagueTeams(leagueId: string | null): LeagueTeamOption[] | null {
  const [teams, setTeams] = useState<LeagueTeamOption[] | null>(null);

  useEffect(() => {
    if (!leagueId) {
      queueMicrotask(() => setTeams(null));
      return;
    }
    let cancelled = false;
    (async () => {
      const [rosters, users] = await Promise.all([getLeagueRosters(leagueId), getLeagueUsers(leagueId)]);
      if (cancelled) return;
      const usersById = new Map(users.map((u) => [u.user_id, u]));
      setTeams(
        rosters.map((r) => ({
          rosterId: r.roster_id,
          teamName: displayManagerName(r.owner_id ? usersById.get(r.owner_id) : undefined),
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  return teams;
}
