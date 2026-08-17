"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { DashboardMatchupCard } from "@/components/DashboardMatchupCard";
import { useConfig } from "@/hooks/useConfig";
import { MatchupTarget, useDashboardMatchups } from "@/hooks/useDashboardMatchups";
import { getLeagueSummary, LeagueSummary } from "@/lib/league-data";
import { getCurrentWeek } from "@/lib/sleeper";
import { TrackedLeague } from "@/lib/localStore";
import { formatPoints, formatRecord, ordinal } from "@/lib/format";

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
          className="mt-2 rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Go to Settings
        </Link>
      </Card>
    );
  }

  const myRows = leagues
    .map(({ summary }) => summary.standings.find((r) => r.ownerId === config.sleeperUserId))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  const combinedWins = myRows.reduce((sum, r) => sum + r.wins, 0);
  const combinedLosses = myRows.reduce((sum, r) => sum + r.losses, 0);
  const combinedTies = myRows.reduce((sum, r) => sum + r.ties, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Dashboard</h1>

      <div className="w-fit">
        <StatTile
          label="Combined record"
          value={myRows.length ? formatRecord(combinedWins, combinedLosses, combinedTies) : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {leagues.map(({ tracked, summary }) => {
          const myRow = summary.standings.find((r) => r.ownerId === config.sleeperUserId);
          return (
            <Card key={tracked.leagueId} className="flex flex-col gap-4 p-5">
              <div className="min-w-0">
                <Link
                  href={`/league?id=${tracked.leagueId}`}
                  className="block truncate text-lg font-semibold text-ink-primary hover:underline"
                >
                  {summary.league.name}
                </Link>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {summary.league.season} season · {summary.rosters.length} teams
                </div>
              </div>

              {myRow ? (
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Your record</div>
                    <div className="text-xl font-semibold tabular-nums text-ink-primary">
                      {formatRecord(myRow.wins, myRow.losses, myRow.ties)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Rank</div>
                    <div className="text-xl font-semibold tabular-nums text-ink-primary">
                      {ordinal(myRow.rank)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Points for</div>
                    <div className="text-xl font-semibold tabular-nums text-ink-primary">
                      {formatPoints(myRow.pointsFor)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Your team wasn&rsquo;t found in this league&rsquo;s rosters.</p>
              )}

              {myRow ? <DashboardMatchupCard matchup={matchups[tracked.leagueId]} /> : null}

              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-grid pt-3 text-sm">
                <Link
                  href={`/league?id=${tracked.leagueId}`}
                  className="whitespace-nowrap font-medium text-series-1 hover:underline"
                >
                  Standings &amp; matchups
                </Link>
                {tracked.isCommish ? (
                  <Link
                    href={`/recap?id=${tracked.leagueId}`}
                    className="whitespace-nowrap font-medium text-series-1 hover:underline"
                  >
                    Weekly recap
                  </Link>
                ) : null}
                <Link
                  href={`/league/history?id=${tracked.leagueId}`}
                  className="whitespace-nowrap font-medium text-series-1 hover:underline"
                >
                  History
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
