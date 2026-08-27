"use client";

import { useEffect, useState } from "react";
import { getTodaysGames, NFLGame } from "@/lib/nfl-schedule";

const REFRESH_MS = 60000;

/** Today's NFL games, refreshed every 60s so live scores and game states stay current. Never throws. */
export function useTodaysGames(): NFLGame[] {
  const [games, setGames] = useState<NFLGame[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await getTodaysGames();
      if (!cancelled) setGames(result);
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return games;
}
