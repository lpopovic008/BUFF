import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints, ordinal, splitNameTwoLines } from "@/lib/format";

/**
 * A team's name, plain — no rank suffix here anymore (that now sits next to
 * the score, on the side facing the other team). On mobile, any name with
 * at least one space is forced onto two lines split as evenly as possible;
 * a single word stays on one line. Desktop always stays single line
 * (truncating if it has to).
 */
function TeamNameLabel({
  name,
  align,
  colorClass,
}: {
  name: string;
  align: "left" | "right";
  colorClass: string;
}) {
  const split = splitNameTwoLines(name);
  const alignClass = align === "right" ? "text-right" : "";

  return (
    <div className={`min-w-0 min-h-[2.5rem] text-sm font-medium ${colorClass} ${alignClass} sm:min-h-0`}>
      <div className="sm:hidden">
        {split ? (
          <>
            <div>{split[0]}</div>
            <div>{split[1]}</div>
          </>
        ) : (
          <div>{name}</div>
        )}
      </div>
      <div className="hidden truncate sm:block">{name}</div>
    </div>
  );
}

/** A rank badge tucked right against the score it belongs to, on the side facing the other team's score. */
function RankBadge({ rank }: { rank?: number }) {
  if (rank == null) return null;
  return <span className="text-xs font-medium text-series-4">{ordinal(rank)}</span>;
}

/** The dashboard's per-league matchup section: team names + score left/right. Sits inside a whole-box link, so team names are plain text rather than their own nested links. Who's actually playing is covered once, for every league at once, by the starters-by-game box below the league grid. */
export function DashboardMatchupCard({
  matchup,
  myRank,
  opponentRank,
}: {
  matchup: DashboardMatchupView | null | undefined;
  myRank: number;
  opponentRank?: number;
}) {
  if (!matchup) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <TeamNameLabel name={matchup.my.teamName} align="left" colorClass="text-series-1" />
        {matchup.opponent ? (
          <TeamNameLabel name={matchup.opponent.teamName} align="right" colorClass="text-ink-primary" />
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3 text-lg font-semibold tabular-nums text-ink-primary">
        <span className="flex items-baseline gap-1.5">
          {formatPoints(matchup.my.points)}
          <RankBadge rank={myRank} />
        </span>
        {matchup.opponent ? (
          <span className="flex items-baseline gap-1.5">
            <RankBadge rank={opponentRank} />
            {formatPoints(matchup.opponent.points)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
