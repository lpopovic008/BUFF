import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints, ordinal, splitNameTwoLines } from "@/lib/format";

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
}: {
  name: string;
  rank?: number;
  align: "left" | "right";
  colorClass: string;
}) {
  const rankText = rank != null ? ` · ${ordinal(rank)}` : "";
  const split = splitNameTwoLines(name, rankText.length);
  const rankSuffix = rankText ? <span className="text-series-4">{rankText}</span> : null;
  const alignClass = align === "right" ? "text-right" : "";

  return (
    <div className={`min-w-0 min-h-[2.5rem] text-sm font-medium ${colorClass} ${alignClass} sm:min-h-0`}>
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
        <TeamNameLabel name={matchup.my.teamName} rank={myRank} align="left" colorClass="text-series-1" />
        {matchup.opponent ? (
          <TeamNameLabel
            name={matchup.opponent.teamName}
            rank={opponentRank}
            align="right"
            colorClass="text-ink-primary"
          />
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3 text-lg font-semibold tabular-nums text-ink-primary">
        <span>{formatPoints(matchup.my.points)}</span>
        {matchup.opponent ? <span>{formatPoints(matchup.opponent.points)}</span> : null}
      </div>
    </div>
  );
}
