"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { ChevronLeftIcon } from "@/components/ui/Icon";
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
import { TitleWithHistory } from "@/components/HistoryButtons";
import { PlateCard } from "@/components/ui/PlateCard";

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
      <table className="w-full text-xs sm:text-sm">
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
              <td className="py-2 pr-2 sm:pr-3 font-medium text-ink-primary">{m.name}</td>
              <td className="whitespace-nowrap py-2 pr-2 text-right sm:pr-3 tabular-nums text-ink-secondary">{m.wins}</td>
              <td className="whitespace-nowrap py-2 pr-2 text-right sm:pr-3 tabular-nums text-ink-secondary">
                {m.highScoreWeeks.length}
              </td>
              <td className="whitespace-nowrap py-2 pr-2 text-right sm:pr-3 font-semibold tabular-nums text-ink-primary">
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
      <table className="w-full text-xs sm:text-sm">
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
              <td className="py-2 pr-2 sm:pr-3 tabular-nums text-ink-secondary">
                {season.hasResults ? ordinal(row.rank) : "—"}
              </td>
              <td className="py-2 pr-2 sm:pr-3 font-medium text-ink-primary">
                <Link href={`/team?league=${season.leagueId}&roster=${row.rosterId}`} className="hover:underline">
                  {row.teamName}
                </Link>
                {season.champion?.rosterId === row.rosterId ? (
                  <span className="ml-2 text-xs text-status-good">Champion</span>
                ) : season.runnerUp?.rosterId === row.rosterId ? (
                  <span className="ml-2 text-xs text-ink-muted">Runner-up</span>
                ) : null}
              </td>
              <td className="whitespace-nowrap py-2 pr-2 text-right sm:pr-3 tabular-nums text-ink-secondary">
                {formatRecord(row.wins, row.losses, row.ties)}
              </td>
              <td className="whitespace-nowrap py-2 pr-2 text-right sm:pr-3 tabular-nums text-ink-secondary">
                {formatPoints(row.pointsFor)}
              </td>
              <td className="whitespace-nowrap py-2 pr-2 text-right sm:pr-3 tabular-nums text-ink-secondary">
                {formatPoints(row.pointsAgainst)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A season's results: its final (or live) standings, then the money it paid out. */
function SeasonDetail({ season, profile }: { season: SeasonRecord; profile: LeagueProfile | null }) {
  return (
    <PlateCard
      title={`${season.season} · ${season.leagueName}`}
      aside={season.champion ? <span className="block max-w-[12rem] truncate normal-case">🏆 {season.champion.teamName}</span> : null}
    >
      <div className="flex flex-col gap-4">
        <StandingsTable season={season} />
        {profile ? <SeasonMoney leagueId={season.leagueId} profile={profile} /> : null}
      </div>
    </PlateCard>
  );
}

/** One pick in the history list: All-time, or a season. */
function HistoryPick({
  active,
  onClick,
  title,
  subtitle,
  note,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  note: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active || undefined}
      onClick={onClick}
      className={`flex w-full flex-col gap-0.5 border px-3 py-2 text-left transition-colors ${
        active ? "border-ink-primary bg-[color-mix(in_srgb,var(--map-tag)_7%,transparent)]" : "border-border hover:border-ink-primary/40"
      }`}
    >
      <span className="flex items-baseline gap-2">
        <span className="font-semibold text-ink-primary">{title}</span>
        {subtitle ? <span className="min-w-0 truncate text-sm text-ink-secondary">{subtitle}</span> : null}
      </span>
      <span className="min-w-0 truncate text-sm text-ink-secondary">{note}</span>
    </button>
  );
}

const ALL_TIME = "all-time";

function LeagueHistoryContent() {
  const leagueId = useSearchParams().get("id");
  const [seasons, setSeasons] = useState<SeasonRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // All-time, or a season by league id — All-time to start.
  const [pickedId, setPickedId] = useState<string>(ALL_TIME);

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

  const picked = seasons.find((s) => s.leagueId === pickedId) ?? null;
  const years = seasons.map((s) => s.season);
  const span = years.length > 1 ? `${years.at(-1)}–${years[0]}` : years[0];

  return (
    <div className="flex flex-col gap-6 animate-[rise_0.5s_ease-out_backwards]">
      <div>
        <Link
          href={`/league?id=${leagueId}`}
          className="flex items-center gap-1 text-sm font-medium text-series-1 hover:underline"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Back to league
        </Link>
        <TitleWithHistory className="mt-1">
          <h1 className="text-2xl font-semibold text-ink-primary">League history</h1>
        </TitleWithHistory>
      </div>

      {/* The pick's stats on the left (70%), All-time and every season listed on the right (30%,
          never narrower than 16rem). On a phone the list comes first, the stats under it. */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,7fr)_minmax(16rem,3fr)]">
        <div className="order-2 min-w-0 md:order-1">
          {picked ? (
            <SeasonDetail key={picked.leagueId} season={picked} profile={profile} />
          ) : (
            <PlateCard title="All-time">
              <CareerLeaderboard managers={managers} />
            </PlateCard>
          )}
        </div>
        <ul className="order-1 flex flex-col gap-2 md:order-2" aria-label="All-time and each season">
          <li>
            <HistoryPick
              active={picked === null}
              onClick={() => setPickedId(ALL_TIME)}
              title="All-time"
              note={`${seasons.length} season${seasons.length === 1 ? "" : "s"} · ${span}`}
            />
          </li>
          {seasons.map((season) => (
            <li key={season.leagueId}>
              <HistoryPick
                active={picked?.leagueId === season.leagueId}
                onClick={() => setPickedId(season.leagueId)}
                title={season.season}
                subtitle={season.leagueName}
                note={
                  season.champion ? (
                    <>
                      🏆 <span className="font-medium text-ink-primary">{season.champion.teamName}</span>
                    </>
                  ) : season.hasResults ? (
                    "In progress"
                  ) : (
                    "Not started"
                  )
                }
              />
            </li>
          ))}
        </ul>
      </div>
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
