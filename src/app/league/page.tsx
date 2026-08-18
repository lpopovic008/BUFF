"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LeagueMatchupCarousel } from "@/components/LeagueMatchupCarousel";
import { MoneyBoard } from "@/components/MoneyBoard";
import { useConfig } from "@/hooks/useConfig";
import { useLeagueMatchupCarousel } from "@/hooks/useLeagueMatchupCarousel";
import { getLeagueSummary, computeWeekRecap, LeagueSummary, WeekRecapData } from "@/lib/league-data";
import { loadLeagueMoney, LeagueMoney } from "@/lib/league-money";
import { getCurrentWeek } from "@/lib/sleeper";
import { formatPoints, formatRecord, ordinal } from "@/lib/format";

function LeagueDetailContent() {
  const leagueId = useSearchParams().get("id");
  const { config, loaded } = useConfig();
  const [summary, setSummary] = useState<LeagueSummary | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [weekRecap, setWeekRecap] = useState<WeekRecapData | null>(null);
  const [money, setMoney] = useState<LeagueMoney | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    (async () => {
      setSummary(null);
      setWeekRecap(null);
      setMoney(null);
      setError(null);
      try {
        const currentWeek = await getCurrentWeek();
        const s = await getLeagueSummary(leagueId, currentWeek);
        if (cancelled) return;
        if (!s) {
          setError("League not found.");
          return;
        }
        setSummary(s);
        setWeek(currentWeek);
        const recap = await computeWeekRecap(leagueId, currentWeek);
        if (!cancelled) setWeekRecap(recap);
        // Only resolves for leagues with a commissioner profile configured.
        const m = await loadLeagueMoney(leagueId);
        if (!cancelled) setMoney(m);
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const myRow = summary?.standings.find((r) => r.ownerId === config.sleeperUserId) ?? null;
  const carouselGames = useLeagueMatchupCarousel(leagueId, week);

  if (!leagueId) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">No league selected.</Card>;
  }
  if (error) {
    return <Card className="p-12 text-center text-sm text-status-critical">{error}</Card>;
  }
  if (!loaded || !summary) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading league…</Card>;
  }

  const tracked = config.leagues.find((l) => l.leagueId === leagueId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-primary">
            {summary.league.name}
            {tracked?.isCommish ? (
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 shrink-0 text-status-good"
                role="img"
                aria-label="You're the commissioner"
              >
                <title>You&rsquo;re the commissioner</title>
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16Zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {summary.league.season} season · {summary.rosters.length} teams · Week {summary.currentWeek}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tracked?.isCommish ? (
            <Link
              href={`/recap?id=${leagueId}`}
              className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Write recap
            </Link>
          ) : null}
          <Link
            href={`/league/history?id=${leagueId}`}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-page"
          >
            League history
          </Link>
        </div>
      </div>

      {carouselGames && carouselGames.length > 0 ? (
        <Card className="p-5">
          <LeagueMatchupCarousel leagueId={leagueId} games={carouselGames} myRosterId={myRow?.rosterId ?? null} />
        </Card>
      ) : null}

      {money ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-primary">
              Money · {money.profile.label}
            </h2>
            <Link href={`/recap?id=${leagueId}`} className="text-sm font-medium text-series-1 hover:underline">
              Write this week&rsquo;s recap →
            </Link>
          </div>
          <MoneyBoard money={money} />
        </section>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Standings</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="py-2 pr-3 font-medium">Team</th>
                <th className="py-2 pr-3 font-medium text-right">Record</th>
                <th className="py-2 pr-3 font-medium text-right">PF</th>
                <th className="py-2 pr-3 font-medium text-right">PA</th>
              </tr>
            </thead>
            <tbody>
              {summary.standings.map((row) => (
                <tr
                  key={row.rosterId}
                  className={`border-b border-grid last:border-0 ${
                    row.ownerId === config.sleeperUserId ? "bg-series-1/5" : ""
                  }`}
                >
                  <td className="py-2 pr-3 tabular-nums text-ink-secondary">{ordinal(row.rank)}</td>
                  <td className="py-2 pr-3 font-medium text-ink-primary">
                    <Link href={`/team?league=${leagueId}&roster=${row.rosterId}`} className="hover:underline">
                      {row.teamName}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {formatRecord(row.wins, row.losses, row.ties)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {formatPoints(row.pointsFor)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {formatPoints(row.pointsAgainst)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {weekRecap && weekRecap.transactionSummaries.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Recent waiver &amp; trade activity
          </h2>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-secondary">
            {weekRecap.transactionSummaries.map((summary, i) => (
              <li key={i}>{summary}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export default function LeagueDetailPage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <LeagueDetailContent />
    </Suspense>
  );
}
