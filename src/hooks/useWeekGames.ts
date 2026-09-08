"use client";

import { useEffect, useState } from "react";
import { getWeekGames, NFLGame } from "@/lib/nfl-schedule";

const REFRESH_MS = 60000;

/** Every NFL game in one week, refreshed every 60s so kickoff states and scores stay current. Never throws. */
export function useWeekGames(season: string | null, week: number | null): NFLGame[] {
  const [games, setGames] = useState<NFLGame[]>([]);

  useEffect(() => {
    if (!season || week == null) return;
    let cancelled = false;

    const load = async () => {
      const result = await getWeekGames(season, week);
      if (!cancelled) setGames(result);
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [season, week]);

  return games;
}
