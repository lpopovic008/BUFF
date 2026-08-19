import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { RankedPlayer } from "@/lib/matchup-players";
import { formatPoints, ordinal, splitNameTwoLines } from "@/lib/format";
import { myTeamNameTransitionName, opponentTeamNameTransitionName } from "@/lib/view-transitions";
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

/**
 * A team's name, with an optional colored rank suffix. On mobile, any name
 * with at least one space is forced onto two lines split as evenly as
 * possible (the rank suffix's length counts toward that balance too, since
 * it lands on the second line); a single word stays on one line. Desktop
 * always stays single line (truncating if it has to).
 */
function TeamNameLabel({
  name,
  rank,
  align,
  colorClass,
  transitionName,
}: {
  name: string;
  rank?: number;
  align: "left" | "right";
  colorClass: string;
  transitionName?: string;
}) {
  const rankText = rank != null ? ` · ${ordinal(rank)}` : "";
  const split = splitNameTwoLines(name, rankText.length);
  const rankSuffix = rankText ? <span className="text-series-4">{rankText}</span> : null;
  const alignClass = align === "right" ? "text-right" : "";

  return (
    <div
      className={`min-w-0 min-h-[2.5rem] text-sm font-medium ${colorClass} ${alignClass} sm:min-h-0`}
      style={transitionName ? { viewTransitionName: transitionName } : undefined}
    >
      <div className="sm:hidden">
        {split ? (
          <>
            <div>{split[0]}</div>
            <div>
              {split[1]}
              {rankSuffix}
            </div>
          </>
        ) : (
          <div>
            {name}
            {rankSuffix}
          </div>
        )}
      </div>
      <div className="hidden truncate sm:block">
        {name}
        {rankSuffix}
      </div>
    </div>
  );
}

/** The dashboard's per-league matchup section: team names + score left/right, and each side's top 3 players pictured. Sits inside a whole-box link, so team names are plain text rather than their own nested links. */
export function DashboardMatchupCard({
  leagueId,
  matchup,
  myRank,
  opponentRank,
}: {
  leagueId: string;
  matchup: DashboardMatchupView | null | undefined;
  myRank: number;
  opponentRank?: number;
}) {
  if (!matchup) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <TeamNameLabel
          name={matchup.my.teamName}
          rank={myRank}
          align="left"
          colorClass="text-series-1"
          transitionName={myTeamNameTransitionName(leagueId)}
        />
        {matchup.opponent ? (
          <TeamNameLabel
            name={matchup.opponent.teamName}
            rank={opponentRank}
            align="right"
            colorClass="text-ink-primary"
            transitionName={opponentTeamNameTransitionName(leagueId)}
          />
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
