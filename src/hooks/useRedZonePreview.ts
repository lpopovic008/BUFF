"use client";

// TEMPORARY — a finished game kept in the Red Zone, to work on how plays look
// between game days. Turn off with REDZONE_PREVIEW (or delete this file and
// its uses in the home page, RedZone and useRedZoneFeed).

import { useEffect, useState } from "react";
import { getWeekGames, NFLGame } from "@/lib/nfl-schedule";

export const REDZONE_PREVIEW = true;

/** The last game of `week` (the latest kickoff — Monday night's), or none with the preview off. */
export function useRedZonePreview(season: string | null, week: number | null): NFLGame[] {
  const [games, setGames] = useState<NFLGame[]>([]);
  useEffect(() => {
    if (!REDZONE_PREVIEW || !season || week == null || week < 1) return;
    let cancelled = false;
    void getWeekGames(season, week).then((all) => {
      const finished = all.filter((g) => g.state === "post" && g.kickoff);
      const last = Math.max(...finished.map((g) => Date.parse(g.kickoff)));
      if (!cancelled) setGames(finished.filter((g) => Date.parse(g.kickoff) === last));
    });
    return () => {
      cancelled = true;
    };
  }, [season, week]);
  return games;
}
