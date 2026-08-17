import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { getConfig } from "@/lib/store";
import { getLeagueSummary } from "@/lib/league-data";
import { getNFLState } from "@/lib/sleeper";
import { formatPoints, formatRecord, ordinal } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const config = await getConfig();
  const nflState = await getNFLState();
  const currentWeek = nflState?.week ?? 1;

  if (config.leagues.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <h1 className="text-xl font-semibold text-ink-primary">No leagues tracked yet</h1>
        <p className="max-w-md text-sm text-ink-secondary">
          Connect your Sleeper username to pull in every league you play in this season.
        </p>
        <Link
          href="/settings"
          className="mt-2 rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Go to Settings
        </Link>
      </Card>
    );
  }

  const summaries = await Promise.all(
    config.leagues.map(async (tracked) => {
      const summary = await getLeagueSummary(tracked.leagueId, currentWeek);
      return summary ? { tracked, summary } : null;
    })
  );
  const valid = summaries.filter((s): s is NonNullable<typeof s> => s !== null);

  const commishCount = config.leagues.filter((l) => l.isCommish).length;
  const myRows = valid
    .map(({ summary }) => summary.standings.find((r) => r.ownerId === config.sleeperUserId))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  const combinedWins = myRows.reduce((sum, r) => sum + r.wins, 0);
  const combinedLosses = myRows.reduce((sum, r) => sum + r.losses, 0);
  const combinedTies = myRows.reduce((sum, r) => sum + r.ties, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Your leagues</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {config.sleeperUsername ? `Signed in as ${config.sleeperUsername}` : "No Sleeper account linked"} ·
          Week {currentWeek}, {config.season}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Leagues tracked" value={String(config.leagues.length)} />
        <StatTile label="You commish" value={String(commishCount)} />
        <StatTile
          label="Combined record"
          value={myRows.length ? formatRecord(combinedWins, combinedLosses, combinedTies) : "—"}
        />
        <StatTile label="Current week" value={String(currentWeek)} sublabel={nflState?.season_type} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {valid.map(({ tracked, summary }) => {
          const myRow = summary.standings.find((r) => r.ownerId === config.sleeperUserId);
          return (
            <Card key={tracked.leagueId} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/leagues/${tracked.leagueId}`}
                    className="truncate text-lg font-semibold text-ink-primary hover:underline"
                  >
                    {summary.league.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {summary.league.season} season · {summary.rosters.length} teams
                  </div>
                </div>
                {tracked.isCommish ? <Badge tone="good">Commissioner</Badge> : null}
              </div>

              {myRow ? (
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Your record</div>
                    <div className="text-xl font-semibold tabular-nums text-ink-primary">
                      {formatRecord(myRow.wins, myRow.losses, myRow.ties)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Rank</div>
                    <div className="text-xl font-semibold tabular-nums text-ink-primary">
                      {ordinal(myRow.rank)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Points for</div>
                    <div className="text-xl font-semibold tabular-nums text-ink-primary">
                      {formatPoints(myRow.pointsFor)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Your team wasn&rsquo;t found in this league&rsquo;s rosters.</p>
              )}

              <div className="flex gap-3 border-t border-grid pt-3 text-sm">
                <Link href={`/leagues/${tracked.leagueId}`} className="font-medium text-series-1 hover:underline">
                  Standings &amp; matchups
                </Link>
                {tracked.isCommish ? (
                  <Link
                    href={`/leagues/${tracked.leagueId}/recap`}
                    className="font-medium text-series-1 hover:underline"
                  >
                    Weekly recap
                  </Link>
                ) : null}
                <Link href={`/leagues/${tracked.leagueId}/history`} className="font-medium text-series-1 hover:underline">
                  History
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
