"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { computeWeekRecap, WeekRecapData } from "@/lib/league-data";
import { formatRecapMarkdown, formatCommishRecap } from "@/lib/format-recap";
import { loadLeagueMoney } from "@/lib/league-money";
import { getRecap } from "@/lib/localStore";
import { getRecapWeek, getLeague } from "@/lib/sleeper";
import { RecapEditor } from "./RecapEditor";

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
  const [previousBody, setPreviousBody] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setPreviousBody(null);
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
        // filled in; everything else falls back to the generic markdown. Always
        // computed (even if there's already a saved draft) so "Load last week's
        // template" has this week's fresh standings/money to merge into.
        const money = await loadLeagueMoney(leagueId);
        if (cancelled) return;
        const fresh = money
          ? formatCommishRecap({ data, ledger: money.ledger, profile: money.profile })
          : formatRecapMarkdown(data);
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
        />
      </Card>
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
