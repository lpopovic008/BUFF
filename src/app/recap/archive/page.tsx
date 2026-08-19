"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { getLeague, SleeperLeague } from "@/lib/sleeper";
import { listRecaps, SavedRecap } from "@/lib/localStore";

function RecapArchiveContent() {
  const leagueId = useSearchParams().get("id");
  const [league, setLeague] = useState<SleeperLeague | null>(null);
  const [recaps, setRecaps] = useState<SavedRecap[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    (() => {
      setRecaps(listRecaps(leagueId));
      setLoaded(true);
    })();
    getLeague(leagueId).then(setLeague).catch(() => setLeague(null));
  }, [leagueId]);

  if (!leagueId) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">No league selected.</Card>;
  }
  if (!loaded) {
    return <Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>;
  }

  return (
    <div className="flex flex-col gap-6 animate-[rise_0.5s_ease-out_backwards]">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">
          {league?.name ?? "League"} — Recap archive
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Every weekly recap you&rsquo;ve saved for this league, in this browser.
        </p>
      </div>

      <Card className="p-5">
        {recaps.length === 0 ? (
          <p className="text-sm text-ink-secondary">
            No saved recaps yet.{" "}
            <Link href={`/recap?id=${leagueId}`} className="font-medium text-series-1 hover:underline">
              Write this week&rsquo;s recap
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-grid">
            {recaps.map((recap) => (
              <li key={`${recap.season}-${recap.week}`} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <Link
                    href={`/recap?id=${leagueId}&week=${recap.week}`}
                    className="font-medium text-ink-primary hover:underline"
                  >
                    {recap.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {recap.season} · Saved {new Date(recap.savedAt).toLocaleDateString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function RecapArchivePage() {
  return (
    <Suspense fallback={<Card className="p-12 text-center text-sm text-ink-secondary">Loading…</Card>}>
      <RecapArchiveContent />
    </Suspense>
  );
}
