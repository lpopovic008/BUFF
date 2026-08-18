"use client";

import { useEffect, useState } from "react";
import { getLeagueRosters, getLeagueUsers } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { displayManagerName } from "@/lib/format";

export interface RosterPlayerOption {
  rosterId: number;
  teamName: string;
  playerId: string;
  name: string;
  position: string;
}

/** Every rostered player across the whole league, grouped by team — the pool the bowl-game player pickers select from. */
export function useLeagueRosterPlayers(leagueId: string | null): RosterPlayerOption[] | null {
  const [options, setOptions] = useState<RosterPlayerOption[] | null>(null);

  useEffect(() => {
    if (!leagueId) {
      queueMicrotask(() => setOptions(null));
      return;
    }
    let cancelled = false;
    (async () => {
      const [rosters, users] = await Promise.all([getLeagueRosters(leagueId), getLeagueUsers(leagueId)]);
      if (cancelled) return;
      const usersById = new Map(users.map((u) => [u.user_id, u]));
      const allPlayerIds = rosters.flatMap((r) => r.players ?? []);
      const resolved = await resolvePlayers(allPlayerIds);
      if (cancelled) return;
      const nameById = new Map(resolved.map((p) => [p.playerId, p]));

      const out: RosterPlayerOption[] = [];
      for (const roster of rosters) {
        const teamName = displayManagerName(roster.owner_id ? usersById.get(roster.owner_id) : undefined);
        for (const playerId of roster.players ?? []) {
          const player = nameById.get(playerId);
          if (!player) continue;
          out.push({ rosterId: roster.roster_id, teamName, playerId, name: player.name, position: player.position });
        }
      }
      setOptions(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  return options;
}
