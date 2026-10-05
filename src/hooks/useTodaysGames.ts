"use client";

import { useEffect, useState } from "react";
import { useLiveTick } from "@/hooks/useLiveTick";
import { getTodaysGames, NFLGame } from "@/lib/nfl-schedule";

/** Today's NFL games, reloaded on every live-clock tick so live scores and game states stay current. Never throws. */
export function useTodaysGames(): NFLGame[] {
  const [games, setGames] = useState<NFLGame[]>([]);
  const tick = useLiveTick();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await getTodaysGames();
      if (!cancelled) setGames(result);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return games;
}
