import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { getLeague } from "@/lib/sleeper";
import { listRecaps } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RecapArchivePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const [league, recaps] = await Promise.all([getLeague(leagueId), listRecaps(leagueId)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">
          {league?.name ?? "League"} — Recap archive
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">Every weekly recap you&rsquo;ve saved for this league.</p>
      </div>

      <Card className="p-5">
        {recaps.length === 0 ? (
          <p className="text-sm text-ink-secondary">
            No saved recaps yet.{" "}
            <Link href={`/leagues/${leagueId}/recap`} className="font-medium text-series-1 hover:underline">
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
                    href={`/leagues/${leagueId}/recap/${recap.week}`}
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
