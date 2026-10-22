"use client";

import { useEffect, useState } from "react";
import { LeagueTrades, loadLeagueTrades } from "@/lib/league-trades";
import { dayOf, ValueHistory, withCurrentValues } from "@/lib/value-history";
import { PlayerValuesSnapshot } from "@/lib/player-values";
import rawValuesSnapshot from "@/data/player-values.json";

let historyLoad: Promise<ValueHistory | null> | null = null;

/**
 * KTC's values over time (see lib/value-history.ts), fetched once — a static file of its own, only wanted here —
 * brought up to today with the values list's own current values, so a trade's "now" matches the list.
 */
export function loadValueHistory(): Promise<ValueHistory | null> {
  historyLoad ??= fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/value-history.json`)
    .then((res) => (res.ok ? (res.json() as Promise<ValueHistory>) : null))
    .then((history) => (history ? withCurrentValues(history, rawValuesSnapshot as unknown as PlayerValuesSnapshot, dayOf(Date.now())) : null))
    .catch(() => null);
  return historyLoad;
}

/** Every trade in a league, across all its seasons, weighed in KTC dynasty value then and now — null while loading. */
export function useLeagueTrades(leagueId: string, myUserId: string | null): LeagueTrades | null {
  const [data, setData] = useState<{ leagueId: string; trades: LeagueTrades } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const history = await loadValueHistory();
      const trades = history ? await loadLeagueTrades(leagueId, myUserId, history) : null;
      if (!cancelled && trades) setData({ leagueId, trades });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId, myUserId]);
  return data?.leagueId === leagueId ? data.trades : null;
}
