import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints, formatRecord, ordinal } from "@/lib/format";
import { PointsRanks, Streak } from "@/lib/league-data";

/** One side's standing in its league, shown around its name and score. */
export interface TeamStanding {
  rank?: number;
  record?: { wins: number; losses: number; ties: number };
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
 * A team's line: its place in the standings, its name, its record in
 * parentheses, and its streak on the side facing the other team. Always a
 * single line, on mobile and desktop alike — only the name ever truncates.
 */
function TeamNameLabel({
  name,
  standing,
  align,
  colorClass,
}: {
  name: string;
  standing: TeamStanding;
  align: "left" | "right";
  colorClass: string;
}) {
  const { rank, record, streak } = standing;
  const streakBadge = <StreakBadge streak={streak} />;
  return (
    <div className={`flex min-w-0 items-baseline gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
      {align === "right" ? streakBadge : null}
      {rank != null ? <span className="shrink-0 text-xs font-medium text-series-4">{ordinal(rank)}</span> : null}
      <span className={`min-w-0 truncate text-sm font-medium ${colorClass}`}>{name}</span>
      {record ? (
        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
          ({formatRecord(record.wins, record.losses, record.ties)})
        </span>
      ) : null}
      {align === "left" ? streakBadge : null}
    </div>
  );
}

/**
 * Where a team's points for and points against rank in the league, tucked
 * against its score on the side facing the other team's. Always PF then PA;
 * on a phone they stack, one over the other, so both teams' sets fit on the
 * score's line.
 */
function PointsRankBadges({ pointsRanks, align }: { pointsRanks?: PointsRanks; align: "left" | "right" }) {
  if (!pointsRanks) return null;
  return (
    <span
      className={`flex flex-col whitespace-nowrap text-[0.625rem] font-normal leading-tight text-ink-muted sm:flex-row sm:gap-1.5 sm:text-[0.6875rem] sm:leading-normal ${
        align === "right" ? "items-end" : ""
      }`}
    >
      <span title="Points for — rank in the league (1st = most)">PF {ordinal(pointsRanks.pointsFor)}</span>
      <span title="Points against — rank in the league (1st = most scored against)">PA {ordinal(pointsRanks.pointsAgainst)}</span>
    </span>
  );
}

/** The dashboard's per-league matchup section: each team's line (rank, name, record, streak) over its score, left and right. Sits inside a whole-box link, so team names are plain text rather than their own nested links. Who's actually playing is covered once, for every league at once, by the starters-by-game box below the league grid. */
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
      <div className="grid grid-cols-2 items-baseline gap-3">
        <TeamNameLabel name={matchup.my.teamName} standing={my} align="left" colorClass="text-series-1" />
        {matchup.opponent ? (
          <TeamNameLabel
            name={matchup.opponent.teamName}
            standing={opponent ?? {}}
            align="right"
            colorClass="text-ink-primary"
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 text-lg font-semibold tabular-nums text-ink-primary sm:items-baseline">
        <span className="flex items-center gap-1.5 sm:items-baseline">
          {formatPoints(matchup.my.points)}
          <PointsRankBadges pointsRanks={my.pointsRanks} align="left" />
        </span>
        {matchup.opponent ? (
          <span className="flex items-center gap-1.5 sm:items-baseline">
            <PointsRankBadges pointsRanks={opponent?.pointsRanks} align="right" />
            {formatPoints(matchup.opponent.points)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
