import Link from "next/link";
import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints, formatRecord, ordinal } from "@/lib/format";
import { PointsRanks, Streak, TeamStanding } from "@/lib/league-data";

export type { TeamStanding };

/**
 * The marks around a team's name and score — standings rank, streak, PF/PA
 * ranks — in their usual colors on the page, or in the --on-tag-* set when
 * they sit on a map-tag plate (a highlighted block), which flips light and
 * dark between themes.
 */
const TONE_CLASS = { good: "text-status-good", mid: "text-series-4", bad: "text-status-critical" } as const;
const ON_TAG_TONE_CLASS = {
  good: "text-[var(--on-tag-good)]",
  mid: "text-[var(--on-tag-mid)]",
  bad: "text-[var(--on-tag-bad)]",
} as const;
const toneClass = (onTag: boolean) => (onTag ? ON_TAG_TONE_CLASS : TONE_CLASS);
/** Secondary text (records, PF/PA labels): muted on the page, the plate's ink dimmed on a plate. */
const mutedClass = (onTag: boolean) => (onTag ? "text-[var(--map-tag-ink)] opacity-70" : "text-ink-muted");

/** A green up-triangle for a winning streak, red down-triangle for a losing one, then its length. */
export function StreakBadge({ streak, onTag = false }: { streak?: Streak | null; onTag?: boolean }) {
  if (!streak) return null;
  const winning = streak.result === "W";
  return (
    <span
      className={`flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums ${toneClass(onTag)[winning ? "good" : "bad"]}`}
      title={`${streak.length}-game ${winning ? "winning" : "losing"} streak`}
    >
      <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden>
        <path d={winning ? "M5 1 9.5 9h-9z" : "M5 9 .5 1h9z"} fill="currentColor" />
      </svg>
      {streak.length}
    </span>
  );
}

/** Your own team's name, styled like the map's game tags: solid contrasting fill and ink, bold. */
export const MY_TEAM_NAME_CLASS = "bg-[var(--map-tag)] px-[0.35em] font-bold text-[var(--map-tag-ink)]";
const OTHER_TEAM_NAME_CLASS = "font-medium text-ink-primary";

/**
 * A team's line: its place in the standings, its name, its record in
 * parentheses, then its streak just right of the record — one line, where
 * only the name ever truncates. With `stackOnPhone`, phones give the name a
 * line to itself (still truncating if it's longer than its half) and put the
 * rank, record and streak underneath.
 */
export function TeamNameLabel({
  name,
  standing,
  align,
  mine = false,
  href,
  onTag = false,
  stackOnPhone = false,
}: {
  name: string;
  standing: TeamStanding;
  align: "left" | "right";
  /** Your own team, marked out like a map tag. */
  mine?: boolean;
  /** Where the name links to, when it isn't already inside a link. */
  href?: string;
  /** Sitting on a map-tag plate: the plate's ink, and marks colored to read on it. */
  onTag?: boolean;
  stackOnPhone?: boolean;
}) {
  const { rank, record, streak } = standing;
  const nameStyle = onTag ? "font-bold" : mine ? MY_TEAM_NAME_CLASS : OTHER_TEAM_NAME_CLASS;
  const nameEl = (className: string) =>
    href ? (
      <Link href={href} className={`${className} ${nameStyle} hover:underline`}>
        {name}
      </Link>
    ) : (
      <span className={`${className} ${nameStyle}`}>{name}</span>
    );
  const rankEl = rank != null ? <span className={`shrink-0 text-xs font-medium ${toneClass(onTag).mid}`}>{ordinal(rank)}</span> : null;
  const recordEl = record ? (
    <span className={`shrink-0 text-xs tabular-nums ${mutedClass(onTag)}`}>({formatRecord(record.wins, record.losses, record.ties)})</span>
  ) : null;
  const justify = align === "right" ? "justify-end" : "";

  const oneLine = (
    <div className={`min-w-0 items-baseline gap-1.5 ${justify} ${stackOnPhone ? "hidden sm:flex" : "flex"}`}>
      {rankEl}
      {nameEl("min-w-0 truncate text-sm")}
      {recordEl}
      <StreakBadge streak={streak} onTag={onTag} />
    </div>
  );
  if (!stackOnPhone) return oneLine;
  return (
    <>
      <div className={`flex min-w-0 flex-col gap-0.5 sm:hidden ${align === "right" ? "items-end text-right" : ""}`}>
        {nameEl("max-w-full truncate text-sm leading-tight")}
        <div className={`flex items-baseline gap-1.5 ${justify}`}>
          {rankEl}
          {recordEl}
          <StreakBadge streak={streak} onTag={onTag} />
        </div>
      </div>
      {oneLine}
    </>
  );
}

