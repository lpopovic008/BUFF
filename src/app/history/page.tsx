import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { getConfig } from "@/lib/store";
import { getLeagueSeasonHistory, aggregateCareerStats } from "@/lib/league-data";
import { getLeague } from "@/lib/sleeper";
import { formatRecord, winPct, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HistoryOverviewPage() {
  const config = await getConfig();

  if (config.leagues.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-ink-secondary">
        Track a league from{" "}
        <Link href="/settings" className="font-medium text-series-1 hover:underline">
          Settings
        </Link>{" "}
        to see career stats here.
      </Card>
    );
  }

  const leagueHistories = await Promise.all(
    config.leagues.map(async (tracked) => {
      const league = await getLeague(tracked.leagueId);
      const seasons = await getLeagueSeasonHistory(tracked.leagueId);
      const managers = aggregateCareerStats(seasons);
      const mine = config.sleeperUserId ? managers.find((m) => m.userId === config.sleeperUserId) : undefined;
      return { tracked, league, seasons, mine };
    })
  );

  const totalChampionships = leagueHistories.reduce((sum, l) => sum + (l.mine?.championships ?? 0), 0);
  const totalSeasons = leagueHistories.reduce((sum, l) => sum + (l.mine?.seasonsPlayed ?? 0), 0);
  const totalWins = leagueHistories.reduce((sum, l) => sum + (l.mine?.wins ?? 0), 0);
  const totalLosses = leagueHistories.reduce((sum, l) => sum + (l.mine?.losses ?? 0), 0);
  const totalTies = leagueHistories.reduce((sum, l) => sum + (l.mine?.ties ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Career history</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Stats reconstructed from every linked Sleeper season for each of your leagues.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="All-time championships" value={String(totalChampionships)} />
        <StatTile label="Seasons played" value={String(totalSeasons)} />
        <StatTile
          label="Career record"
          value={totalSeasons > 0 ? formatRecord(totalWins, totalLosses, totalTies) : "—"}
        />
        <StatTile
          label="Career win%"
          value={totalSeasons > 0 ? formatPct(winPct(totalWins, totalLosses, totalTies)) : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {leagueHistories.map(({ tracked, league, seasons, mine }) => (
          <Card key={tracked.leagueId} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-ink-primary">{league?.name ?? tracked.leagueId}</div>
                <div className="text-xs text-ink-muted">
                  {seasons.length} linked season{seasons.length === 1 ? "" : "s"}
                </div>
              </div>
              <Link
                href={`/leagues/${tracked.leagueId}/history`}
                className="shrink-0 text-sm font-medium text-series-1 hover:underline"
              >
                Full history →
              </Link>
            </div>
            {mine ? (
              <div className="flex gap-6 border-t border-grid pt-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-ink-muted">Your record</div>
                  <div className="font-semibold tabular-nums text-ink-primary">
                    {formatRecord(mine.wins, mine.losses, mine.ties)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-ink-muted">Titles</div>
                  <div className="font-semibold tabular-nums text-ink-primary">{mine.championships}</div>
                </div>
              </div>
            ) : (
              <p className="border-t border-grid pt-3 text-xs text-ink-muted">
                No matching manager found for your Sleeper account in this league&rsquo;s history.
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
