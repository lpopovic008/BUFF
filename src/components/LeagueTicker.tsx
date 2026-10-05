"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { DashboardMatchupView } from "@/hooks/useDashboardMatchups";
import { formatPoints, formatRecord } from "@/lib/format";
import { MY_TEAM_NAME_CLASS, StreakBadge, TeamStanding } from "./DashboardMatchupCard";

export interface TickerLeague {
  leagueId: string;
  name: string;
  logo: string | null;
  matchup: DashboardMatchupView | null | undefined;
  my: TeamStanding | null;
  opponent?: TeamStanding;
  leagueSize: number;
}

// Whether your own team's name and score are marked out like the map's tags.
// Off for now, to try the entries without it.
const HIGHLIGHT_MINE = false;

// How fast the ticker drifts on its own, in px per second.
const DRIFT_PX_PER_S = 40;
// A flick's speed fades by e every this many ms, and is capped at this many px/s.
const FLING_DECAY_MS = 450;
const MAX_FLING_PX_PER_S = 5000;
// How far a finger must move before it counts as dragging the ticker (rather than a tap).
const DRAG_SLOP_PX = 6;

/**
 * Runs the ticker: a steady drift to the left, which a finger can grab and
 * drag either way — or flick, sending it on fast with momentum that eases
 * back into the drift. The track holds the leagues twice, so the offset
 * wraps at half its width onto an identical frame. Holding still while
 * touched or hovered; no drift for reduced motion (dragging still works).
 */
function useTickerMotion(
  viewport: React.RefObject<HTMLDivElement | null>,
  track: React.RefObject<HTMLDivElement | null>,
  count: number
) {
  useEffect(() => {
    const box = viewport.current;
    const strip = track.current;
    if (!box || !strip) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let offset = 0;
    let fling = 0;
    let hovering = false;
    let swallowClick = false;
    let drag: {
      id: number;
      startX: number;
      startY: number;
      startOffset: number;
      lastX: number;
      lastT: number;
      velocity: number;
      active: boolean;
    } | null = null;

    const apply = () => {
      const loop = strip.offsetWidth / 2;
      if (loop > 0) offset = ((offset % loop) + loop) % loop;
      strip.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };

    let last = performance.now();
    let raf = requestAnimationFrame(function frame(now) {
      const dt = Math.min(64, now - last);
      last = now;
      if (!drag) {
        const drift = reduceMotion || hovering ? 0 : DRIFT_PX_PER_S;
        offset += ((drift + fling) * dt) / 1000;
        fling *= Math.exp(-dt / FLING_DECAY_MS);
        if (Math.abs(fling) < 4) fling = 0;
        apply();
      }
      raf = requestAnimationFrame(frame);
    });

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Touching it catches it, like grabbing a moving belt.
      fling = 0;
      // A touch drag never ends in a click, so a stale flag from one must not eat this tap.
      swallowClick = false;
      drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, startOffset: offset, lastX: e.clientX, lastT: e.timeStamp, velocity: 0, active: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.startX;
      if (!drag.active) {
        if (Math.abs(dx) > DRAG_SLOP_PX && Math.abs(dx) > Math.abs(e.clientY - drag.startY)) {
          drag.active = true;
          box.setPointerCapture(e.pointerId);
        } else if (Math.abs(e.clientY - drag.startY) > DRAG_SLOP_PX) {
          drag = null; // a vertical swipe: the page scrolls instead
        }
        return;
      }
      const dt = e.timeStamp - drag.lastT;
      if (dt > 0) {
        // Finger moving left pushes the ticker forward (positive offset).
        const instant = (-(e.clientX - drag.lastX) / dt) * 1000;
        drag.velocity = drag.velocity * 0.3 + instant * 0.7;
      }
      drag.lastX = e.clientX;
      drag.lastT = e.timeStamp;
      offset = drag.startOffset - dx;
      apply();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.active) {
        // A finger that stopped before lifting leaves no momentum.
        const stale = e.timeStamp - drag.lastT > 80;
        fling = stale ? 0 : Math.max(-MAX_FLING_PX_PER_S, Math.min(MAX_FLING_PX_PER_S, drag.velocity));
        swallowClick = true;
      }
      drag = null;
    };
    // A drag ends on a league's link; don't let it count as a tap.
    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hovering = true;
    };
    const onLeave = () => {
      hovering = false;
    };

    box.addEventListener("pointerdown", onDown);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    box.addEventListener("pointercancel", onUp);
    box.addEventListener("click", onClick, true);
    box.addEventListener("pointerenter", onEnter);
    box.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onUp);
      box.removeEventListener("click", onClick, true);
      box.removeEventListener("pointerenter", onEnter);
      box.removeEventListener("pointerleave", onLeave);
    };
  }, [viewport, track, count]);
}

/** One team in a matchup box: name, score and standing. */
export interface MatchupRowTeam {
  name: string;
  points: number | null;
  standing?: TeamStanding;
  /** Your own team, marked out like a map tag (when HIGHLIGHT_MINE is on). */
  mine?: boolean;
}

/**
 * One team's row in a matchup box: its standing on one line — place, name,
 * record, streak — and its score at the right edge. Two cells of the box's
 * grid, so both teams' scores line up in one column. On the ticker names are
 * never cut short — the entry grows to fit them; in a fixed-width box
 * (`fitWidth`) a name too long for it ends in an ellipsis.
 */
