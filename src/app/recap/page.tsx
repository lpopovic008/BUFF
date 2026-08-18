"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { computeWeekRecap, WeekRecapData } from "@/lib/league-data";
import {
  formatRecapMarkdown,
  formatCommishRecap,
  formatPreseasonTemplate,
  findWeekTopStarters,
  extractRecapDetails,
} from "@/lib/format-recap";
import { formatBowlResultLine, formatUpcomingBowlBlock, formatUpcomingHonorableBlock } from "@/lib/bowl-narrative";
import { loadLeagueMoney, LeagueMoney } from "@/lib/league-money";
import { summarizeWeek } from "@/lib/payouts";
import { getRecap, getBowlPicks, RecapBowlPicks } from "@/lib/localStore";
import { getRecapWeek, getLeague } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { useLeagueRosterPlayers } from "@/hooks/useLeagueRosterPlayers";
import { RecapEditor } from "./RecapEditor";
import { BowlPicksEditor } from "./BowlPicksEditor";

// week=0 is a sentinel for the preseason write-up — a free-write space that
// exists before there's any real matchup data to auto-generate a recap from.
const PRESEASON_WEEK = 0;

function simplePreseasonTemplate(leagueName: string, season: string): string {
  return [`🚨📋 ${leagueName} — ${season} Preseason`, "", "[Write your season preview here.]", ""].join("\n");
}

interface RecapHeader {
  title: string;
  leagueName: string;
  season: string;
  subtitle: string;
}

function RecapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const leagueId = searchParams.get("id");
  const weekParam = searchParams.get("week");
  const week = weekParam !== null ? Number(weekParam) : null;
  const isPreseason = week === PRESEASON_WEEK;

  const [recapData, setRecapData] = useState<WeekRecapData | null>(null);
  const [header, setHeader] = useState<RecapHeader | null>(null);
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [money, setMoney] = useState<LeagueMoney | null>(null);
  const [upcomingPicks, setUpcomingPicks] = useState<RecapBowlPicks | null>(null);
  const [highScorerNames, setHighScorerNames] = useState<Record<string, string>>({});

  // Feeds the bowl-pick player selects — a league-wide roster dump, loaded lazily
  // (the picker shows "Loading roster…" until ready) and needed for both regular
  // weeks and the Preseason page's own "Upcoming Week 1" picker.
  const playerOptions = useLeagueRosterPlayers(leagueId);

  // No week in the URL yet — resolve which week's write-up should be open and pin it into the URL so the recap is bookmarkable.
  useEffect(() => {
    if (!leagueId || weekParam) return;
    getRecapWeek().then((recapWeek) => {
      router.replace(`/recap?id=${leagueId}&week=${recapWeek}`);
    });
  }, [leagueId, weekParam, router]);

  useEffect(() => {
    if (!leagueId || week === null || !Number.isFinite(week) || week < PRESEASON_WEEK) return;
    let cancelled = false;

    (async () => {
      setRecapData(null);
      setHeader(null);
      setMoney(null);
      setUpcomingPicks(null);
      setHighScorerNames({});
      setError(null);
      try {
        if (week === PRESEASON_WEEK) {
          const league = await getLeague(leagueId);
          if (cancelled || !league) return;
          const leagueMoney = await loadLeagueMoney(leagueId);
          if (cancelled) return;
          setMoney(leagueMoney);
          setHeader({
            title: `${league.name} — Preseason`,
            leagueName: league.name,
            season: league.season,
            subtitle: "Free-write — nothing to auto-generate yet.",
          });

          let fresh: string;
          if (leagueMoney) {
            const upcoming = getBowlPicks(leagueId, league.season, PRESEASON_WEEK + 1);
            setUpcomingPicks(upcoming);
            fresh = formatPreseasonTemplate({
              leagueName: league.name,
              season: league.season,
              upcomingBowlLines: formatUpcomingBowlBlock(upcoming.bowlOfWeek, PRESEASON_WEEK + 1, [], []),
              upcomingHonorableLines: formatUpcomingHonorableBlock(upcoming.honorableBowl, PRESEASON_WEEK + 1, []),
            });
          } else {
            fresh = simplePreseasonTemplate(league.name, league.season);
          }

          const saved = getRecap(leagueId, league.season, PRESEASON_WEEK);
          setBody(saved ? saved.body : fresh);
          setSavedAt(saved ? saved.savedAt : null);
          return;
        }

        const data = await computeWeekRecap(leagueId, week);
        if (cancelled || !data) return;
        setRecapData(data);
        setHeader({
          title: `${data.league.name} — Week ${week} Recap`,
          leagueName: data.league.name,
          season: data.league.season,
          subtitle: "Auto-generated from Sleeper data. Edit freely before copying it out to your group chat.",
        });

        // Commissioner leagues get the house-style recap with the money blocks,
        // last week's bowl-game result, and next week's marquee-matchup preview
        // filled in; everything else falls back to the generic markdown, which
        // has no bowl-game concept.
        const leagueMoney = await loadLeagueMoney(leagueId);
        if (cancelled) return;
        setMoney(leagueMoney);

        let fresh: string;
        if (leagueMoney) {
          // This week's own bowl pick (set on last week's page) resolves against
          // this week's now-final matchups; next week's pick (being set on THIS
          // page, below) previews using standings through this week.
          const resultPick = getBowlPicks(leagueId, data.league.season, week);
          const upcoming = getBowlPicks(leagueId, data.league.season, week + 1);
          setUpcomingPicks(upcoming);

          const summary = summarizeWeek(leagueMoney.ledger, week);
          const leaderIds = summary?.highScorer
            ? findWeekTopStarters(summary.highScorer.rosterId, data.games).map((l) => l.playerId)
            : [];
          const resolved = leaderIds.length > 0 ? await resolvePlayers(leaderIds) : [];
          if (cancelled) return;
          const playerNames: Record<string, string> = {};
          for (const p of resolved) playerNames[p.playerId] = p.name;
          setHighScorerNames(playerNames);

          fresh = formatCommishRecap({
            data,
            ledger: leagueMoney.ledger,
            playerNames,
            bowlResultLine: formatBowlResultLine("👑", resultPick.bowlOfWeek, data.games),
            honorableResultLine: formatBowlResultLine("🏆", resultPick.honorableBowl, data.games),
            upcomingBowlLines: formatUpcomingBowlBlock(upcoming.bowlOfWeek, week + 1, data.games, data.standingsAfter),
            upcomingHonorableLines: formatUpcomingHonorableBlock(upcoming.honorableBowl, week + 1, data.games),
          });
        } else {
          fresh = formatRecapMarkdown(data);
        }

        const saved = getRecap(leagueId, data.league.season, week);
        setBody(saved ? saved.body : fresh);
        setSavedAt(saved ? saved.savedAt : null);
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, week]);

  function handlePicksSaved(picks: RecapBowlPicks) {
    setUpcomingPicks(picks);
    if (!money || !header || !leagueId || week === null) return;

    if (week === PRESEASON_WEEK) {
      setBody((currentBody) =>
        formatPreseasonTemplate({
          leagueName: header.leagueName,
          season: header.season,
          upcomingBowlLines: formatUpcomingBowlBlock(picks.bowlOfWeek, PRESEASON_WEEK + 1, [], []),
          upcomingHonorableLines: formatUpcomingHonorableBlock(picks.honorableBowl, PRESEASON_WEEK + 1, []),
          details: extractRecapDetails(currentBody),
        })
      );
      return;
    }

    if (!recapData) return;
    const resultPick = getBowlPicks(leagueId, header.season, week);
    setBody((currentBody) =>
      formatCommishRecap({
        data: recapData,
        ledger: money.ledger,
        playerNames: highScorerNames,
        bowlResultLine: formatBowlResultLine("👑", resultPick.bowlOfWeek, recapData.games),
        honorableResultLine: formatBowlResultLine("🏆", resultPick.honorableBowl, recapData.games),
        upcomingBowlLines: formatUpcomingBowlBlock(picks.bowlOfWeek, week + 1, recapData.games, recapData.standingsAfter),
        upcomingHonorableLines: formatUpcomingHonorableBlock(picks.honorableBowl, week + 1, recapData.games),
        details: extractRecapDetails(currentBody),
      })
    );
  }

  if (!leagueId) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">No league selected.</Card>;
  }
  if (error) {
    return <Card className="p-12 text-center text-sm text-status-critical">{error}</Card>;
  }
  if (week === null || !header || (!isPreseason && !recapData)) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading recap…</Card>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">{header.title}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{header.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {week > PRESEASON_WEEK + 1 ? (
            <Link
              href={`/recap?id=${leagueId}&week=${week - 1}`}
              className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
            >
              ← Week {week - 1}
            </Link>
          ) : null}
          {week === PRESEASON_WEEK + 1 ? (
            <Link
              href={`/recap?id=${leagueId}&week=${PRESEASON_WEEK}`}
              className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
            >
              ← Preseason
            </Link>
          ) : null}
          <Link
            href={`/recap?id=${leagueId}&week=${week + 1}`}
            className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
          >
            {isPreseason ? "Week 1" : `Week ${week + 1}`} →
          </Link>
          <Link
            href={`/recap/archive?id=${leagueId}`}
            className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
          >
            Archive
          </Link>
        </div>
      </div>

      <Card className="p-5">
        <RecapEditor
          key={`${leagueId}-${week}`}
          leagueId={leagueId}
          season={header.season}
          week={week}
          title={header.title}
          body={body}
          onBodyChange={setBody}
          savedAt={savedAt}
        />
      </Card>

      {money && upcomingPicks ? (
        <Card className="p-5">
          <BowlPicksEditor
            key={`${leagueId}-${week + 1}-picks`}
            leagueId={leagueId}
            season={header.season}
            week={week + 1}
            initialPicks={upcomingPicks}
            playerOptions={playerOptions}
            onSaved={handlePicksSaved}
          />
        </Card>
      ) : null}
    </div>
  );
}

export default function RecapPage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <RecapContent />
    </Suspense>
  );
}
