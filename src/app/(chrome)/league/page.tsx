"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { IconLink } from "@/components/ui/IconButton";
import { DocumentIcon, ClockIcon, WalkieTalkieIcon } from "@/components/ui/Icon";
import { LeagueMatchupCarousel } from "@/components/LeagueMatchupCarousel";
import { MoneyBoard } from "@/components/MoneyBoard";
import { useConfig } from "@/hooks/useConfig";
import { useLeagueMatchupCarousel } from "@/hooks/useLeagueMatchupCarousel";
import { getLeagueSummary, LeagueSummary, summaryAsItStands, teamStandings } from "@/lib/league-data";
import { finishedWeeksOnly, loadLeagueSeason, LeagueSeason, startingPlan } from "@/lib/league-money";
import { useAsItStands, usePendingMatchups } from "@/hooks/useAsItStands";
import { computePlanLedger, PayoutPlan } from "@/lib/payout-plan";
import { savePayoutPlan } from "@/lib/localStore";
import { getCurrentWeek, weighProjection } from "@/lib/sleeper";
import { useLineupDetails } from "@/hooks/useLineupDetails";
import { MatchupGraph, MatchupSide } from "@/components/MatchupGraph";
import { setHeaderWeek } from "@/lib/header-week";
import { TitleWithHistory } from "@/components/HistoryButtons";
import { MyLeagues } from "@/components/MyLeagues";

