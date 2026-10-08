"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfig } from "./useConfig";
import { useSummariesAsItStands } from "./useAsItStands";
import { getLeagueSummary, LeagueSummary } from "@/lib/league-data";
import { getCurrentWeek } from "@/lib/sleeper";
import { formatRecord } from "@/lib/format";

/** Your combined win-loss-tie record across every tracked league, for the header — "as it stands", when that's on. */
export function useCombinedRecord(): string | null {
  const { config, loaded: configLoaded } = useConfig();
  const [summaries, setSummaries] = useState<LeagueSummary[] | null>(null);

  useEffect(() => {
    if (!configLoaded) return;
    if (config.leagues.length === 0 || !config.sleeperUserId) {
      queueMicrotask(() => setSummaries(null));
      return;
    }
    let cancelled = false;
    (async () => {
      const currentWeek = await getCurrentWeek();
      const loaded = await Promise.all(config.leagues.map((l) => getLeagueSummary(l.leagueId, currentWeek)));
      if (!cancelled) setSummaries(loaded.filter((s): s is LeagueSummary => s !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, [configLoaded, config.leagues, config.sleeperUserId]);

  const shown = useSummariesAsItStands(summaries);

  return useMemo(() => {
    const myRows = (shown ?? [])
      .map((s) => s.standings.find((r) => r.ownerId === config.sleeperUserId))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (myRows.length === 0) return null;
    const wins = myRows.reduce((sum, r) => sum + r.wins, 0);
    const losses = myRows.reduce((sum, r) => sum + r.losses, 0);
    const ties = myRows.reduce((sum, r) => sum + r.ties, 0);
    return formatRecord(wins, losses, ties);
  }, [shown, config.sleeperUserId]);
}
