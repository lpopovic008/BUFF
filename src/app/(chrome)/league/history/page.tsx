"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
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
import { finishedWeeksOnly, loadLeagueSeason, LeagueSeason, startingPlan } from "@/lib/league-money";
import { computePlanLedger, formatMoney, PayoutPlan, PlanLedger } from "@/lib/payout-plan";
import { savePayoutPlan } from "@/lib/localStore";
import { PayoutSetup } from "@/components/PayoutSetup";
import { findLeagueProfile, LeagueProfile } from "@/lib/league-config";
import { cumulativeSeriesByManager } from "@/lib/payouts";
import { formatRecord, formatPoints, ordinal } from "@/lib/format";
import { TitleWithHistory } from "@/components/HistoryButtons";
import { PlateCard } from "@/components/ui/PlateCard";
import { PickButton } from "@/components/ui/PickButton";
import { useAsItStands } from "@/hooks/useAsItStands";
import { getCurrentWeek } from "@/lib/sleeper";

/**
 * A season's payouts: its results played through its payout rules — the ones
 * saved for that season, else its league's commissioner rules, else none yet
 * (see startingPlan) — with the week being played paid only "as it stands".
 * Editing the rules saves them for that season alone.
 */
function useSeasonPayouts(leagueId: string, fallback: LeagueProfile | null) {
  const [season, setSeason] = useState<LeagueSeason | null | undefined>(undefined);
  const [plan, setPlan] = useState<PayoutPlan | null>(null);
  const asItStands = useAsItStands();

  useEffect(() => {
    let cancelled = false;
    loadLeagueSeason(leagueId)
      .then((m) => {
        if (cancelled) return;
        setSeason(m);
        setPlan(m ? startingPlan(leagueId, m, fallback) : null);
      })
      .catch(() => {
        if (!cancelled) setSeason(null);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, fallback]);

  const shown = useMemo(
    () => (season && !asItStands ? finishedWeeksOnly(season) : season),
    [season, asItStands]
  );
  const ledger = useMemo(() => (shown && plan ? computePlanLedger(plan, shown.results) : null), [shown, plan]);
  const changePlan = useCallback(
    (next: PayoutPlan) => {
      setPlan(next);
      savePayoutPlan(leagueId, next);
    },
    [leagueId]
  );
  return { season: shown, plan, ledger, changePlan };
}

/** Money paid out over the season, and the button to edit the rules that pay it. */
function SeasonMoney({
  season,
  plan,
  ledger,
  onPlanChange,
}: {
  season: LeagueSeason;
  plan: PayoutPlan;
  ledger: PlanLedger;
  onPlanChange: (plan: PayoutPlan) => void;
}) {
  const [editing, setEditing] = useState(false);
  const paid = plan.rules.length > 0 && ledger.weeksPlayed.length > 0;
  return (
    <div className="flex flex-col gap-4 border-t border-grid pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Money paid out</h4>
        {paid ? (
          <span className="text-xs text-ink-secondary">
            {formatMoney(ledger.paidToDate)}{" "}
            {ledger.managers.some((m) => m.seasonEnd > 0) ? "for the season" : `through week ${ledger.weeksPlayed.at(-1)}`}
          </span>
        ) : null}
      </div>
      {paid ? (
        <MoneyLineChart series={cumulativeSeriesByManager(ledger)} lastWeek={season.results.lastWeek} />
      ) : (
        <p className="text-sm text-ink-muted">No payout rules for this season yet.</p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
          className="bg-[var(--map-tag)] px-3 py-1.5 text-sm font-semibold text-[var(--map-tag-ink)] hover:opacity-90"
        >
          {editing ? "Done editing" : "Edit rules"}
        </button>
      </div>
      {editing ? (
        <div className="border-t border-grid pt-4">
          <PayoutSetup plan={plan} season={season.results} ledger={ledger} onChange={onPlanChange} embedded />
        </div>
      ) : null}
    </div>
  );
}

/** A finish, the top three on the theme's tag plate. */
function FinishBadge({ rank, podium }: { rank: number; podium: boolean }) {
  if (!podium || rank > 3) return <>{ordinal(rank)}</>;
  return <span className="bg-[var(--map-tag)] px-1.5 font-bold text-[var(--map-tag-ink)]">{ordinal(rank)}</span>;
}

/** A column name, cut short on a phone (the full one as its tooltip there) so the table fits. */
function ShortLabel({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span className="sm:hidden" title={full}>
        {short}
      </span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}

/** A standings row, with the team's money for the season when the league has some. */
type SeasonRow = StandingsRow & { highScoreWeeks?: number; earned?: number };

const STANDINGS_COLUMNS = {
  rank: (row: SeasonRow) => row.rank,
  team: (row: SeasonRow) => row.teamName,
  record: (row: SeasonRow) => {
    const games = row.wins + row.losses + row.ties;
    return games ? (row.wins + row.ties * 0.5) / games : 0;
  },
  pointsFor: (row: SeasonRow) => row.pointsFor,
  pointsAgainst: (row: SeasonRow) => row.pointsAgainst,
  highScoreWeeks: (row: SeasonRow) => row.highScoreWeeks ?? 0,
  earned: (row: SeasonRow) => row.earned ?? 0,
};

function StandingsTable({ season, money }: { season: SeasonRecord; money: PlanLedger | null }) {
  const rows = useMemo<SeasonRow[]>(() => {
    if (!money) return season.standings;
    const byRoster = new Map(money.managers.map((m) => [m.rosterId, m]));
    return season.standings.map((row) => {
      const m = byRoster.get(row.rosterId);
      return { ...row, highScoreWeeks: m?.highScoreWeeks.length ?? 0, earned: m?.total ?? 0 };
    });
  }, [season.standings, money]);
  const { sorted, sortState, toggleSort } = useTableSort(rows, STANDINGS_COLUMNS);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-grid text-xs uppercase tracking-wide text-ink-muted">
            <SortHeader sortKey="rank" state={sortState} onSort={toggleSort}>
              <ShortLabel short="#" full={season.complete ? "Finish" : "Standing"} />
            </SortHeader>
            <SortHeader sortKey="team" state={sortState} onSort={toggleSort}>
              Team
            </SortHeader>
            <SortHeader sortKey="record" state={sortState} onSort={toggleSort} align="right">
              <ShortLabel short="W-L" full="Record" />
            </SortHeader>
            <SortHeader sortKey="pointsFor" state={sortState} onSort={toggleSort} align="right">
              PF
            </SortHeader>
            <SortHeader sortKey="pointsAgainst" state={sortState} onSort={toggleSort} align="right">
              PA
            </SortHeader>
            {money ? (
              <>
                <SortHeader sortKey="highScoreWeeks" state={sortState} onSort={toggleSort} align="right">
                  <ShortLabel short="Hi" full="High-score weeks" />
                </SortHeader>
                <SortHeader sortKey="earned" state={sortState} onSort={toggleSort} align="right">
                  <ShortLabel short="$" full="Earned" />
                </SortHeader>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.rosterId} className="border-b border-grid last:border-0">
              <td className="py-2 pr-2 sm:pr-3 tabular-nums text-ink-secondary">
                {season.hasResults ? <FinishBadge rank={row.rank} podium={season.complete} /> : "—"}
              </td>
              <td className="py-2 pr-2 sm:pr-3 font-medium text-ink-primary">
                <Link href={`/team?league=${season.leagueId}&roster=${row.rosterId}`} className="hover:underline">
                  {row.teamName}
                </Link>
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
              {money ? (
                <>
                  <td className="whitespace-nowrap py-2 pr-2 text-right sm:pr-3 tabular-nums text-ink-secondary">
                    {row.highScoreWeeks}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 text-right sm:pr-3 font-semibold tabular-nums text-ink-primary">
                    {formatMoney(row.earned ?? 0)}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A season's results: its final (or live) standings, each team's money beside it, then the money over time. */
function SeasonDetail({ season, profile }: { season: SeasonRecord; profile: LeagueProfile | null }) {
  const payouts = useSeasonPayouts(season.leagueId, profile);
  // Each team's money goes in the standings once the season has rules paying any.
  const money = payouts.plan && payouts.plan.rules.length > 0 ? payouts.ledger : null;
  return (
    <PlateCard
      title={`${season.season} · ${season.leagueName}`}
      aside={season.champion ? <span className="block max-w-[12rem] truncate normal-case">🏆 {season.champion.teamName}</span> : null}
    >
      <div className="flex flex-col gap-4">
        <StandingsTable season={season} money={money} />
        {payouts.season === undefined ? <p className="text-sm text-ink-muted">Loading money data…</p> : null}
        {payouts.season && payouts.plan && payouts.ledger ? (
          <SeasonMoney
            season={payouts.season}
            plan={payouts.plan}
            ledger={payouts.ledger}
            onPlanChange={payouts.changePlan}
          />
        ) : null}
      </div>
    </PlateCard>
  );
}


const ALL_TIME = "all-time";

function LeagueHistoryContent() {
  const leagueId = useSearchParams().get("id");
  const [seasons, setSeasons] = useState<SeasonRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // All-time, or a season by league id — All-time to start.
  const [pickedId, setPickedId] = useState<string>(ALL_TIME);
  const asItStands = useAsItStands();

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    (() => {
      setSeasons(null);
      setError(null);
    })();
    // "As it stands", the season being played counts its unfinished week too.
    const history = asItStands
      ? getCurrentWeek().then((currentWeek) => getLeagueSeasonHistory(leagueId, { currentWeek }))
      : getLeagueSeasonHistory(leagueId);
    history
      .then((result) => {
        if (!cancelled) setSeasons(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, asItStands]);

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
      <TitleWithHistory>
        <h1 className="text-2xl font-semibold text-ink-primary">League history</h1>
      </TitleWithHistory>

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
            <PickButton
              active={picked === null}
              onClick={() => setPickedId(ALL_TIME)}
              title="All-time"
              note={`${seasons.length} season${seasons.length === 1 ? "" : "s"} · ${span}`}
            />
          </li>
          {seasons.map((season) => (
            <li key={season.leagueId}>
              <PickButton
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
