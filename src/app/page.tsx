"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { DashboardMatchupCard } from "@/components/DashboardMatchupCard";
import { useConfig } from "@/hooks/useConfig";
import { MatchupTarget, useDashboardMatchups } from "@/hooks/useDashboardMatchups";
import { getLeagueSummary, LeagueSummary } from "@/lib/league-data";
import { getCurrentWeek } from "@/lib/sleeper";
import { TrackedLeague } from "@/lib/localStore";
import { formatRecord } from "@/lib/format";

interface LoadedLeague {
  tracked: TrackedLeague;
  summary: LeagueSummary;
}

export default function DashboardPage() {
  const { config, loaded, bootstrapping } = useConfig();
  const [leagues, setLeagues] = useState<LoadedLeague[] | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      if (config.leagues.length === 0) {
        setLeagues([]);
        return;
      }
      setLeagues(null);
      setError(null);
      try {
        const currentWeek = await getCurrentWeek();
        if (cancelled) return;
        setWeek(currentWeek);
        const summaries = await Promise.all(
          config.leagues.map(async (tracked) => {
            const summary = await getLeagueSummary(tracked.leagueId, currentWeek);
            return summary ? { tracked, summary } : null;
          })
        );
        if (cancelled) return;
        setLeagues(summaries.filter((s): s is LoadedLeague => s !== null));
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, config.leagues]);

  const matchupTargets = useMemo<MatchupTarget[]>(() => {
    if (!leagues) return [];
    return leagues
      .map(({ tracked, summary }) => {
        const myRow = summary.standings.find((r) => r.ownerId === config.sleeperUserId);
        return myRow ? { leagueId: tracked.leagueId, myRosterId: myRow.rosterId } : null;
      })
      .filter((t): t is MatchupTarget => t !== null);
  }, [leagues, config.sleeperUserId]);
  const matchups = useDashboardMatchups(matchupTargets, week);

  if (bootstrapping) {
    return (
      <Card className="p-12 text-center text-sm text-ink-secondary">
        Finding your Sleeper leagues…
      </Card>
    );
  }

  if (!loaded || leagues === null) {
    return (
      <Card className="p-12 text-center text-sm text-ink-secondary">
        {error ?? "Loading your leagues…"}
      </Card>
    );
  }

  if (config.leagues.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <h1 className="text-xl font-semibold text-ink-primary">No leagues tracked yet</h1>
        <p className="max-w-md text-sm text-ink-secondary">
          Connect your Sleeper username to pull in every league you play in this season.
        </p>
        <Link
          href="/settings"
          className="mt-2 bg-series-1 px-4 py-2 text-sm font-medium text-white transition-transform hover:opacity-90 active:scale-95"
        >
          Go to Settings
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {leagues.map(({ tracked, summary }) => {
          const myRow = summary.standings.find((r) => r.ownerId === config.sleeperUserId);
          return (
            <Link
              key={tracked.leagueId}
              href={`/league?id=${tracked.leagueId}`}
              className="flex min-w-0 flex-col gap-4 border border-border bg-page p-5 transition-colors hover:border-ink-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-balance text-base font-semibold text-ink-primary sm:truncate sm:text-lg">
                  {summary.league.name}
                </div>
                {myRow ? (
                  <div className="shrink-0 text-lg font-semibold tabular-nums text-ink-primary">
                    {formatRecord(myRow.wins, myRow.losses, myRow.ties)}
                  </div>
                ) : null}
              </div>

              {myRow ? (
                <DashboardMatchupCard matchup={matchups[tracked.leagueId]} myRank={myRow.rank} />
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
