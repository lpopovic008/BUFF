"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import {
  computeWeekRecap,
  pairMatchups,
  MatchupGame,
  WeekRecapData,
} from "@/lib/league-data";
import { formatRecapMarkdown, formatCommishRecap } from "@/lib/format-recap";
import { formatBowlPreview, formatBowlResult } from "@/lib/bowl-narrative";
import { loadLeagueMoney, LeagueMoney } from "@/lib/league-money";
import { getRecap, getBowlPicks, RecapBowlPicks } from "@/lib/localStore";
import { getRecapWeek, getLeague, getLeagueRosters, getLeagueUsers, getMatchups } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { useLeagueRosterPlayers } from "@/hooks/useLeagueRosterPlayers";
import { RecapEditor } from "./RecapEditor";
import { BowlPicksEditor } from "./BowlPicksEditor";

// week=0 is a sentinel for the preseason write-up — a free-write space that
// exists before there's any real matchup data to auto-generate a recap from.
const PRESEASON_WEEK = 0;

function preseasonTemplate(leagueName: string, season: string): string {
  return [`🚨🏈 ${leagueName} — ${season} Preseason`, "", "[Write your season preview here.]", ""].join("\n");
}

interface RecapHeader {
  title: string;
  season: string;
  subtitle: string;
}

function bowlPickIds(picks: RecapBowlPicks | null): string[] {
  if (!picks) return [];
  return [...picks.bowlOfWeek.playerIds, ...picks.honorableBowl.playerIds];
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
  const [freshTemplate, setFreshTemplate] = useState<string | null>(null);
  const [bowlRefresh, setBowlRefresh] = useState<string | null>(null);
  const [previousBody, setPreviousBody] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [money, setMoney] = useState<LeagueMoney | null>(null);
  const [thisWeekPicks, setThisWeekPicks] = useState<RecapBowlPicks | null>(null);
  const [previousWeekBowl, setPreviousWeekBowl] = useState<{ pick: RecapBowlPicks; games: MatchupGame[] } | null>(
    null
  );

  // The full-roster options feed the picker UI's dropdowns (lazy is fine there —
  // it shows "Loading roster…" until ready) and, once loaded, back up player-name
  // resolution for later pick saves. The *initial* template generation below
  // resolves names for just the already-picked players directly, so it doesn't
  // have to wait on this broader fetch and can't race it into stomping a saved draft.
  const playerOptions = useLeagueRosterPlayers(!isPreseason ? leagueId : null);
  const rosterPlayerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of playerOptions ?? []) map[p.playerId] = p.name;
    return map;
  }, [playerOptions]);

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
      setFreshTemplate(null);
      setBowlRefresh(null);
      setPreviousBody(null);
      setMoney(null);
      setThisWeekPicks(null);
      setPreviousWeekBowl(null);
      setError(null);
      try {
        if (week === PRESEASON_WEEK) {
          const league = await getLeague(leagueId);
          if (cancelled || !league) return;
          const title = `${league.name} — Preseason`;
          setHeader({ title, season: league.season, subtitle: "Free-write — nothing to auto-generate yet." });
          const fresh = preseasonTemplate(league.name, league.season);
          setFreshTemplate(fresh);
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
          season: data.league.season,
          subtitle: "Auto-generated from Sleeper data. Edit freely before copying it out to your group chat.",
        });

        // Commissioner leagues get the house-style recap with the money blocks
        // and Matchup of the Week narrative filled in; everything else falls
        // back to the generic markdown, which has no bowl-game concept.
        const leagueMoney = await loadLeagueMoney(leagueId);
        if (cancelled) return;
        setMoney(leagueMoney);

        const thisWeek = leagueMoney ? getBowlPicks(leagueId, data.league.season, week) : null;
        setThisWeekPicks(thisWeek);

        let previousBowl: { pick: RecapBowlPicks; games: MatchupGame[] } | null = null;
        if (leagueMoney && week > PRESEASON_WEEK + 1) {
          const previousPick = getBowlPicks(leagueId, data.league.season, week - 1);
          if (previousPick.bowlOfWeek.name.trim() || previousPick.bowlOfWeek.playerIds.length > 0) {
            const [prevRosters, prevUsers, prevMatchups] = await Promise.all([
              getLeagueRosters(leagueId),
              getLeagueUsers(leagueId),
              getMatchups(leagueId, week - 1),
            ]);
            if (cancelled) return;
            previousBowl = { pick: previousPick, games: pairMatchups(prevMatchups, prevRosters, prevUsers) };
          }
        }
        setPreviousWeekBowl(previousBowl);

        let fresh: string;
        if (leagueMoney) {
          // Resolve names for just the players already picked (fast, small) rather
          // than waiting on the full-roster hook above — keeps the first paint
          // correct even if that broader fetch is still in flight.
          const pickedIds = [...bowlPickIds(thisWeek), ...(previousBowl?.pick.bowlOfWeek.playerIds ?? [])];
          const resolved = await resolvePlayers(pickedIds);
          if (cancelled) return;
          const playerNames: Record<string, string> = {};
          for (const p of resolved) playerNames[p.playerId] = p.name;

          fresh = formatCommishRecap({
            data,
            ledger: leagueMoney.ledger,
            profile: leagueMoney.profile,
            matchupResultBlock: formatBowlResult(
              week - 1,
              previousBowl?.pick.bowlOfWeek,
              previousBowl?.games ?? [],
              playerNames
            ),
            bowlOfWeekBlock: formatBowlPreview(
              "🔥 Matchup of the Week",
              week,
              thisWeek?.bowlOfWeek,
              data.games,
              data.standingsBefore,
              playerNames
            ),
            honorableMentionBlock: formatBowlPreview(
              "🥈 Honorable Mention",
              week,
              thisWeek?.honorableBowl,
              data.games,
              data.standingsBefore,
              playerNames
            ),
          });
        } else {
          fresh = formatRecapMarkdown(data);
        }
        setFreshTemplate(fresh);

        if (week > PRESEASON_WEEK + 1) {
          const previous = getRecap(leagueId, data.league.season, week - 1);
          setPreviousBody(previous ? previous.body : null);
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
    setThisWeekPicks(picks);
    if (!recapData || !money || week === null) return;
    const fresh = formatCommishRecap({
      data: recapData,
      ledger: money.ledger,
      profile: money.profile,
      matchupResultBlock: formatBowlResult(
        week - 1,
        previousWeekBowl?.pick.bowlOfWeek,
        previousWeekBowl?.games ?? [],
        rosterPlayerNames
      ),
      bowlOfWeekBlock: formatBowlPreview(
        "🔥 Matchup of the Week",
        week,
        picks.bowlOfWeek,
        recapData.games,
        recapData.standingsBefore,
        rosterPlayerNames
      ),
      honorableMentionBlock: formatBowlPreview(
        "🥈 Honorable Mention",
        week,
        picks.honorableBowl,
        recapData.games,
        recapData.standingsBefore,
        rosterPlayerNames
      ),
    });
    setFreshTemplate(fresh);
    setBowlRefresh(fresh);
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
          initialBody={body}
          savedAt={savedAt}
          freshTemplate={freshTemplate}
          previousBody={previousBody}
          bowlRefresh={bowlRefresh}
        />
      </Card>

      {!isPreseason && money && thisWeekPicks ? (
        <Card className="p-5">
          <BowlPicksEditor
            key={`${leagueId}-${week}-picks`}
            leagueId={leagueId}
            season={header.season}
            week={week}
            initialPicks={thisWeekPicks}
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
