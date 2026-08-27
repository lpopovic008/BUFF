"use client";

import { useEffect, useRef, useState } from "react";
import { SleeperMatchup, getLeagueHistoryChain, getLeagueRosters, getMatchups } from "@/lib/sleeper";

export interface AllTimeRecord {
  wins: number;
  losses: number;
}

// Covers a standard regular season + playoffs; Sleeper returns an empty
// array for a week that doesn't exist for a given league, so overshooting
// this for a shorter season is harmless.
const MAX_WEEKS = 18;

/**
 * All-time head-to-head win-loss record between every pair of managers in
 * this league, replayed across every season linked by previous_league_id —
 * keyed by Sleeper owner (user) id rather than roster id, since roster ids
 * get reassigned each season but a manager's owner id doesn't. Sleeper has
 * no head-to-head endpoint of its own, so this is built from every
 * completed week's matchups in every linked season. Fetched once per
 * league and cached — flipping through the Dossier's compared manager
 * doesn't refetch.
 */
export function useAllTimeHeadToHead(leagueId: string): Map<string, Map<string, AllTimeRecord>> {
  const [result, setResult] = useState<Map<string, Map<string, AllTimeRecord>>>(new Map());
  const cacheRef = useRef<{ leagueId: string; data: Map<string, Map<string, AllTimeRecord>> } | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    if (cacheRef.current?.leagueId === leagueId) {
      setResult(cacheRef.current.data);
      return;
    }
    let cancelled = false;

    (async () => {
      const chain = await getLeagueHistoryChain(leagueId);
      const byOwner = new Map<string, Map<string, AllTimeRecord>>();
      const record = (a: string, b: string, aWon: boolean) => {
        const opponents = byOwner.get(a) ?? new Map<string, AllTimeRecord>();
        const rec = opponents.get(b) ?? { wins: 0, losses: 0 };
        if (aWon) rec.wins += 1;
        else rec.losses += 1;
        opponents.set(b, rec);
        byOwner.set(a, opponents);
      };

      await Promise.all(
        chain.map(async (season) => {
          const [rosters, weeks] = await Promise.all([
            getLeagueRosters(season.league_id),
            Promise.all(Array.from({ length: MAX_WEEKS }, (_, i) => getMatchups(season.league_id, i + 1))),
          ]);
          const ownerByRoster = new Map(
            rosters.filter((r) => r.owner_id).map((r) => [r.roster_id, r.owner_id as string])
          );
          for (const weekMatchups of weeks) {
            const byMatchupId = new Map<number, SleeperMatchup[]>();
            for (const m of weekMatchups) {
              if (m.matchup_id == null) continue;
              const list = byMatchupId.get(m.matchup_id) ?? [];
              list.push(m);
              byMatchupId.set(m.matchup_id, list);
            }
            for (const pair of byMatchupId.values()) {
              if (pair.length !== 2) continue;
              const [a, b] = pair;
              const ownerA = ownerByRoster.get(a.roster_id);
              const ownerB = ownerByRoster.get(b.roster_id);
              if (!ownerA || !ownerB || a.points === b.points) continue;
              const aWon = a.points > b.points;
              record(ownerA, ownerB, aWon);
              record(ownerB, ownerA, !aWon);
            }
          }
        })
      );

      if (!cancelled) {
        cacheRef.current = { leagueId, data: byOwner };
        setResult(byOwner);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  return result;
}
