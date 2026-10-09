"use client";

import { useEffect, useMemo, useState } from "react";
import { loadTeamPlayers, ResolvedPlayer } from "@/lib/players";

const FANTASY = new Set(["QB", "RB", "WR", "TE", "K"]);

/**
 * Every active player by NFL team, for matching ESPN's names to Sleeper
 * players — each team's likeliest first: anyone with stats this week, then
 * fantasy positions, then the rest. Empty until Sleeper's player list loads.
 */
export function useTeamPlayers(weekStats: Record<string, Record<string, number>>): Map<string, ResolvedPlayer[]> {
  const [byTeam, setByTeam] = useState<Map<string, ResolvedPlayer[]>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    void loadTeamPlayers().then((idx) => {
      if (!cancelled && idx.size > 0) setByTeam(idx);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => {
    const rank = (p: ResolvedPlayer) => (p.playerId in weekStats ? 0 : FANTASY.has(p.position) ? 1 : 2);
    return new Map([...byTeam].map(([team, players]) => [team, [...players].sort((a, b) => rank(a) - rank(b))]));
  }, [byTeam, weekStats]);
}
