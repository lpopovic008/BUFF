"use client";

import { useState } from "react";
import { DashboardMatchupSide, DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints } from "@/lib/format";
import { playerHeadshotUrl } from "@/lib/sleeper";

function PlayerHeadshot({ playerId }: { playerId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="h-6 w-6 shrink-0 rounded-full bg-page" aria-hidden />;
  }
  return (
    // Sleeper's CDN, not every player has a real photo — fall back to a plain circle rather than a broken image icon.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playerHeadshotUrl(playerId)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-6 w-6 shrink-0 rounded-full bg-page object-cover"
    />
  );
}

function TeamBlock({ side, highlight }: { side: DashboardMatchupSide; highlight?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`min-w-0 truncate text-sm font-medium ${highlight ? "text-series-1" : "text-ink-primary"}`}
          title={side.teamName}
        >
          {side.teamName}
        </span>
        <span className="shrink-0 tabular-nums text-sm font-semibold text-ink-primary">
          {formatPoints(side.points)}
        </span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {side.topPlayers.map((p) => (
          <li key={p.playerId} className="flex items-center gap-2">
            <PlayerHeadshot playerId={p.playerId} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary">
              {p.name} <span className="text-ink-muted">{p.position}</span>
            </span>
            <span className="shrink-0 tabular-nums text-xs text-ink-secondary">{formatPoints(p.livePoints)}</span>
          </li>
        ))}
        {side.topPlayers.length === 0 ? <li className="text-xs text-ink-muted">Lineup not set</li> : null}
      </ul>
    </div>
  );
}

/** The dashboard's per-league matchup section: team names, live points, and the top 3 players by KTC value on each side. */
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
    <div className="flex flex-col gap-3 border-t border-grid pt-3">
      <TeamBlock side={matchup.my} highlight />
      {matchup.opponent ? <TeamBlock side={matchup.opponent} /> : <div className="text-xs text-ink-muted">Bye week</div>}
    </div>
  );
}