/**
 * A rank's color by where it falls in the league: the top third green, the
 * middle amber, the bottom third red. `higherIsWorse` flips it for points
 * against, where 1st means the most points scored on you.
 */
export function rankTone(rank: number, leagueSize: number, higherIsWorse = false): "good" | "mid" | "bad" {
  const third = Math.max(1, leagueSize) / 3;
  const tone = rank <= third ? "good" : rank >= leagueSize - third + 1 ? "bad" : "mid";
  if (!higherIsWorse || tone === "mid") return tone;
  return tone === "good" ? "bad" : "good";
}

/**
 * Where a team's points for and points against rank in the league, PF then
 * PA side by side, each rank colored by how good it is (see rankTone). Sits
 * on the outside of the team's score, which is always innermost.
 */
export function PointsRankBadges({
  pointsRanks,
  leagueSize,
  onTag = false,
}: {
  pointsRanks?: PointsRanks;
  leagueSize: number;
  onTag?: boolean;
}) {
  if (!pointsRanks) return null;
  const tones = toneClass(onTag);
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap text-[0.625rem] font-normal sm:gap-2 sm:text-[0.6875rem]">
      <span title="Points for — rank in the league (1st = most)">
        <span className={mutedClass(onTag)}>PF</span>{" "}
        <span className={`font-semibold ${tones[rankTone(pointsRanks.pointsFor, leagueSize)]}`}>{ordinal(pointsRanks.pointsFor)}</span>
      </span>
      <span title="Points against — rank in the league (1st = most scored against)">
        <span className={mutedClass(onTag)}>PA</span>{" "}
        <span className={`font-semibold ${tones[rankTone(pointsRanks.pointsAgainst, leagueSize, true)]}`}>
          {ordinal(pointsRanks.pointsAgainst)}
        </span>
      </span>
    </span>
  );
}

/** The dashboard's per-league matchup section: each team's line (rank, name, record, streak) over its score, PF/PA ranks on the outside, left and right. Sits inside a whole-box link, so team names are plain text rather than their own nested links. Who's actually playing is covered once, for every league at once, by the starters-by-game box below the league grid. */
export function DashboardMatchupCard({
  matchup,
  my,
  opponent,
  leagueSize,
}: {
  matchup: DashboardMatchupView | null | undefined;
  my: TeamStanding;
  opponent?: TeamStanding;
  /** Teams in the league, for coloring ranks by where they fall in it. */
  leagueSize: number;
}) {
  if (!matchup) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 items-baseline gap-3">
        <TeamNameLabel name={matchup.my.teamName} standing={my} align="left" mine />
        {matchup.opponent ? <TeamNameLabel name={matchup.opponent.teamName} standing={opponent ?? {}} align="right" /> : null}
      </div>
      {/* Scores toward the middle, facing each other; PF and PA ranks on the outside of each. */}
      <div className="grid grid-cols-2 items-baseline gap-6 text-lg font-semibold tabular-nums text-ink-primary">
        <span className="flex items-baseline justify-end gap-2">
          <PointsRankBadges pointsRanks={my.pointsRanks} leagueSize={leagueSize} />
          {formatPoints(matchup.my.points)}
        </span>
        {matchup.opponent ? (
          <span className="flex items-baseline gap-2">
            {formatPoints(matchup.opponent.points)}
            <PointsRankBadges pointsRanks={opponent?.pointsRanks} leagueSize={leagueSize} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
