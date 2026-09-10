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

/** Both sides' lineups for one league this week. */
interface LoadedSides {
  mine: StarterEntry[];
  opponent: StarterEntry[];
}

async function loadOne(source: StarterSource, week: number): Promise<LoadedSides> {
  const [matchups, rosters] = await Promise.all([
    getMatchups(source.leagueId, week),
    getLeagueRosters(source.leagueId),
  ]);
  const mine = matchups.find((m) => m.roster_id === source.myRosterId);
  const myRoster = rosters.find((r) => r.roster_id === source.myRosterId);
  // The week's matchup holds the lineup that's locked in for that week; a
  // roster's own `starters` is the fallback before Sleeper has posted the
  // matchup (a not-yet-started week, most of all).
  const myIds = (mine?.starters?.length ? mine.starters : myRoster?.starters ?? []).filter(
    (id) => id && id !== "0"
  );

  const opponentMatchup =
    mine?.matchup_id != null
      ? matchups.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== source.myRosterId)
      : undefined;
  const opponentRoster = opponentMatchup
    ? rosters.find((r) => r.roster_id === opponentMatchup.roster_id)
    : undefined;
  const opponentIds = (opponentMatchup?.starters?.length ? opponentMatchup.starters : opponentRoster?.starters ?? []).filter(
    (id) => id && id !== "0"
  );

  const allIds = [...new Set([...myIds, ...opponentIds])];
  const resolved = allIds.length > 0 ? await resolvePlayers(allIds) : [];
  const byId = new Map(resolved.map((p) => [p.playerId, p]));

  const toEntries = (ids: string[]): StarterEntry[] =>
    ids.map((playerId) => {
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

  return { mine: toEntries(myIds), opponent: toEntries(opponentIds) };
}

export interface MyStartersResult {
  /** Your starters across every tracked league this week. Null until the first load finishes. */
  mine: StarterEntry[] | null;
  /** This week's opponent's starters in each of those same leagues — the other half of the same matchup fetch, not an extra request. */
  opponent: StarterEntry[] | null;
}

/** Both sides of every tracked league's current matchup, tagged with the league each came from. */
export function useMyStarters(sources: StarterSource[], week: number | null): MyStartersResult {
  const [result, setResult] = useState<MyStartersResult>({ mine: null, opponent: null });

  useEffect(() => {
    // A week we don't know yet is still loading, not an empty lineup — staying
    // null keeps the UI on "loading" instead of flashing "nothing set".
    if (week == null) return;
    if (sources.length === 0) {
      queueMicrotask(() => setResult({ mine: [], opponent: [] }));
      return;
    }
    let cancelled = false;

    async function loadAll() {
      const perLeague = await Promise.all(sources.map((s) => loadOne(s, week!)));
      if (!cancelled) {
        setResult({
          mine: perLeague.flatMap((r) => r.mine),
          opponent: perLeague.flatMap((r) => r.opponent),
        });
      }
    }

    loadAll();
    const interval = setInterval(loadAll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sources, week]);

  return result;
}
