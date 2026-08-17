"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { computeWeekRecap, WeekRecapData } from "@/lib/league-data";
import { formatRecapMarkdown, formatCommishRecap } from "@/lib/format-recap";
import { loadLeagueMoney } from "@/lib/league-money";
import { getRecap } from "@/lib/localStore";
import { getCurrentWeek } from "@/lib/sleeper";
import { RecapEditor } from "./RecapEditor";

function RecapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const leagueId = searchParams.get("id");
  const weekParam = searchParams.get("week");

  const [recapData, setRecapData] = useState<WeekRecapData | null>(null);
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No week in the URL yet — resolve the current NFL week and pin it into the URL so the recap is bookmarkable.
  useEffect(() => {
    if (!leagueId || weekParam) return;
    getCurrentWeek().then((week) => {
      router.replace(`/recap?id=${leagueId}&week=${week}`);
    });
  }, [leagueId, weekParam, router]);

  useEffect(() => {
    if (!leagueId || !weekParam) return;
    const week = Number(weekParam);
    if (!Number.isFinite(week) || week < 1) return;
    let cancelled = false;
    (() => {
      setRecapData(null);
      setError(null);
    })();
    (async () => {
      try {
        const data = await computeWeekRecap(leagueId, week);
        if (cancelled || !data) return;
        setRecapData(data);

        const saved = getRecap(leagueId, data.league.season, week);
        if (saved) {
          setBody(saved.body);
          setSavedAt(saved.savedAt);
          return;
        }

        // Commissioner leagues get the house-style recap with the money blocks
        // filled in; everything else falls back to the generic markdown.
        const money = await loadLeagueMoney(leagueId);
        if (cancelled) return;
        setBody(
          money
            ? formatCommishRecap({ data, ledger: money.ledger, profile: money.profile })
            : formatRecapMarkdown(data)
        );
        setSavedAt(null);
      } catch {
        if (!cancelled) setError("Couldn't reach Sleeper's API. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, weekParam]);

  if (!leagueId) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">No league selected.</Card>;
  }
  if (error) {
    return <Card className="p-12 text-center text-sm text-status-critical">{error}</Card>;
  }
  if (!weekParam || !recapData) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading recap…</Card>;
  }

  const week = recapData.week;
  const title = `${recapData.league.name} — Week ${week} Recap`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">{title}</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Auto-generated from Sleeper data. Edit freely before copying it out to your group chat.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {week > 1 ? (
            <Link
              href={`/recap?id=${leagueId}&week=${week - 1}`}
              className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
            >
              ← Week {week - 1}
            </Link>
          ) : null}
          <Link
            href={`/recap?id=${leagueId}&week=${week + 1}`}
            className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
          >
            Week {week + 1} →
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
          season={recapData.league.season}
          week={week}
          title={title}
          initialBody={body}
          savedAt={savedAt}
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
