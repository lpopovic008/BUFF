"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { ChevronLeftIcon, ChevronDownIcon } from "@/components/ui/Icon";
import { CareerLeaderboard } from "@/components/CareerLeaderboard";
import { MoneyLineChart } from "@/components/MoneyLineChart";
import { SortHeader } from "@/components/ui/SortHeader";
import { useTableSort } from "@/hooks/useTableSort";
import {
  getLeagueSeasonHistory,
  aggregateCareerStats,
  SeasonRecord,
  StandingsRow,
  ManagerCareerStats,
} from "@/lib/league-data";
import { loadLeagueMoney, LeagueMoney } from "@/lib/league-money";
import { findLeagueProfile, LeagueProfile } from "@/lib/league-config";
import { cumulativeSeriesByManager } from "@/lib/payouts";
import { formatRecord, formatPoints, ordinal } from "@/lib/format";

function SeasonMoney({ leagueId, profile }: { leagueId: string; profile: LeagueProfile }) {
  const [money, setMoney] = useState<LeagueMoney | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadLeagueMoney(leagueId, profile).then((m) => {
      if (!cancelled) setMoney(m);
    });
    return () => {
      cancelled = true;
    };
  }, [leagueId, profile]);

  if (money === undefined) {
    return <p className="text-sm text-ink-muted">Loading money data…</p>;
  }
  if (!money || money.ledger.weeksPlayed.length === 0) {
    return null;
  }

  const series = cumulativeSeriesByManager(money.ledger);

  return (
    <div className="flex flex-col gap-4 border-t border-grid pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Money paid out
        </h4>
        <span className="text-xs text-ink-secondary">
          ${money.ledger.paidToDate} through week {money.ledger.weeksPlayed.at(-1)}
        </span>
      </div>
      <MoneyLineChart series={series} />
      <MoneyTable managers={money.ledger.managers} />
    </div>
  );
}

type MoneyManager = LeagueMoney["ledger"]["managers"][number];

const MONEY_COLUMNS = {
  manager: (m: MoneyManager) => m.name,
  wins: (m: MoneyManager) => m.wins,
  highScoreWeeks: (m: MoneyManager) => m.highScoreWeeks.length,
  earned: (m: MoneyManager) => m.total,
};

function MoneyTable({ managers }: { managers: MoneyManager[] }) {
  const { sorted, sortState, toggleSort } = useTableSort(managers, MONEY_COLUMNS);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-grid text-xs uppercase tracking-wide text-ink-muted">
            <SortHeader sortKey="manager" state={sortState} onSort={toggleSort}>
              Manager
            </SortHeader>
            <SortHeader sortKey="wins" state={sortState} onSort={toggleSort} align="right">
              Wins
            </SortHeader>
            <SortHeader sortKey="highScoreWeeks" state={sortState} onSort={toggleSort} align="right">
              High-score weeks
            </SortHeader>
            <SortHeader sortKey="earned" state={sortState} onSort={toggleSort} align="right">
              Earned
            </SortHeader>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.rosterId} className="border-b border-grid last:border-0">
              <td className="py-2 pr-3 font-medium text-ink-primary">{m.name}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">{m.wins}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                {m.highScoreWeeks.length}
              </td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink-primary">
                ${m.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STANDINGS_COLUMNS = {
  rank: (row: StandingsRow) => row.rank,
  team: (row: StandingsRow) => row.teamName,
  record: (row: StandingsRow) => {
    const games = row.wins + row.losses + row.ties;
    return games ? (row.wins + row.ties * 0.5) / games : 0;
  },
  pointsFor: (row: StandingsRow) => row.pointsFor,
  pointsAgainst: (row: StandingsRow) => row.pointsAgainst,
};

function StandingsTable({ season }: { season: SeasonRecord }) {
  const { sorted, sortState, toggleSort } = useTableSort(season.standings, STANDINGS_COLUMNS);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-grid text-xs uppercase tracking-wide text-ink-muted">
            <SortHeader sortKey="rank" state={sortState} onSort={toggleSort}>
              {season.complete ? "Finish" : "Standing"}
            </SortHeader>
            <SortHeader sortKey="team" state={sortState} onSort={toggleSort}>
              Team
            </SortHeader>
            <SortHeader sortKey="record" state={sortState} onSort={toggleSort} align="right">
              Record
            </SortHeader>
            <SortHeader sortKey="pointsFor" state={sortState} onSort={toggleSort} align="right">
              PF
            </SortHeader>
            <SortHeader sortKey="pointsAgainst" state={sortState} onSort={toggleSort} align="right">
              PA
            </SortHeader>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.rosterId} className="border-b border-grid last:border-0">
              <td className="py-2 pr-3 tabular-nums text-ink-secondary">
                {season.hasResults ? ordinal(row.rank) : "—"}
              </td>
              <td className="py-2 pr-3 font-medium text-ink-primary">
                <Link href={`/team?league=${season.leagueId}&roster=${row.rosterId}`} className="hover:underline">
                  {row.teamName}
                </Link>
                {season.champion?.rosterId === row.rosterId ? (
                  <span className="ml-2 text-xs text-status-good">Champion</span>
                ) : season.runnerUp?.rosterId === row.rosterId ? (
                  <span className="ml-2 text-xs text-ink-muted">Runner-up</span>
                ) : null}
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
  );
}

function SeasonAccordion({
  season,
  profile,
  defaultOpen,
}: {
  season: SeasonRecord;
  profile: LeagueProfile | null;
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group border border-border bg-surface-raised open:pb-5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold text-ink-primary">{season.season}</span>
          <span className="text-sm text-ink-secondary">{season.leagueName}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-ink-secondary">
          {season.champion ? (
            <span>
              🏆 <span className="font-medium text-ink-primary">{season.champion.teamName}</span>
            </span>
          ) : (
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              {season.hasResults ? "In progress" : "Not started"}
            </span>
          )}
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="flex flex-col gap-4 px-5">
        <StandingsTable season={season} />

        {profile ? <SeasonMoney leagueId={season.leagueId} profile={profile} /> : null}
      </div>
    </details>
  );
}

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
  // Determined once from whichever season's name matches, then applied to every
  // linked season — a league can get renamed year to year but stays the same
  // pot and the same rules.
  const profile = seasons.map((s) => findLeagueProfile(s.leagueName)).find((p) => p !== null) ?? null;

  return (
    <div className="flex flex-col gap-8 animate-[rise_0.5s_ease-out_backwards]">
      <div>
        <Link
          href={`/league?id=${leagueId}`}
          className="flex items-center gap-1 text-sm font-medium text-series-1 hover:underline"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Back to league
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

      <div className="flex flex-col gap-3">
        {seasons.map((season, i) => (
          <SeasonAccordion key={season.leagueId} season={season} profile={profile} defaultOpen={i === 0} />
        ))}
      </div>

      <p className="text-xs text-ink-muted">
        Finishes come from the games that were actually played: the playoff bracket settles the top
        of the table and the consolation bracket settles the rest, so a team&rsquo;s finish is where
        it played its way to, not where its regular-season record seeded it. A season still being
        played shows live standings instead, and doesn&rsquo;t count toward best finish or
        championships until it&rsquo;s decided.
      </p>
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
