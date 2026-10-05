"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { IconLink } from "@/components/ui/IconButton";
import { DocumentIcon, ClockIcon, RadarIcon, WalkieTalkieIcon } from "@/components/ui/Icon";
import { LeagueMatchupCarousel } from "@/components/LeagueMatchupCarousel";
import { MoneyBoard } from "@/components/MoneyBoard";
import { useConfig } from "@/hooks/useConfig";
import { useLeagueMatchupCarousel } from "@/hooks/useLeagueMatchupCarousel";
import { getLeagueSummary, LeagueSummary, teamStandings } from "@/lib/league-data";
import { loadLeagueSeason, LeagueSeason } from "@/lib/league-money";
import { computePlanLedger, emptyPlan, PayoutPlan, planFromProfile } from "@/lib/payout-plan";
import { getPayoutPlan, savePayoutPlan } from "@/lib/localStore";
import { getCurrentWeek } from "@/lib/sleeper";
import { TitleWithHistory } from "@/components/HistoryButtons";

function LeagueDetailContent() {
  const leagueId = useSearchParams().get("id");
  const { config, loaded } = useConfig();
  const [summary, setSummary] = useState<LeagueSummary | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [money, setMoney] = useState<LeagueSeason | null>(null);
  const [plan, setPlan] = useState<PayoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    (async () => {
      setSummary(null);
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

  // While the season is still being played, refresh its results every couple
  // of minutes (only while the page is visible), so the week in progress
  // follows live scoring in the money grid.
  const seasonLive = !!money && money.results.finalOrder === null;
  useEffect(() => {
    if (!leagueId || !seasonLive) return;
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const m = await loadLeagueSeason(leagueId).catch(() => null);
      if (m) setMoney(m);
    }, 120_000);
    return () => window.clearInterval(id);
  }, [leagueId, seasonLive]);

  const changePlan = useCallback(
    (next: PayoutPlan) => {
      setPlan(next);
      if (leagueId) savePayoutPlan(leagueId, next);
    },
    [leagueId]
  );

  // The season played through the payout setup.
  const ledger = useMemo(() => (money && plan ? computePlanLedger(plan, money.results) : null), [money, plan]);
  // Each team's rank, record, streak and PF/PA ranks, around its name in the lineups.
  const standings = useMemo(() => (summary ? teamStandings(summary) : new Map()), [summary]);

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
      <TitleWithHistory
        className="animate-[rise_0.5s_ease-out_backwards]"
        actions={
          <>
            {tracked?.isCommish ? (
              <IconLink href={`/recap?id=${leagueId}`} icon={<DocumentIcon />} label="Write recap" variant="primary" />
            ) : null}
            <IconLink href={`/warroom?id=${leagueId}`} icon={<RadarIcon />} label="War Room" />
            <IconLink href={`/league/history?id=${leagueId}`} icon={<ClockIcon />} label="League history" />
          </>
        }
      >
        {/* The walkie-talkie sits inline after the name, so it follows the name's last word when it wraps. */}
        <h1 className="min-w-0 text-2xl font-semibold text-ink-primary">
          <span>{summary.league.name}</span>
          {tracked?.isCommish ? (
            <WalkieTalkieIcon
              className="ml-2 inline-block h-5 w-5 align-[-0.15em] text-status-good"
              role="img"
              aria-label="You're the commissioner"
            />
          ) : null}
        </h1>
      </TitleWithHistory>

      {carousel && carousel.games.length > 0 ? (
        <div className="animate-[rise_0.5s_ease-out_backwards] [animation-delay:80ms]">
          <LeagueMatchupCarousel
            leagueId={leagueId}
            games={carousel.games}
            myRosterId={myRow?.rosterId ?? null}
            standings={standings}
          />
        </div>
      ) : null}

      {money && plan && ledger ? (
        <section className="animate-[rise_0.5s_ease-out_backwards] [animation-delay:150ms]">
          <MoneyBoard season={money} plan={plan} ledger={ledger} currentWeek={week} onPlanChange={changePlan} />
        </section>
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
