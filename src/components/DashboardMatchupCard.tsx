import Link from "next/link";
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

/** The dashboard's per-league matchup section: team names + score left/right, and each side's top 3 players pictured. */
export function DashboardMatchupCard({
  leagueId,
  matchup,
}: {
  leagueId: string;
  matchup: DashboardMatchupView | null | undefined;
}) {
  if (!matchup) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/team?league=${leagueId}&roster=${matchup.my.rosterId}`}
          className="min-w-0 truncate text-sm font-medium text-series-1 hover:underline"
        >
          {matchup.my.teamName}
        </Link>
        {matchup.opponent ? (
          <Link
            href={`/team?league=${leagueId}&roster=${matchup.opponent.rosterId}`}
            className="min-w-0 truncate text-right text-sm font-medium text-white hover:underline"
          >
            {matchup.opponent.teamName}
          </Link>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3 text-lg font-semibold tabular-nums text-white">
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
