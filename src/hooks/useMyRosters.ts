"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getLeagueUsers } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { RankedPlayer, rankPlayersByValue } from "@/lib/matchup-players";
import { displayManagerName } from "@/lib/format";
import rawSnapshot from "@/data/player-values.json";
import { PlayerValuesSnapshot } from "@/lib/player-values";

const snapshot = rawSnapshot as unknown as PlayerValuesSnapshot;

export interface MyRosterView {
  leagueId: string;
  leagueName: string;
  teamName: string;
  rosterId: number;
  players: RankedPlayer[];
}

async function loadOne(leagueId: string, sleeperUserId: string): Promise<MyRosterView | null> {
  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  if (!league) return null;
  const myRoster = rosters.find((r) => r.owner_id === sleeperUserId);
  if (!myRoster) return null;
  const user = users.find((u) => u.user_id === sleeperUserId);
  const resolved = await resolvePlayers(myRoster.players ?? []);
  return {
    leagueId,
    leagueName: league.name,
    teamName: displayManagerName(user),
    rosterId: myRoster.roster_id,
    players: rankPlayersByValue(resolved, {}, snapshot),
  };
}

/** Your own roster + KTC values for every tracked league — the Values tab's "My Teams" section. */
export function useMyRosters(leagueIds: string[], sleeperUserId: string | null): MyRosterView[] | null {
  const [rosters, setRosters] = useState<MyRosterView[] | null>(null);

  useEffect(() => {
    if (!sleeperUserId || leagueIds.length === 0) {
      queueMicrotask(() => setRosters([]));
      return;
    }
    const userId = sleeperUserId;
    let cancelled = false;

    (async () => {
      const results = await Promise.all(leagueIds.map((id) => loadOne(id, userId)));
      if (!cancelled) setRosters(results.filter((r): r is MyRosterView => r !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueIds, sleeperUserId]);

  return rosters;
}
