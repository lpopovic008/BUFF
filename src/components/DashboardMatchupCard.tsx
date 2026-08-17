"use client";

import { useState } from "react";
import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { RankedPlayer } from "@/lib/matchup-players";
import { formatPoints } from "@/lib/format";
import { playerHeadshotUrl } from "@/lib/sleeper";

function PlayerHeadshot({ playerId }: { playerId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="h-10 w-10 shrink-0 rounded-full bg-page" aria-hidden />;
  }
  return (
    // Sleeper's CDN, not every player has a real photo — fall back to a plain circle rather than a broken image icon.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playerHeadshotUrl(playerId)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-full bg-page object-cover"
    />
  );
}

function PlayerFace({ player, flip }: { player: RankedPlayer | undefined; flip?: boolean }) {
  if (!player) return <div />;
  return (
    <div className={`flex min-w-0 items-center gap-2 ${flip ? "flex-row-reverse text-right" : ""}`}>
      <PlayerHeadshot playerId={player.playerId} />
      <span className="min-w-0 truncate text-xs text-ink-secondary">{player.name}</span>
    </div>
  );
}

/** The dashboard's per-league matchup section: team names + score left/right, and each side's top 3 players by KTC value facing off row by row. */
export function DashboardMatchupCard({ matchup }: { matchup: DashboardMatchupView | null | undefined }) {
  if (!matchup) return null;

  const rows = matchup.opponent
    ? Math.max(matchup.my.topPlayers.length, matchup.opponent.topPlayers.length)
    : 0;

  return (
    <div className="flex flex-col gap-3 border-t border-grid pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-series-1">{matchup.my.teamName}</span>
        {matchup.opponent ? (
          <span className="min-w-0 truncate text-right text-sm font-medium text-ink-primary">
            {matchup.opponent.teamName}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3 text-lg font-semibold tabular-nums text-ink-primary">
        <span>{formatPoints(matchup.my.points)}</span>
        {matchup.opponent ? <span>{formatPoints(matchup.opponent.points)}</span> : null}
      </div>
      {rows > 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <PlayerFace player={matchup.my.topPlayers[i]} />
              <PlayerFace player={matchup.opponent?.topPlayers[i]} flip />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
