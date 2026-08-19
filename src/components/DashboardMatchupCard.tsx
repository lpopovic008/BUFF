import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { RankedPlayer } from "@/lib/matchup-players";
import { formatPoints } from "@/lib/format";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";

function PlayerFaces({ players }: { players: RankedPlayer[] }) {
  return (
    <div className="flex gap-1.5">
      {players.map((p) => (
        <PlayerHeadshot key={p.playerId} playerId={p.playerId} size={36} />
      ))}
    </div>
  );
}

/** The dashboard's per-league matchup section: team names + score left/right, and each side's top 3 players pictured. Sits inside a whole-box link, so team names are plain text rather than their own nested links. */
export function DashboardMatchupCard({ matchup }: { matchup: DashboardMatchupView | null | undefined }) {
  if (!matchup) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="line-clamp-2 min-w-0 text-balance text-sm font-medium text-series-1 sm:line-clamp-1 sm:truncate">
          {matchup.my.teamName}
        </div>
        {matchup.opponent ? (
          <div className="line-clamp-2 min-w-0 text-balance text-right text-sm font-medium text-ink-primary sm:line-clamp-1 sm:truncate">
            {matchup.opponent.teamName}
          </div>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3 text-lg font-semibold tabular-nums text-ink-primary">
        <span>{formatPoints(matchup.my.points)}</span>
        {matchup.opponent ? <span>{formatPoints(matchup.opponent.points)}</span> : null}
      </div>
      {matchup.my.topPlayers.length > 0 || matchup.opponent?.topPlayers.length ? (
        <div className="flex items-center justify-between gap-3">
          <PlayerFaces players={matchup.my.topPlayers} />
          {matchup.opponent ? <PlayerFaces players={matchup.opponent.topPlayers} /> : null}
        </div>
      ) : null}
    </div>
  );
}