function LeagueDetailContent() {
  const leagueId = useSearchParams().get("id");
  const { config, loaded } = useConfig();
  const [summary, setSummary] = useState<LeagueSummary | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  // The week the matchups show — the current one until another is picked.
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const shownWeek = viewWeek ?? week;
  const [money, setMoney] = useState<LeagueSeason | null>(null);
  const [plan, setPlan] = useState<PayoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    (async () => {
      setSummary(null);
      setViewWeek(null);
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
        setPlan(startingPlan(leagueId, m));
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

  // "As it stands": the week being played counts as if it ended now — in the
  // payouts, the standings and the head-to-heads. Otherwise only official weeks do.
  const asItStands = useAsItStands();
  const summaries = useMemo(() => (summary ? [summary] : null), [summary]);
  const pending = usePendingMatchups(summaries)?.get(leagueId ?? "") ?? null;
  const shownSummary = useMemo(
    () => (summary && pending ? summaryAsItStands(summary, pending) : summary),
    [summary, pending]
  );
  const shownMoney = useMemo(() => (money && !asItStands ? finishedWeeksOnly(money) : money), [money, asItStands]);

  // The season played through the payout setup.
  const ledger = useMemo(
    () => (shownMoney && plan ? computePlanLedger(plan, shownMoney.results) : null),
    [shownMoney, plan]
  );
  // Each team's rank, record, streak and PF/PA ranks, around its name in the lineups.
  const standings = useMemo(() => (shownSummary ? teamStandings(shownSummary) : new Map()), [shownSummary]);
  // Who owns each roster, for the all-time head-to-head beside each matchup's PF/PA.
  const owners = useMemo(
    () => new Map((summary?.rosters ?? []).filter((r) => r.owner_id).map((r) => [r.roster_id, r.owner_id as string])),
    [summary]
  );

  const myRow = summary?.standings.find((r) => r.ownerId === config.sleeperUserId) ?? null;
  const carousel = useLeagueMatchupCarousel(leagueId, shownWeek);
  // The header's "Week N" picks the week the matchups show.
  const lastWeek = money?.results.lastWeek;
  const regularSeasonWeeks = money?.results.regularSeasonWeeks ?? null;
  useEffect(() => {
    setHeaderWeek(
      week != null && shownWeek != null
        ? { week: shownWeek, currentWeek: week, lastWeek: lastWeek ?? week, regularSeasonWeeks, onChange: setViewWeek }
        : null
    );
  }, [week, shownWeek, lastWeek, regularSeasonWeeks]);
  useEffect(() => () => setHeaderWeek(null), []);

  // The matchup the graph under the lineups follows: the one being looked at
  // (opened on a phone, picked from the list from tablet width up) — yours
  // until another is — drawn whatever its state, every starter's points added
  // up play by play under this league's rules.
  const [shownMatchupId, setShownMatchupId] = useState<{ week: number | null; id: number } | null>(null);
  const season = summary?.league.season ?? null;
  const scoring = summary?.league.scoring_settings;
  const { weekGames, projectionStats, projected, lineTones, lineNotes } = useLineupDetails(carousel, season, shownWeek, scoring);
  const graphed = useMemo(() => {
    const games = carousel?.games ?? [];
    const myRosterId = myRow?.rosterId ?? null;
    const chosen = shownMatchupId && shownMatchupId.week === shownWeek ? games.find((g) => g.matchupId === shownMatchupId.id) : undefined;
    const game = chosen ?? games.find((g) => g.teams.some((t) => t.rosterId === myRosterId)) ?? games[0];
    if (!game) return null;
    const first = game.teams.find((t) => t.rosterId === myRosterId) ?? game.teams[0];
    const second = game.teams.find((t) => t.rosterId !== first.rosterId) ?? null;
    const side = (t: (typeof game.teams)[number]): MatchupSide => ({
      name: t.teamName,
      points: t.points,
      starters: t.slots.flatMap((slot) => {
        const p = slot.player;
        if (!p) return [];
        const projection = projectionStats?.[p.playerId];
        const projected = projection ? weighProjection(projection, scoring) : undefined;
        return [
          {
            playerId: p.playerId,
            name: p.name,
            position: p.position,
            team: p.team,
            points: slot.livePoints,
            projected: typeof projected === "number" ? Math.round(projected * 100) / 100 : null,
          },
        ];
      }),
    });
    return { key: game.matchupId, mine: side(first), theirs: second ? side(second) : null };
  }, [carousel, myRow, shownMatchupId, shownWeek, projectionStats, scoring]);

  if (!leagueId) {
    return <MyLeagues />;
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
            <IconLink href={`/league/history?id=${leagueId}`} icon={<ClockIcon />} label="League history" />
          </>
        }
      >
        {/* The walkie-talkie sits inline after the name, so it follows the name's last word when it wraps. */}
        <h1 className="min-w-0 text-2xl font-semibold text-ink-primary">
          <span>{summary.league.name}</span>
          {tracked?.isCommish ? (
            <WalkieTalkieIcon
              className="ml-2 inline-block h-[1.15em] w-[1.15em] align-[-0.13em] text-status-good"
              role="img"
              aria-label="You're the commissioner"
            />
          ) : null}
        </h1>
      </TitleWithHistory>

      {carousel && carousel.games.length > 0 ? (
        <div className="animate-[rise_0.5s_ease-out_backwards] [animation-delay:80ms]">
          <LeagueMatchupCarousel
            // A fresh carousel per week, so it opens on your matchup again.
            key={shownWeek ?? 0}
            leagueId={leagueId}
            games={carousel.games}
            myRosterId={myRow?.rosterId ?? null}
            standings={standings}
            owners={owners}
            pending={pending}
            onShowMatchup={(id) => setShownMatchupId({ week: shownWeek, id })}
            projected={projected}
            lineTones={lineTones}
            lineNotes={lineNotes}
            dynasty={carousel.dynasty}
            positions={carousel.positions}
            season={season}
            scoring={scoring}
          />
        </div>
      ) : carousel ? (
        <p className="text-sm text-ink-muted">No matchups this week.</p>
      ) : null}

      {/* Under the lineups: the matchup's two totals over the week, always there. */}
      {graphed ? (
        <section aria-label="Points over the week" className="h-[75svh] animate-[rise_0.5s_ease-out_backwards] [animation-delay:120ms] md:h-[min(70svh,40rem)]">
          <MatchupGraph key={`${shownWeek}-${graphed.key}`} mine={graphed.mine} theirs={graphed.theirs} weekGames={weekGames} scoring={scoring} />
        </section>
      ) : null}

      {shownMoney && plan && ledger ? (
        <section className="animate-[rise_0.5s_ease-out_backwards] [animation-delay:150ms]">
          <MoneyBoard season={shownMoney} plan={plan} ledger={ledger} currentWeek={week} onPlanChange={changePlan} />
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
