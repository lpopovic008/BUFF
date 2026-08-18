"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters } from "@/lib/sleeper";

export interface MyLeagueOption {
  leagueId: string;
  leagueName: string;
  rosterId: number;
}

/** Just enough per tracked league to populate the Values tab's league picker — name and your own roster id, not the full roster. */
export function useMyLeagues(leagueIds: string[], sleeperUserId: string | null): MyLeagueOption[] | null {
  const [leagues, setLeagues] = useState<MyLeagueOption[] | null>(null);

  useEffect(() => {
    if (!sleeperUserId || leagueIds.length === 0) {
      queueMicrotask(() => setLeagues([]));
      return;
    }
    const userId = sleeperUserId;
    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        leagueIds.map(async (leagueId) => {
          const [league, rosters] = await Promise.all([getLeague(leagueId), getLeagueRosters(leagueId)]);
          if (!league) return null;
          const myRoster = rosters.find((r) => r.owner_id === userId);
          if (!myRoster) return null;
          return { leagueId, leagueName: league.name, rosterId: myRoster.roster_id };
        })
      );
      if (!cancelled) setLeagues(results.filter((r): r is MyLeagueOption => r !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueIds, sleeperUserId]);

  return leagues;
}
