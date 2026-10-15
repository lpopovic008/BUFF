"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GroupedStarter, PlayerSide } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { cleanPlayText } from "@/lib/play-by-play";
import { periodStarts, pointsTimeline, PointsStep } from "@/lib/live-play-points";
import { useGamePlays, withScoreboardPlay } from "@/hooks/useRedZoneFeed";

// The line's color, by whose player it is: yours green, the ones you face red.
const SIDE_STROKE: Record<PlayerSide, string> = {
  mine: "text-status-good",
  opponent: "text-status-critical",
  other: "text-ink-primary",
};

// Room around the plot for its labels, in px.
const PAD = { left: 30, right: 10, top: 14, bottom: 18 };
const HOUR_MS = 60 * 60 * 1000;
// About how long a game runs, for the empty graph before kickoff.
const GAME_MS = 3.25 * HOUR_MS;

/** A time of day without AM/PM, e.g. "1:30". */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
}

/** Round, readable steps for the points axis — about four of them over `span`. */
function niceStep(span: number): number {
  for (const step of [1, 2, 5, 10, 20, 50]) if (span / step <= 5) return step;
  return 100;
}

function quarterName(period: number): string {
  return period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
}

/** The plot's size, tracked as its box resizes. */
function useSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** A clock that ticks every 15 seconds while the game's on, for the line's live end. */
function useLiveNow(live: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!live) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [live]);
  return live ? now : null;
}

/**
 * One player's fantasy points over the course of their game, in place of
 * the map: a step line that rises (or dips) at each play that moved their
 * points, by the time of day it happened, with the quarters marked and their
 * projection as a dashed line for reference. Live, it runs up to now and
 * moves as plays come in. Points are scored by the play (PPR, as the Red
 * Zone's are); should their total in your league differ — its own scoring,
 * or stats no single play carries — a dashed rise at the end makes up the
 * difference, so the line always ends on the number in their row. Tap or
 * hover a step for its play.
 */
