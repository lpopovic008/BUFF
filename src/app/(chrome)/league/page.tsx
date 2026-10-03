"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { IconLink } from "@/components/ui/IconButton";
import { DocumentIcon, ClockIcon, RadarIcon } from "@/components/ui/Icon";
import { LeagueMatchupCarousel } from "@/components/LeagueMatchupCarousel";
import { MoneyBoard } from "@/components/MoneyBoard";
import { useConfig } from "@/hooks/useConfig";
import { useLeagueMatchupCarousel } from "@/hooks/useLeagueMatchupCarousel";
import { getLeagueSummary, computeWeekRecap, LeagueSummary, WeekRecapData } from "@/lib/league-data";
import { loadLeagueSeason, LeagueSeason } from "@/lib/league-money";
import { computePlanLedger, emptyPlan, formatMoney, PayoutPlan, planFromProfile } from "@/lib/payout-plan";
import { getPayoutPlan, savePayoutPlan } from "@/lib/localStore";
import { getCurrentWeek } from "@/lib/sleeper";
import { formatPoints, formatRecord, ordinal } from "@/lib/format";

function LeagueDetailContent() {
  const leagueId = useSearchParams().get("id");
  const { config, loaded } = useConfig();
  const [summary, setSummary] = useState<LeagueSummary | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [weekRecap, setWeekRecap] = useState<WeekRecapData | null>(null);
  const [money, setMoney] = useState<LeagueSeason | null>(null);
  const [plan, setPlan] = useState<PayoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    (async () => {
      setSummary(null);
      setWeekRecap(null);
      setMoney(null);
      setPlan(null);
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
        // The season's results, for the payout setup to be played against. A
        // league starts from its saved setup, else from its hand-configured
        // commissioner rules, else from nothing.
        const m = await loadLeagueSeason(leagueId);
        if (cancelled || !m) return;
        setMoney(m);
        setPlan(getPayoutPlan(leagueId) ?? (m.profile ? planFromProfile(m.profile, m.results.rosterIds) : emptyPlan()));
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const changePlan = useCallback(
    (next: PayoutPlan) => {
      setPlan(next);
      if (leagueId) savePayoutPlan(leagueId, next);
    },
    [leagueId]
  );

  // The season played through the payout setup: the money section and the
  // standings' high-score and earnings columns both read it.
  const ledger = useMemo(() => (money && plan ? computePlanLedger(plan, money.results) : null), [money, plan]);
  const moneyByRoster = new Map(ledger?.managers.map((m) => [m.rosterId, m]) ?? []);
  const showEarned = !!plan && plan.rules.length > 0;

  const myRow = summary?.standings.find((r) => r.ownerId === config.sleeperUserId) ?? null;
  const carousel = useLeagueMatchupCarousel(leagueId, week);

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
      <div className="flex flex-wrap items-start justify-between gap-4 animate-[rise_0.5s_ease-out_backwards]">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-primary">
            <span>{summary.league.name}</span>
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
            <IconLink href={`/recap?id=${leagueId}`} icon={<DocumentIcon />} label="Write recap" variant="primary" />
          ) : null}
          <IconLink href={`/warroom?id=${leagueId}`} icon={<RadarIcon />} label="War Room" />
          <IconLink href={`/league/history?id=${leagueId}`} icon={<ClockIcon />} label="League history" />
        </div>
      </div>

      {carousel && carousel.games.length > 0 ? (
        <div className="animate-[rise_0.5s_ease-out_backwards] [animation-delay:80ms]">
          <LeagueMatchupCarousel
            leagueId={leagueId}
            games={carousel.games}
            valueRankLabel={carousel.valueRankLabel}
            myRosterId={myRow?.rosterId ?? null}
          />
        </div>
      ) : null}

      {money && plan ? (
        <section className="flex flex-col gap-4 animate-[rise_0.5s_ease-out_backwards] [animation-delay:150ms]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-primary">
              Money{money.profile ? ` · ${money.profile.label}` : ""}
            </h2>
            <Link href={`/recap?id=${leagueId}`} className="text-sm font-medium text-series-1 hover:underline">
              Write this week&rsquo;s recap →
            </Link>
          </div>
          {ledger ? <MoneyBoard season={money} plan={plan} ledger={ledger} onPlanChange={changePlan} /> : null}
        </section>
      ) : null}

      <Card className="animate-[rise_0.5s_ease-out_backwards] p-4 sm:p-5 [animation-delay:210ms]">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Standings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-2 sm:pr-3 font-medium">Rank</th>
                <th className="py-2 pr-2 sm:pr-3 font-medium">Team</th>
                <th className="whitespace-nowrap py-2 pr-2 text-right font-medium sm:pr-3">Record</th>
                <th className="whitespace-nowrap py-2 pr-2 text-right font-medium sm:pr-3">PF</th>
                <th className="hidden whitespace-nowrap py-2 pr-2 text-right font-medium sm:table-cell sm:pr-3">PA</th>
                <th className="whitespace-nowrap py-2 pr-2 text-right font-medium sm:pr-3" title="Weeks with the league's highest score">
                  <span className="sm:hidden">Highs</span>
                  <span className="hidden sm:inline">High scores</span>
                </th>
                {showEarned ? <th className="whitespace-nowrap py-2 pr-2 text-right font-medium sm:pr-3">Earned</th> : null}
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
                  <td className="py-2 pr-2 sm:pr-3 tabular-nums text-ink-secondary">{ordinal(row.rank)}</td>
                  <td className="py-2 pr-2 sm:pr-3 font-medium text-ink-primary">
                    <Link href={`/team?league=${leagueId}&roster=${row.rosterId}`} className="hover:underline">
                      {row.teamName}
                    </Link>
                    {moneyByRoster.get(row.rosterId) ? (
                      <div className="text-xs font-normal text-ink-muted">{moneyByRoster.get(row.rosterId)!.name}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2 sm:pr-3 whitespace-nowrap text-right tabular-nums text-ink-secondary">
                    {formatRecord(row.wins, row.losses, row.ties)}
                  </td>
                  <td className="py-2 pr-2 sm:pr-3 whitespace-nowrap text-right tabular-nums text-ink-secondary">
                    {formatPoints(row.pointsFor)}
                  </td>
                  <td className="hidden py-2 pr-2 sm:pr-3 whitespace-nowrap text-right tabular-nums text-ink-secondary sm:table-cell">
                    {formatPoints(row.pointsAgainst)}
                  </td>
                  <td
                    className="py-2 pr-2 sm:pr-3 whitespace-nowrap text-right tabular-nums text-ink-secondary"
                    title={
                      moneyByRoster.get(row.rosterId)?.highScoreWeeks.length
                        ? `Weeks ${moneyByRoster.get(row.rosterId)!.highScoreWeeks.join(", ")}`
                        : undefined
                    }
                  >
                    {(() => {
                      const weeks = moneyByRoster.get(row.rosterId)?.highScoreWeeks ?? [];
                      if (!weeks.length) return "—";
                      return (
                        <>
                          <span className="sm:hidden">{weeks.length}</span>
                          <span className="hidden sm:inline">
                            {weeks.length} <span className="text-ink-muted">(wk {weeks.join(", ")})</span>
                          </span>
                        </>
                      );
                    })()}
                  </td>
                  {showEarned ? (
                    <td className="py-2 pr-2 sm:pr-3 whitespace-nowrap text-right font-semibold tabular-nums text-ink-primary">
                      {formatMoney(moneyByRoster.get(row.rosterId)?.total ?? 0)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {weekRecap && weekRecap.transactionSummaries.length > 0 ? (
        <Card className="animate-[rise_0.5s_ease-out_backwards] p-5 [animation-delay:270ms]">
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
