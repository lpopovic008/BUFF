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
 * Who a matchup team is in the all-time records: its manager (Sleeper user
 * id) when the team has one, else its team slot ("roster:4") — an unclaimed
 * team has no manager, but its slot keeps its history.
 */
export function headToHeadKey(rosterId: number, ownerId: string | null | undefined): string {
  return ownerId ?? `roster:${rosterId}`;
}

/** Every key a team's games are filed under: its manager's, if it has one, and always its slot's. */
function teamKeys(rosterId: number, ownerByRoster: Map<number, string>): string[] {
  const owner = ownerByRoster.get(rosterId);
  const slot = headToHeadKey(rosterId, null);
  return owner ? [owner, slot] : [slot];
}

/**
 * All-time head-to-head win-loss record between every pair of managers in
 * this league, replayed across every season linked by previous_league_id —
 * keyed by Sleeper owner (user) id, so a manager's record follows them even
 * if they take over a different team — and also by team slot ("roster:4",
 * see headToHeadKey), which is how an unclaimed team is looked up: its
 * slot's whole history, whoever ran it then. Sleeper has
 * no head-to-head endpoint of its own, so this is built from every
 * finished week's matchups in every linked season (never the week being
 * played, whose scores aren't final). Fetched once per league and cached —
 * flipping through the Dossier's compared manager doesn't refetch.
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
          // Only finished weeks: in a season still being played, the week underway
          // (and anything after it) would count a half-played matchup as a result.
          const lastScored = Number(season.settings.last_scored_leg);
          const current = Number(season.settings.leg);
          const lastWeek =
            season.status === "complete"
              ? MAX_WEEKS
              : Number.isFinite(lastScored) && lastScored > 0
                ? lastScored
                : Number.isFinite(current) && current > 0
                  ? current - 1
                  : 0;
          for (const [i, weekMatchups] of weeks.entries()) {
            if (i + 1 > lastWeek) continue;
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
              if (a.points === b.points) continue;
              const aWon = a.points > b.points;
              // Every game counts under each side's manager and under its team
              // slot, so an unclaimed team still has its whole history.
              for (const keyA of teamKeys(a.roster_id, ownerByRoster)) {
                for (const keyB of teamKeys(b.roster_id, ownerByRoster)) {
                  record(keyA, keyB, aWon);
                  record(keyB, keyA, !aWon);
                }
              }
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
