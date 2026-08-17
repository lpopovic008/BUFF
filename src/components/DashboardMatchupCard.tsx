import { DashboardMatchupSide, DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints } from "@/lib/format";

function TeamColumn({ side, highlight }: { side: DashboardMatchupSide; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`truncate text-sm font-medium ${highlight ? "text-series-1" : "text-ink-primary"}`}
          title={side.teamName}
        >
          {side.teamName}
        </span>
        <span className="shrink-0 tabular-nums text-sm font-semibold text-ink-primary">
          {formatPoints(side.points)}
        </span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {side.topPlayers.map((p) => (
          <li key={p.playerId} className="flex items-baseline justify-between gap-2 text-xs text-ink-secondary">
            <span className="min-w-0 truncate" title={`${p.name} · ${p.position}${p.team ? ` · ${p.team}` : ""}`}>
              {p.name} <span className="text-ink-muted">{p.position}</span>
            </span>
            <span className="shrink-0 tabular-nums">{formatPoints(p.livePoints)}</span>
          </li>
        ))}
        {side.topPlayers.length === 0 ? <li className="text-xs text-ink-muted">Lineup not set</li> : null}
      </ul>
    </div>
  );
}

/** The dashboard's per-league "This week" section: team names, live points, and the top 3 players by KTC value on each side. */
export function DashboardMatchupCard({ matchup }: { matchup: DashboardMatchupView | null | undefined }) {
  // undefined = still loading this league's matchup; render nothing rather than flash an empty state.
  if (matchup === undefined) return null;

  if (matchup === null) {
    return (
      <div className="border-t border-grid pt-3 text-xs text-ink-muted">
        This week&rsquo;s matchup isn&rsquo;t set yet.
      </div>
    );
  }

  return (
    <div className="border-t border-grid pt-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">This week</span>
        <span className="text-[10px] uppercase tracking-wide text-ink-muted">Top 3 by KTC value</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TeamColumn side={matchup.my} highlight />
        {matchup.opponent ? <TeamColumn side={matchup.opponent} /> : <div className="text-xs text-ink-muted">Bye week</div>}
      </div>
    </div>
  );
}
