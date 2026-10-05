"use client";

import { useEffect, useState } from "react";
import { useLiveTick } from "@/hooks/useLiveTick";
import { getWeekGames, NFLGame } from "@/lib/nfl-schedule";

/** Every NFL game in one week, reloaded on every live-clock tick so kickoff states and scores stay current. Never throws. */
export function useWeekGames(season: string | null, week: number | null): NFLGame[] {
  const [games, setGames] = useState<NFLGame[]>([]);
  const tick = useLiveTick();

  useEffect(() => {
    if (!season || week == null) return;
    let cancelled = false;

    const load = async () => {
      const result = await getWeekGames(season, week);
      if (!cancelled) setGames(result);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [season, week, tick]);

  return games;
}
