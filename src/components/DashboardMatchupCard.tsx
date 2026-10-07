import Link from "next/link";
import { formatRecord } from "@/lib/format";
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
/** Secondary text (records, PF/PA labels): bold, a step down from the name — secondary ink on the page, the plate's ink dimmed on a plate. */
const mutedClass = (onTag: boolean) => (onTag ? "font-semibold text-[var(--map-tag-ink)] opacity-80" : "font-semibold text-ink-secondary");

/** A green up-triangle for a winning streak, red down-triangle for a losing one, then its length. */
export function StreakBadge({ streak, onTag = false }: { streak?: Streak | null; onTag?: boolean }) {
  if (!streak) return null;
  const winning = streak.result === "W";
  return (
    <span
      className={`flex shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums ${toneClass(onTag)[winning ? "good" : "bad"]}`}
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
  const rankEl = rank != null ? <span className={`shrink-0 text-xs font-bold tabular-nums ${toneClass(onTag).mid}`}>{rank}</span> : null;
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

// Between a label and its number (PF 6, H2H (7-4)): a hair tighter than a space
// below desktop width, where a matchup header's score line has no room to spare
// (on a tablet it shares the row with the matchups list).
const LABEL_GAP = "ml-0.5 lg:ml-1";

/**
 * Where a team's points for and points against rank in the league, PF then
 * PA side by side, each rank colored by how good it is (see rankTone). Sits
 * tight to the outside edge of the team's half; the score sits innermost.
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
    <span className="flex items-baseline gap-1 whitespace-nowrap text-[0.625rem] font-normal lg:gap-2 lg:text-[0.6875rem]">
      <span title="Points for — rank in the league (1st = most)">
        <span className={mutedClass(onTag)}>PF</span>
        <span className={`${LABEL_GAP} font-bold tabular-nums ${tones[rankTone(pointsRanks.pointsFor, leagueSize)]}`}>{pointsRanks.pointsFor}</span>
      </span>
      <span title="Points against — rank in the league (1st = most scored against)">
        <span className={mutedClass(onTag)}>PA</span>
        <span className={`${LABEL_GAP} font-bold tabular-nums ${tones[rankTone(pointsRanks.pointsAgainst, leagueSize, true)]}`}>
          {pointsRanks.pointsAgainst}
        </span>
      </span>
    </span>
  );
}

/**
 * A team's all-time head-to-head record against this week's opponent,
 * across every linked season — green when it's ahead, red when behind.
 * Shown in parentheses, "(7-4)"; "(0-0)" when they've never met.
 */
export function HeadToHeadBadge({ wins, losses, onTag = false }: { wins: number; losses: number; onTag?: boolean }) {
  const tone = wins > losses ? "good" : wins < losses ? "bad" : null;
  return (
    <span
      className="whitespace-nowrap text-[0.625rem] font-normal lg:text-[0.6875rem]"
      title="All-time head-to-head record against this opponent, every season of the league"
    >
      <span className={mutedClass(onTag)}>H2H</span>
      <span className={`${LABEL_GAP} font-bold tabular-nums ${tone ? toneClass(onTag)[tone] : mutedClass(onTag)}`}>
        ({wins}-{losses})
      </span>
    </span>
  );
}