export function PointsGraph({ player, game, onClose }: { player: GroupedStarter; game: NFLGame; onClose: () => void }) {
  const followed = useMemo(() => [{ game, players: [player] }], [game, player]);
  const playsByGame = useGamePlays(followed);
  const plays = useMemo(
    () => (game.state === "pre" ? [] : withScoreboardPlay(game, playsByGame[game.id] ?? [])),
    [game, playsByGame]
  );
  const steps = useMemo(
    () => pointsTimeline(plays, { playerId: player.playerId, name: player.name, position: player.position, team: player.team }),
    [plays, player.playerId, player.name, player.position, player.team]
  );
  const quarters = useMemo(() => periodStarts(plays), [plays]);
  const live = game.state === "in";
  const now = useLiveNow(live);
  const side = player.side ?? "mine";

  // Escape puts the map back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plotRef = useRef<HTMLDivElement>(null);
  const size = useSize(plotRef);
  const [picked, setPicked] = useState<string | null>(null);
  const shownStep = steps.find((s) => s.playId === picked) ?? steps[steps.length - 1] ?? null;

  // Their total in the row — the league's number — which the line ends on.
  const final = game.state === "pre" ? null : player.points;
  const playTotal = steps.length > 0 ? steps[steps.length - 1].total : 0;
  const makeUp = final !== null && Math.abs(final - playTotal) >= 0.05 ? final : null;

  // The time it spans: kickoff (or its first play) to the end of the game, or to now while it's on.
  const kickoff = new Date(game.kickoff).getTime();
  const lastPlayAt = Math.max(0, ...plays.map((p) => p.at ?? 0));
  const start = Math.min(Number.isNaN(kickoff) ? Infinity : kickoff, ...steps.map((s) => s.at), ...quarters.map((q) => q.at));
  const end =
    game.state === "pre" ? start + GAME_MS : Math.max(start + HOUR_MS / 2, lastPlayAt, ...(now !== null ? [now] : []));

  const values = [0, ...steps.map((s) => s.total), ...(makeUp !== null ? [makeUp] : []), ...(player.projected != null ? [player.projected] : [])];
  const step = niceStep(Math.max(5, Math.max(...values) - Math.min(...values)));
  const lo = Math.floor(Math.min(...values) / step) * step;
  const hi = Math.max(lo + step, Math.ceil(Math.max(...values, 5) / step) * step);

  const plot = size && Number.isFinite(start) ? { w: Math.max(0, size.width - PAD.left - PAD.right), h: Math.max(0, size.height - PAD.top - PAD.bottom) } : null;
  const x = (at: number) => PAD.left + (plot ? ((at - start) / (end - start)) * plot.w : 0);
  const y = (v: number) => PAD.top + (plot ? (1 - (v - lo) / (hi - lo)) * plot.h : 0);

  // The step line: flat between plays, straight up (or down) at each.
  let line = "";
  if (plot) {
    line = `M${x(start)},${y(0)}`;
    for (const s of steps) line += ` H${x(s.at)} V${y(s.total)}`;
    line += ` H${x(end)}`;
  }
  const area = plot ? `${line} V${y(Math.max(lo, 0))} H${x(start)} Z` : "";

  const yTicks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);
  // Every half hour, or every hour when it's narrow.
  const every = plot && plot.w < 260 ? HOUR_MS : HOUR_MS / 2;
  const xTicks: number[] = [];
  for (let t = Math.ceil(start / every) * every; t <= end; t += every) xTicks.push(t);

  const nearest = (clientX: number) => {
    const el = plotRef.current;
    if (!el || steps.length === 0) return;
    const px = clientX - el.getBoundingClientRect().left;
    let best: PointsStep | null = null;
    for (const s of steps) if (!best || Math.abs(x(s.at) - px) < Math.abs(x(best.at) - px)) best = s;
    if (best) setPicked(best.playId);
  };

  const status = game.state === "pre" ? `Kickoff ${clock(kickoff)}` : game.state === "post" ? "Final" : (game.statusDetail ?? "Live");
  const shownTotal = final ?? player.projected ?? null;

  return (
    <div className="flex h-full w-full flex-col border border-ink-muted/40 bg-[var(--page)]">
      {/* Who, their game, and their total — and the way back to the map. */}
      <div className="flex items-center gap-2 border-b border-ink-muted/25 px-2 py-1.5">
        <span className="min-w-0 truncate text-sm text-ink-primary">{player.name}</span>
        <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"}`}>
          {player.position}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.6875rem] uppercase tracking-wide text-ink-muted">
          {game.awayTeam} @ {game.homeTeam} · {status}
        </span>
        {shownTotal !== null ? (
          <span
            className={`shrink-0 text-sm font-bold tabular-nums ${game.state === "pre" ? `font-light italic ${SIDE_STROKE[side]}` : SIDE_STROKE[side]}`}
          >
            {game.state === "pre" ? shownTotal.toFixed(1) : shownTotal.toFixed(2)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the map"
          title="Back to the map"
          className="-mr-1 shrink-0 cursor-pointer px-1 text-base leading-none text-ink-muted transition-opacity hover:opacity-70"
        >
          ×
        </button>
      </div>

      <div
        ref={plotRef}
        className="relative min-h-[8rem] flex-1 touch-pan-y select-none"
        onPointerMove={(e) => nearest(e.clientX)}
        onPointerDown={(e) => nearest(e.clientX)}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setPicked(null);
        }}
      >
        {plot && size ? (
          <svg width={size.width} height={size.height} className="absolute inset-0 overflow-visible" role="img" aria-label={`${player.name}'s fantasy points over the game`}>
            {/* The points axis: a faint rule at each step, 0 a little stronger. */}
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PAD.left} x2={PAD.left + plot.w} y1={y(v)} y2={y(v)} className="stroke-ink-muted" strokeOpacity={v === 0 ? 0.45 : 0.15} strokeWidth={1} />
                <text x={PAD.left - 5} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[0.625rem] tabular-nums">
                  {v}
                </text>
              </g>
            ))}
            {/* The clock along the bottom. */}
            {xTicks.map((t) => (
              <text key={`x${t}`} x={x(t)} y={PAD.top + plot.h + 13} textAnchor="middle" className="fill-ink-muted text-[0.625rem] tabular-nums">
                {clock(t)}
              </text>
            ))}
            {/* Where each quarter began. */}
            {quarters
              .filter((q) => q.period > 1)
              .map((q) => (
                <g key={`q${q.period}`}>
                  <line x1={x(q.at)} x2={x(q.at)} y1={PAD.top} y2={PAD.top + plot.h} className="stroke-ink-muted" strokeOpacity={0.3} strokeDasharray="2 3" />
                  <text x={x(q.at) + 3} y={PAD.top - 4} className="fill-ink-muted text-[0.5625rem] font-semibold uppercase">
                    {quarterName(q.period)}
                  </text>
                </g>
              ))}
            {/* Their projection, for reference. */}
            {player.projected != null ? (
              <g>
                <line x1={PAD.left} x2={PAD.left + plot.w} y1={y(player.projected)} y2={y(player.projected)} className="stroke-ink-muted" strokeOpacity={0.6} strokeDasharray="4 3" />
                <text x={PAD.left + 4} y={y(player.projected) - 3} className="fill-ink-muted text-[0.5625rem] uppercase">
                  Proj {player.projected.toFixed(1)}
                </text>
              </g>
            ) : null}
            {/* The line itself, and the ground it covers. */}
            {game.state !== "pre" ? (
              <g className={SIDE_STROKE[side]}>
                <path d={area} fill="currentColor" fillOpacity={0.1} />
                <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="miter" />
                {makeUp !== null ? (
                  <line x1={x(end)} x2={x(end)} y1={y(playTotal)} y2={y(makeUp)} stroke="currentColor" strokeWidth={1.75} strokeDasharray="3 2" />
                ) : null}
                {steps.map((s) => (
                  <rect
                    key={s.playId}
                    x={x(s.at) - (s === shownStep ? 3.5 : 2)}
                    y={y(s.total) - (s === shownStep ? 3.5 : 2)}
                    width={s === shownStep ? 7 : 4}
                    height={s === shownStep ? 7 : 4}
                    fill={s === shownStep ? "var(--map-tag)" : "currentColor"}
                    stroke={s === shownStep ? "currentColor" : "none"}
                    strokeWidth={1.5}
                  />
                ))}
                {/* Where it stands now, while the game's on. */}
                {live ? <circle cx={x(end)} cy={y(makeUp ?? playTotal)} r={3} fill="currentColor" className="animate-pulse" /> : null}
              </g>
            ) : null}
          </svg>
        ) : null}
      </div>

      {/* The picked play — the latest, unless another's tapped. */}
      <div className="min-h-[2.5rem] border-t border-ink-muted/25 px-2 py-1 text-[0.6875rem] leading-snug">
        {shownStep ? (
          <>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-ink-muted">
                {clock(shownStep.at)}
                {shownStep.period > 0 ? ` · ${quarterName(shownStep.period)} ${shownStep.clock}` : ""}
              </span>
              <span className={shownStep.delta < 0 ? "text-status-critical" : "text-status-good"}>
                {shownStep.delta > 0 ? "+" : ""}
                {shownStep.delta.toFixed(2)}
              </span>
              <span className="text-ink-primary">{shownStep.total.toFixed(2)}</span>
            </div>
            <p className="line-clamp-2 text-ink-secondary">{cleanPlayText(shownStep.text)}</p>
          </>
        ) : (
          <p className="text-ink-muted">{game.state === "pre" ? `Kicks off at ${clock(kickoff)}` : game.state === "post" ? "No scoring plays" : "No points yet"}</p>
        )}
      </div>
    </div>
  );
}
