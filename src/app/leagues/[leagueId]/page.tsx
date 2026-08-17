import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MatchupCard } from "@/components/MatchupCard";
import { getConfig } from "@/lib/store";
import { getLeagueSummary, computeWeekRecap } from "@/lib/league-data";
import { getNFLState } from "@/lib/sleeper";
import { formatPoints, formatRecord, ordinal } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const [config, nflState] = await Promise.all([getConfig(), getNFLState()]);
  const currentWeek = nflState?.week ?? 1;

  const summary = await getLeagueSummary(leagueId, currentWeek);
  if (!summary) notFound();

  const tracked = config.leagues.find((l) => l.leagueId === leagueId);
  const weekRecap = currentWeek >= 1 ? await computeWeekRecap(leagueId, currentWeek) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">{summary.league.name}</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {summary.league.season} season · {summary.rosters.length} teams · Week {currentWeek}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tracked?.isCommish ? <Badge tone="good">Commissioner</Badge> : null}
          {tracked?.isCommish ? (
            <Link
              href={`/leagues/${leagueId}/recap`}
              className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Write weekly recap
            </Link>
          ) : null}
          <Link
            href={`/leagues/${leagueId}/history`}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-page"
          >
            League history
          </Link>
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Standings</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-grid text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="py-2 pr-3 font-medium">Team</th>
                <th className="py-2 pr-3 font-medium text-right">Record</th>
                <th className="py-2 pr-3 font-medium text-right">PF</th>
                <th className="py-2 pr-3 font-medium text-right">PA</th>
              </tr>
            </thead>
            <tbody>
              {summary.standings.map((row) => (
                <tr
                  key={row.rosterId}
                  className={`border-b border-grid last:border-0 ${
                    row.ownerId === config.sleeperUserId ? "bg-series-1/5" : ""
                  }`}
                >
                  <td className="py-2 pr-3 tabular-nums text-ink-secondary">{ordinal(row.rank)}</td>
                  <td className="py-2 pr-3 font-medium text-ink-primary">{row.teamName}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {formatRecord(row.wins, row.losses, row.ties)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {formatPoints(row.pointsFor)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                    {formatPoints(row.pointsAgainst)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {weekRecap && weekRecap.games.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Week {currentWeek} matchups
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {weekRecap.games.map((game) => (
              <MatchupCard key={game.matchupId} game={game} />
            ))}
          </div>
        </Card>
      ) : null}

      {weekRecap && weekRecap.transactionSummaries.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Recent waiver &amp; trade activity
          </h2>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-secondary">
            {weekRecap.transactionSummaries.map((summary, i) => (
              <li key={i}>{summary}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
