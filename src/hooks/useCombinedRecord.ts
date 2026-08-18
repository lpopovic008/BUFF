"use client";

import { useEffect, useState } from "react";
import { useConfig } from "./useConfig";
import { getLeagueSummary } from "@/lib/league-data";
import { getCurrentWeek } from "@/lib/sleeper";
import { formatRecord } from "@/lib/format";

/** Your combined win-loss-tie record across every tracked league, for the header. */
export function useCombinedRecord(): string | null {
  const { config, loaded: configLoaded } = useConfig();
  const [record, setRecord] = useState<string | null>(null);

  useEffect(() => {
    if (!configLoaded) return;
    if (config.leagues.length === 0 || !config.sleeperUserId) {
      queueMicrotask(() => setRecord(null));
      return;
    }
    let cancelled = false;
    (async () => {
      const currentWeek = await getCurrentWeek();
      const summaries = await Promise.all(
        config.leagues.map((l) => getLeagueSummary(l.leagueId, currentWeek))
      );
      if (cancelled) return;
      const myRows = summaries
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .map((s) => s.standings.find((r) => r.ownerId === config.sleeperUserId))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      if (myRows.length === 0) {
        setRecord(null);
        return;
      }
      const wins = myRows.reduce((sum, r) => sum + r.wins, 0);
      const losses = myRows.reduce((sum, r) => sum + r.losses, 0);
      const ties = myRows.reduce((sum, r) => sum + r.ties, 0);
      setRecord(formatRecord(wins, losses, ties));
    })();
    return () => {
      cancelled = true;
    };
  }, [configLoaded, config.leagues, config.sleeperUserId]);

  return record;
}
