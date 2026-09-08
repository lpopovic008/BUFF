"use client";

import { useEffect, useState } from "react";
import { getLeagueRosters, getMatchups } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { StarterEntry } from "@/lib/my-starters";

export interface StarterSource {
  leagueId: string;
  leagueName: string;
  myRosterId: number;
}

// Same cadence as the dashboard's matchup poll, so a lineup change made in the
// Sleeper app shows up here without a refresh.
const REFRESH_MS = 45_000;

async function loadOne(source: StarterSource, week: number): Promise<StarterEntry[]> {
  const [matchups, rosters] = await Promise.all([
    getMatchups(source.leagueId, week),
    getLeagueRosters(source.leagueId),
  ]);
  const mine = matchups.find((m) => m.roster_id === source.myRosterId);
  const roster = rosters.find((r) => r.roster_id === source.myRosterId);
  // The week's matchup holds the lineup that's locked in for that week; a
  // roster's own `starters` is the fallback before Sleeper has posted the
  // matchup (a not-yet-started week, most of all).
  const ids = (mine?.starters?.length ? mine.starters : roster?.starters ?? []).filter(
    (id) => id && id !== "0"
  );
  if (ids.length === 0) return [];

  const resolved = await resolvePlayers(ids);
  const byId = new Map(resolved.map((p) => [p.playerId, p]));
  return ids.map((playerId) => {
    const player = byId.get(playerId);
    return {
      playerId,
      name: player?.name ?? `Player ${playerId}`,
      position: player?.position ?? "",
      team: player?.team ?? null,
      leagueId: source.leagueId,
      leagueName: source.leagueName,
    };
  });
}

/** Every starter you have across every tracked league this week, tagged with the league it came from. Null until the first load finishes. */
export function useMyStarters(sources: StarterSource[], week: number | null): StarterEntry[] | null {
  const [starters, setStarters] = useState<StarterEntry[] | null>(null);

  useEffect(() => {
    // A week we don't know yet is still loading, not an empty lineup — staying
    // null keeps the UI on "loading" instead of flashing "nothing set".
    if (week == null) return;
    if (sources.length === 0) {
      queueMicrotask(() => setStarters([]));
      return;
    }
    let cancelled = false;

    async function loadAll() {
      const perLeague = await Promise.all(sources.map((s) => loadOne(s, week!)));
      if (!cancelled) setStarters(perLeague.flat());
    }

    loadAll();
    const interval = setInterval(loadAll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sources, week]);

  return starters;
}
