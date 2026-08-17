import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { computeWeekRecap } from "@/lib/league-data";
import { formatRecapMarkdown } from "@/lib/format-recap";
import { getRecap } from "@/lib/store";
import { RecapEditor } from "./RecapEditor";

export const dynamic = "force-dynamic";

export default async function RecapWeekPage({
  params,
}: {
  params: Promise<{ leagueId: string; week: string }>;
}) {
  const { leagueId, week: weekParam } = await params;
  const week = Number(weekParam);
  if (!Number.isFinite(week) || week < 1) notFound();

  const recapData = await computeWeekRecap(leagueId, week);
  if (!recapData) notFound();

  const title = `${recapData.league.name} — Week ${week} Recap`;
  const saved = await getRecap(leagueId, recapData.league.season, week);
  const body = saved?.body ?? formatRecapMarkdown(recapData);

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
              href={`/leagues/${leagueId}/recap/${week - 1}`}
              className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
            >
              ← Week {week - 1}
            </Link>
          ) : null}
          <Link
            href={`/leagues/${leagueId}/recap/${week + 1}`}
            className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
          >
            Week {week + 1} →
          </Link>
          <Link
            href={`/leagues/${leagueId}/recaps`}
            className="rounded-md border border-border px-3 py-1.5 font-medium text-ink-secondary hover:bg-page"
          >
            Archive
          </Link>
        </div>
      </div>

      <Card className="p-5">
        <RecapEditor
          leagueId={leagueId}
          season={recapData.league.season}
          week={week}
          title={title}
          initialBody={body}
          savedAt={saved?.savedAt ?? null}
        />
      </Card>
    </div>
  );
}
