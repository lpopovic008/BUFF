import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints, ordinal } from "@/lib/format";
import { PointsRanks, Streak } from "@/lib/league-data";

/** One side's standing in its league, shown around its name and score. */
export interface TeamStanding {
  rank?: number;
  streak?: Streak | null;
  pointsRanks?: PointsRanks;
}

/** A green up-triangle for a winning streak, red down-triangle for a losing one, then its length. */
function StreakBadge({ streak }: { streak?: Streak | null }) {
  if (!streak) return null;
  const winning = streak.result === "W";
  return (
    <span
      className={`flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums ${
        winning ? "text-status-good" : "text-status-critical"
      }`}
      title={`${streak.length}-game ${winning ? "winning" : "losing"} streak`}
    >
      <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden>
        <path d={winning ? "M5 1 9.5 9h-9z" : "M5 9 .5 1h9z"} fill="currentColor" />
      </svg>
      {streak.length}
    </span>
  );
}

/**
 * A team's name with its streak on the side facing the other team. Always a
 * single truncating line, on mobile and desktop alike — the streak never
 * gets cut, only the name.
 */
function TeamNameLabel({
  name,
  streak,
  align,
  colorClass,
}: {
  name: string;
  streak?: Streak | null;
  align: "left" | "right";
  colorClass: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <span className={`min-w-0 truncate text-sm font-medium ${colorClass}`}>{name}</span>
      <StreakBadge streak={streak} />
    </div>
  );
}

/**
 * The ranks tucked against a score, on the side facing the other team's:
 * the team's place in the standings right beside the score, then where its
 * points for and points against rank in the league. PF/PA always read in
 * that order; on a phone they stack, one over the other, so both teams'
 * sets fit on the score's line.
 */
function RankBadges({ standing, align }: { standing: TeamStanding; align: "left" | "right" }) {
  const { rank, pointsRanks } = standing;
  const place = rank != null ? <span className="text-xs font-medium text-series-4">{ordinal(rank)}</span> : null;
  const points = pointsRanks ? (
    <span
      className={`flex flex-col whitespace-nowrap text-[0.625rem] font-normal leading-tight text-ink-muted sm:flex-row sm:gap-1.5 sm:text-[0.6875rem] sm:leading-normal ${
        align === "right" ? "items-end" : ""
      }`}
    >
      <span title="Points for — rank in the league (1st = most)">PF {ordinal(pointsRanks.pointsFor)}</span>
      <span title="Points against — rank in the league (1st = most scored against)">PA {ordinal(pointsRanks.pointsAgainst)}</span>
    </span>
  ) : null;
  return (
    <span className="flex items-center gap-1.5 sm:items-baseline">
      {align === "left" ? (
        <>
          {place}
          {points}
        </>
      ) : (
        <>
          {points}
          {place}
        </>
      )}
    </span>
  );
}

/** The dashboard's per-league matchup section: team names + score left/right. Sits inside a whole-box link, so team names are plain text rather than their own nested links. Who's actually playing is covered once, for every league at once, by the starters-by-game box below the league grid. */
export function DashboardMatchupCard({
  matchup,
  my,
  opponent,
}: {
  matchup: DashboardMatchupView | null | undefined;
  my: TeamStanding;
  opponent?: TeamStanding;
}) {
  if (!matchup) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <TeamNameLabel name={matchup.my.teamName} streak={my.streak} align="left" colorClass="text-series-1" />
        {matchup.opponent ? (
          <TeamNameLabel
            name={matchup.opponent.teamName}
            streak={opponent?.streak}
            align="right"
            colorClass="text-ink-primary"
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 text-lg sm:items-baseline font-semibold tabular-nums text-ink-primary">
        <span className="flex items-center gap-1.5 sm:items-baseline">
          {formatPoints(matchup.my.points)}
          <RankBadges standing={my} align="left" />
        </span>
        {matchup.opponent ? (
          <span className="flex items-center gap-1.5 sm:items-baseline">
            <RankBadges standing={opponent ?? {}} align="right" />
            {formatPoints(matchup.opponent.points)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
