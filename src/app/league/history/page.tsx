"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { CareerLeaderboard } from "@/components/CareerLeaderboard";
import { getLeagueSeasonHistory, aggregateCareerStats, SeasonRecord, ManagerCareerStats } from "@/lib/league-data";
import { formatRecord, ordinal } from "@/lib/format";

function LeagueHistoryContent() {
  const leagueId = useSearchParams().get("id");
  const [seasons, setSeasons] = useState<SeasonRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    (() => {
      setSeasons(null);
      setError(null);
    })();
    getLeagueSeasonHistory(leagueId)
      .then((result) => {
        if (!cancelled) setSeasons(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  if (!leagueId) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">No league selected.</Card>;
  }
  if (error) {
    return <Card className="p-12 text-center text-sm text-status-critical">{error}</Card>;
  }
  if (seasons === null) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading history…</Card>;
  }
  if (seasons.length === 0) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">No season history found.</Card>;
  }

  const managers: ManagerCareerStats[] = aggregateCareerStats(seasons);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/league?id=${leagueId}`} className="text-sm font-medium text-series-1 hover:underline">
          ← Back to league
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ink-primary">League history</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {seasons.length} linked season{seasons.length === 1 ? "" : "s"} of data pulled directly from Sleeper.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">All-time leaderboard</h2>
        <CareerLeaderboard managers={managers} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Season by season</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3 font-medium">Season</th>
                <th className="py-2 pr-3 font-medium">Champion</th>
                <th className="py-2 pr-3 font-medium">Runner-up</th>
                <th className="py-2 pr-3 font-medium text-right">Teams</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.leagueId} className="border-b border-grid last:border-0">
                  <td className="py-2 pr-3 font-medium text-ink-primary">{s.season}</td>
                  <td className="py-2 pr-3 text-ink-secondary">
                    {s.champion
                      ? `${s.champion.teamName} (${formatRecord(s.champion.wins, s.champion.losses, s.champion.ties)})`
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 text-ink-secondary">{s.runnerUp ? s.runnerUp.teamName : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">{s.standings.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Champion/runner-up come from the playoff bracket&rsquo;s championship match. Rank shown elsewhere reflects
          regular-season record (wins, then points for) and may not match the exact tiebreakers your league uses.
        </p>
      </Card>

      {managers.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Manager finishes</h2>
          <div className="flex flex-col gap-4">
            {managers.map((m) => (
              <div key={m.userId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-40 shrink-0 font-medium text-ink-primary">{m.displayName}</span>
                {m.seasons
                  .slice()
                  .reverse()
                  .map((s) => (
                    <span
                      key={s.season}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        s.champion
                          ? "border-status-good/30 bg-status-good/10 text-status-good"
                          : "border-border text-ink-secondary"
                      }`}
                      title={`${s.season}: ${s.record}`}
                    >
                      {s.season} · {ordinal(s.rank)}
                    </span>
                  ))}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default function LeagueHistoryPage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <LeagueHistoryContent />
    </Suspense>
  );
}
