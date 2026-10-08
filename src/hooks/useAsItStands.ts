"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getConfig, onLocalWrite } from "@/lib/localStore";
import { getMatchups, SleeperMatchup } from "@/lib/sleeper";
import { LeagueSummary, summaryAsItStands, unfinishedWeeks } from "@/lib/league-data";
import { LIVE_TTL_SECONDS } from "@/lib/live-clock";
import { useLiveTick } from "@/hooks/useLiveTick";

/**
 * Whether "as it stands" is on (see AppConfig.asItStands): the week still
 * being played counts as if it ended now. Follows the setting as it changes.
 */
export function useAsItStands(): boolean {
  return useSyncExternalStore(onLocalWrite, () => getConfig().asItStands === true, () => false);
}

/** Matchups by week, for one league's unfinished weeks. */
export type PendingMatchups = Map<number, SleeperMatchup[]>;

/**
 * With "as it stands" on, each league's unfinished weeks' matchups (see
 * unfinishedWeeks), by league id — reloaded on every live-clock tick, so they
 * follow the scores. Null while it's off.
 */
export function usePendingMatchups(summaries: LeagueSummary[] | null): Map<string, PendingMatchups> | null {
  const on = useAsItStands();
  const tick = useLiveTick();
  const [pending, setPending] = useState<Map<string, PendingMatchups> | null>(null);

  useEffect(() => {
    if (!on || !summaries) return;
    let cancelled = false;
    Promise.all(
      summaries.map(async (s) => {
        const weeks = unfinishedWeeks(s.league, s.currentWeek);
        const matchups = await Promise.all(weeks.map((w) => getMatchups(s.league.league_id, w, LIVE_TTL_SECONDS)));
        return [s.league.league_id, new Map(weeks.map((w, i) => [w, matchups[i]]))] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) setPending(new Map(entries));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [on, summaries, tick]);

  return on ? pending : null;
}

/** The summaries as they'd stand if the week ended now, when that's on; else as they are. */
export function useSummariesAsItStands(summaries: LeagueSummary[] | null): LeagueSummary[] | null {
  const pending = usePendingMatchups(summaries);
  return useMemo(() => {
    if (!summaries || !pending) return summaries;
    return summaries.map((s) => {
      const weeks = pending.get(s.league.league_id);
      return weeks ? summaryAsItStands(s, weeks) : s;
    });
  }, [summaries, pending]);
}
