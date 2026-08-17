import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getConfig } from "@/lib/store";
import { DiscoverForm } from "./DiscoverForm";
import { toggleCommish, removeLeagueAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const config = await getConfig();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Settings</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Connect your Sleeper account and choose which leagues to track. Nothing is written back to
          Sleeper — this only reads your public league data.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Sleeper account
        </h2>
        <DiscoverForm defaultUsername={config.sleeperUsername ?? ""} defaultSeason={config.season} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Tracked leagues ({config.leagues.length})
        </h2>
        {config.leagues.length === 0 ? (
          <p className="text-sm text-ink-secondary">
            No leagues yet. Enter your username and season above and click &ldquo;Discover
            leagues&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-grid">
            {config.leagues.map((league) => (
              <li key={league.leagueId} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink-primary">
                    {league.nickname ?? league.leagueId}
                  </div>
                  <div className="truncate text-xs text-ink-muted">{league.leagueId}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {league.isCommish ? <Badge tone="good">Commissioner</Badge> : null}
                  <form action={toggleCommish}>
                    <input type="hidden" name="leagueId" value={league.leagueId} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-page"
                    >
                      {league.isCommish ? "Unmark commish" : "Mark as commish"}
                    </button>
                  </form>
                  <form action={removeLeagueAction}>
                    <input type="hidden" name="leagueId" value={league.leagueId} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