function TickerTeamRow({ team, fitWidth }: { team: MatchupRowTeam; fitWidth: boolean }) {
  const { name, points, standing, mine = false } = team;
  const { rank, record, streak } = standing ?? {};
  return (
    <>
      <div className={`flex items-center gap-1.5 whitespace-nowrap ${fitWidth ? "min-w-0" : ""}`}>
        {/* The place as a bare number in a fixed two digits, right-aligned, so every team name starts at the same x. */}
        <span className="w-[2ch] shrink-0 text-right text-xs font-medium tabular-nums text-series-4">{rank ?? ""}</span>
        <span
          className={`text-sm ${fitWidth ? "min-w-0 truncate" : ""} ${mine && HIGHLIGHT_MINE ? MY_TEAM_NAME_CLASS : "font-medium text-ink-primary"}`}
        >
          {name}
        </span>
        {record ? (
          <span className="shrink-0 text-xs tabular-nums text-ink-muted">({formatRecord(record.wins, record.losses, record.ties)})</span>
        ) : null}
        <StreakBadge streak={streak} />
      </div>
      <span
        className={`justify-self-end text-base tabular-nums ${mine && HIGHLIGHT_MINE ? MY_TEAM_NAME_CLASS : "font-semibold text-ink-primary"}`}
      >
        {points != null ? formatPoints(points) : ""}
      </span>
    </>
  );
}

/** A matchup's two teams, one row each, scores in a column of their own — the body of a ticker entry, and of the league page's matchup list. */
export function MatchupRows({ teams, fitWidth = false }: { teams: MatchupRowTeam[]; fitWidth?: boolean }) {
  return (
    <div className={`grid items-center gap-x-6 gap-y-1 ${fitWidth ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[1fr_auto]"}`}>
      {teams.map((team, i) => (
        <TickerTeamRow key={i} team={team} fitWidth={fitWidth} />
      ))}
    </div>
  );
}

/**
 * One league on the ticker: its name over your matchup, the two teams
 * stacked — yours on top — each on one line with its score at the right,
 * the scores in a column of their own. The entry is as wide as its longest
 * team line needs.
 */
function TickerItem({
  league,
  position,
  total,
  minWidth,
  copy,
}: {
  league: TickerLeague;
  /** Where this league falls in your own ordering of them (1-based), and out of how many. */
  position: number;
  total: number;
  minWidth: string;
  copy: boolean;
}) {
  const { matchup, my, opponent } = league;
  return (
    <Link
      href={`/league?id=${league.leagueId}`}
      aria-hidden={copy || undefined}
      tabIndex={copy ? -1 : undefined}
      draggable={false}
      className="relative flex w-max shrink-0 flex-col justify-center gap-0.5 border-r border-border px-4 py-1.5"
      style={{ minWidth }}
    >
      <span className="absolute right-4 top-1.5 text-[0.625rem] font-medium tabular-nums leading-[1.5] text-ink-muted">
        {position}/{total}
      </span>
      {/* Against the left edge, padded on the right so a long title never runs into the position. */}
      <div className="flex items-center gap-1.5 pr-8 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-muted">
        {league.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote Sleeper avatar on a static export; nothing for next/image to optimize
          <img src={league.logo} alt="" draggable={false} className="h-3 w-3 shrink-0 rounded-full object-cover" />
        ) : null}
        <span className="whitespace-nowrap">{league.name}</span>
      </div>
      {matchup && my ? (
        <MatchupRows
          teams={[
            { name: matchup.my.teamName, points: matchup.my.points, standing: my, mine: true },
            { name: matchup.opponent?.teamName ?? "Bye", points: matchup.opponent ? matchup.opponent.points : null, standing: opponent },
          ]}
        />
      ) : (
        <div className="text-center text-xs text-ink-secondary">No matchup this week</div>
      )}
    </Link>
  );
}

/**
 * Your leagues as a stock-market ticker running edge to edge right under the
 * header, then pinned to the top of the screen once the header scrolls away
 * — on every screen size. It drifts past on a loop and can be dragged or
 * flicked to move it faster (see useTickerMotion). Render it first on the
 * page: it pulls itself out of <main>'s padding to sit flush against the
 * header.
 */
export function LeagueTicker({ leagues }: { leagues: TickerLeague[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  useTickerMotion(viewport, track, leagues.length);
  // Publish the ticker's height as --ticker-h, like the header's --header-h,
  // so the dashboard's sticky columns sit just beneath it.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty("--ticker-h", `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty("--ticker-h");
    };
  }, [leagues.length]);
  if (leagues.length === 0) return null;
  // The list runs twice so the loop is seamless; each copy spans at least the
  // screen, so even one or two leagues never leave a gap.
  const minWidth = `calc(100vw / ${leagues.length})`;
  return (
    <nav
      ref={bar}
      aria-label="Your leagues"
      className="sticky top-[var(--header-h,0px)] z-40 -mx-4 -mt-6 border-b border-border bg-page/95 backdrop-blur sm:-mx-6 sm:-mt-8 md:-mx-1"
    >
      <div ref={viewport} className="select-none overflow-hidden [touch-action:pan-y]">
        <div ref={track} className="flex w-max will-change-transform">
          {[...leagues, ...leagues].map((league, i) => (
            <TickerItem
              key={`${league.leagueId}-${i}`}
              league={league}
              position={(i % leagues.length) + 1}
              total={leagues.length}
              minWidth={minWidth}
              copy={i >= leagues.length}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
