import Link from "next/link";
import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints, formatRecord, ordinal } from "@/lib/format";
import { PointsRanks } from "@/lib/league-data";
import { StreakBadge, TeamStanding, TONE_CLASS, rankTone } from "./DashboardMatchupCard";

export interface TickerLeague {
  leagueId: string;
  name: string;
  logo: string | null;
  matchup: DashboardMatchupView | null | undefined;
  my: TeamStanding | null;
  opponent?: TeamStanding;
  leagueSize: number;
}

// Seconds each league spends crossing the screen.
const SECONDS_PER_LEAGUE = 9;

/** A team's second line: its place in the standings, its record, then its streak. */
function TeamMeta({ standing, align }: { standing: TeamStanding; align: "left" | "right" }) {
  const { rank, record, streak } = standing;
  return (
    <div className={`flex items-center gap-1 whitespace-nowrap text-[0.625rem] ${align === "right" ? "justify-end" : ""}`}>
      {rank != null ? <span className="font-medium text-series-4">{ordinal(rank)}</span> : null}
      {record ? (
        <span className="tabular-nums text-ink-muted">({formatRecord(record.wins, record.losses, record.ties)})</span>
      ) : null}
      <StreakBadge streak={streak} />
    </div>
  );
}

/** PF and PA ranks on one line, each colored by how good it is. */
function PointsRanksInline({ ranks, leagueSize, align }: { ranks?: PointsRanks; leagueSize: number; align: "left" | "right" }) {
  if (!ranks) return <span />;
  return (
    <div className={`whitespace-nowrap text-[0.625rem] text-ink-muted ${align === "right" ? "text-right" : "text-left"}`}>
      PF <span className={`font-semibold ${TONE_CLASS[rankTone(ranks.pointsFor, leagueSize)]}`}>{ordinal(ranks.pointsFor)}</span>{" "}
      PA <span className={`font-semibold ${TONE_CLASS[rankTone(ranks.pointsAgainst, leagueSize, true)]}`}>{ordinal(ranks.pointsAgainst)}</span>
    </div>
  );
}

/**
 * One league on the ticker: its name over your matchup, laid out like a
 * quote — each team's name, then its rank, record and streak beneath it,
 * with the two scores (and their PF/PA ranks) facing each other between.
 */
function TickerItem({ league, minWidth, copy }: { league: TickerLeague; minWidth: string; copy: boolean }) {
  const { matchup, my, opponent, leagueSize } = league;
  return (
    <Link
      href={`/league?id=${league.leagueId}`}
      aria-hidden={copy || undefined}
      tabIndex={copy ? -1 : undefined}
      className="flex h-full shrink-0 flex-col justify-center gap-0.5 border-r border-border px-4"
      style={{ minWidth }}
    >
      <div className="flex items-center justify-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-muted">
        {league.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper avatar on a static export; nothing for next/image to optimize
          <img src={league.logo} alt="" className="h-3 w-3 rounded-full object-cover" />
        ) : null}
        <span className="max-w-[16rem] truncate">{league.name}</span>
      </div>
      {matchup && my ? (
        <div className="grid grid-cols-[minmax(0,auto)_auto_auto_minmax(0,auto)] items-baseline justify-center gap-x-3">
          <span className="max-w-[9rem] truncate text-sm font-medium text-series-1">{matchup.my.teamName}</span>
          <span className="text-sm font-semibold tabular-nums text-ink-primary">{formatPoints(matchup.my.points)}</span>
          <span className="text-sm font-semibold tabular-nums text-ink-primary">
            {matchup.opponent ? formatPoints(matchup.opponent.points) : null}
          </span>
          <span className="max-w-[9rem] truncate text-right text-sm font-medium text-ink-primary">
            {matchup.opponent?.teamName ?? "Bye"}
          </span>
          <TeamMeta standing={my} align="left" />
          <PointsRanksInline ranks={my.pointsRanks} leagueSize={leagueSize} align="right" />
          <PointsRanksInline ranks={opponent?.pointsRanks} leagueSize={leagueSize} align="left" />
          {opponent ? <TeamMeta standing={opponent} align="right" /> : <span />}
        </div>
      ) : (
        <div className="text-center text-xs text-ink-secondary">No matchup this week</div>
      )}
    </Link>
  );
}

/**
 * Your leagues as a stock-market ticker pinned to the bottom of a phone's
 * screen, scrolling past on a loop (it holds still while touched or hovered,
 * and for reduced motion, where it scrolls by hand instead). Phones only —
 * wider screens show the full league boxes. Renders a spacer too, so the end
 * of the page isn't hidden behind it.
 */
export function LeagueTicker({ leagues }: { leagues: TickerLeague[] }) {
  if (leagues.length === 0) return null;
  // The list runs twice so the loop is seamless; each copy spans at least the
  // screen, so even one or two leagues never leave a gap.
  const minWidth = `calc(100vw / ${leagues.length})`;
  return (
    <>
      <div aria-hidden className="h-[calc(4.25rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Your leagues"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="h-[4.25rem] overflow-hidden motion-reduce:overflow-x-auto">
          <div
            className="flex h-full w-max animate-[ticker_linear_infinite] hover:[animation-play-state:paused] active:[animation-play-state:paused] motion-reduce:animate-none"
            style={{ animationDuration: `${leagues.length * SECONDS_PER_LEAGUE}s` }}
          >
            {[...leagues, ...leagues].map((league, i) => (
              <TickerItem key={`${league.leagueId}-${i}`} league={league} minWidth={minWidth} copy={i >= leagues.length} />
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
