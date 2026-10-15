"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { cleanPlayText } from "@/lib/play-by-play";
import { pacePieces, periodStarts, pointsTimeline } from "@/lib/live-play-points";
import { useGamePlays, withScoreboardPlay } from "@/hooks/useRedZoneFeed";

// Room around the plot for its labels, in px.
const FULL_PAD = { left: 30, right: 10, top: 14, bottom: 26 };
// Side by side with others, there's no clock along the bottom or labels on top.
const COMPACT_PAD = { left: 24, right: 6, top: 6, bottom: 6 };
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

/** A span of the clock as "34m", or "1h 5m". */
function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

/**
 * One player's fantasy points over the course of their game, in place of
 * the map: a step line that rises (or dips) at each play that moved their
 * points, by the time of day it happened, with the quarters marked. Their
 * projection is a dashed pace line climbing from 0 at kickoff to the full
 * projection at the final whistle, and the ground under their line is green
 * wherever they're at or ahead of that pace, red wherever they're behind it.
 * Live, the line runs up to now and moves as plays come in, the axis running
 * on to about when the game should end. Points are scored by the play (PPR,
 * as the Red Zone's are); should their total in your league differ — its own
 * scoring, or stats no single play carries — a dashed rise at the end makes
 * up the difference, so the line always ends on the number in their row.
 * Dragging (or hovering) across it puts a dotted line under the finger,
 * left where it's lifted, and the description below shows the last play by
 * then.
 */
export function PointsGraph({
  player,
  game,
  onClose,
  compact = false,
}: {
  player: GroupedStarter;
  game: NFLGame;
  onClose: () => void;
  /** One of several on screen: just the name, the total, the points axis and the lines. */
  compact?: boolean;
}) {
  const PAD = compact ? COMPACT_PAD : FULL_PAD;
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

  const plotRef = useRef<HTMLDivElement>(null);
  const size = useSize(plotRef);
  // Where the finger (or mouse) last was, as a time — kept once it's lifted.
  // Where the finger (or mouse) last was — kept once it's lifted — or, stepped to with the arrow keys, which play.
  const [cursor, setCursor] = useState<{ at: number; playId?: string } | null>(null);
  const cursorAt = cursor?.at ?? null;

  // Their total in the row — the league's number — which the line ends on.
  const final = game.state === "pre" ? null : player.points;
  const playTotal = steps.length > 0 ? steps[steps.length - 1].total : 0;
  const makeUp = final !== null && Math.abs(final - playTotal) >= 0.05 ? final : null;
  const projected = player.projected != null && player.projected > 0 ? player.projected : null;

  // The time it spans: kickoff (or its first play) to the final whistle — or,
  // before it's over, to about when it should end.
  const kickoff = new Date(game.kickoff).getTime();
  const lastPlayAt = Math.max(0, ...plays.map((p) => p.at ?? 0));
  const start = Math.min(Number.isNaN(kickoff) ? Infinity : kickoff, ...steps.map((s) => s.at), ...quarters.map((q) => q.at));
  const over = game.state === "post";
  const end = over ? Math.max(start + HOUR_MS / 2, lastPlayAt) : Math.max(start + GAME_MS, lastPlayAt, now ?? 0);
  // Where the line stops: the end of the game, or now (its latest play, until the clock's read).
  const lineEnd = game.state === "pre" ? null : over ? end : Math.max(lastPlayAt, now ?? 0, start);

  const values = [0, ...steps.map((s) => s.total), ...(makeUp !== null ? [makeUp] : []), ...(projected !== null ? [projected] : [])];
  const step = niceStep(Math.max(5, Math.max(...values) - Math.min(...values)));
  const lo = Math.floor(Math.min(...values) / step) * step;
  const hi = Math.max(lo + step, Math.ceil(Math.max(...values, 5) / step) * step);

  const plot = size && Number.isFinite(start) ? { w: Math.max(0, size.width - PAD.left - PAD.right), h: Math.max(0, size.height - PAD.top - PAD.bottom) } : null;
  const x = (at: number) => PAD.left + (plot ? ((at - start) / (end - start)) * plot.w : 0);
  const y = (v: number) => PAD.top + (plot ? (1 - (v - lo) / (hi - lo)) * plot.h : 0);
  const timeAt = (px: number) => (plot ? start + Math.min(1, Math.max(0, (px - PAD.left) / plot.w)) * (end - start) : start);

  // The step line: flat between plays, straight up (or down) at each.
  let line = "";
  if (plot && lineEnd !== null) {
    line = `M${x(start)},${y(0)}`;
    for (const s of steps) line += ` H${x(s.at)} V${y(s.total)}`;
    line += ` H${x(lineEnd)}`;
  }
  const pieces = plot && lineEnd !== null ? pacePieces(steps, start, lineEnd, end, projected) : [];

  const yTicks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);

  // The clock along the bottom: kickoff, each quarter's start, and the end —
  // "~" while that's only a guess — with the minutes between each pair
  // halfway along, wherever there's room.
  const marks: { at: number; label: string }[] = [];
  if (plot) {
    const all = [
      { at: start, label: clock(start) },
      ...quarters.filter((q) => q.period > 1).map((q) => ({ at: q.at, label: clock(q.at) })),
      { at: end, label: `${over ? "" : "~"}${clock(end)}` },
    ];
    for (const m of all) {
      const last = marks[marks.length - 1];
      if (last && x(m.at) - x(last.at) < 40) {
        // Too close to the one before: the end always shows, in its place.
        if (m.at === end && marks.length > 1) marks[marks.length - 1] = m;
        continue;
      }
      marks.push(m);
    }
  }
  const gaps = marks.slice(1).flatMap((m, i) => {
    const prev = marks[i];
    // Only spans that have played out, with room for the label.
    if (!over && m.at === end) return [];
    return x(m.at) - x(prev.at) >= 70 ? [{ at: (prev.at + m.at) / 2, label: minutes(m.at - prev.at) }] : [];
  });

  // The play the description shows: the last by the cursor's time, or the latest.
  const shownStep =
    cursor === null
      ? (steps[steps.length - 1] ?? null)
      : ((cursor.playId ? steps.find((s) => s.playId === cursor.playId) : undefined) ?? [...steps].reverse().find((s) => s.at <= cursor.at) ?? null);
  const follow = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = plotRef.current;
    if (!el || !plot) return;
    setCursor({ at: timeAt(e.clientX - el.getBoundingClientRect().left) });
  };

  // The arrow keys step the cursor a play at a time — left to the one before it, right to the one after.
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || steps.length === 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      const i = shownStep ? steps.indexOf(shownStep) : -1;
      // On a play already (or no cursor yet, so on the latest): one either side. Between plays, left lands on the one just passed.
      const onPlay = cursor === null || (shownStep !== null && (cursor.playId === shownStep.playId || cursor.at === shownStep.at));
      const next =
        e.key === "ArrowLeft"
          ? i < 0
            ? null
            : steps[onPlay ? Math.max(0, i - 1) : i]
          : cursor === null
            ? steps[steps.length - 1]
            : steps[Math.min(steps.length - 1, i + 1)];
      if (next) setCursor({ at: next.at, playId: next.playId });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, steps, cursor, shownStep]);

  const status = game.state === "pre" ? `Kickoff ${clock(kickoff)}` : over ? "Final" : (game.statusDetail ?? "Live");
  const shownTotal = final ?? player.projected ?? null;
  const baseline = y(Math.max(lo, 0));
  const fill = (onPace: boolean | null) => (onPace === null ? "fill-ink-muted" : onPace ? "fill-status-good" : "fill-status-critical");

  return (
    // Open, like the map: no frame of its own.
    <div className="flex h-full w-full min-w-0 flex-col bg-[var(--page)]">
      {/* Who, their game, and their total — and the way back to the map. */}
      <div className={`flex items-center gap-2 ${compact ? "px-1 py-0.5" : "px-2 py-1.5"}`}>
        <span className={`min-w-0 truncate text-ink-primary ${compact ? "text-xs" : "text-sm"}`}>{player.name}</span>
        {compact ? (
          <span className="min-w-0 flex-1" />
        ) : (
          <>
            <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"}`}>
              {player.position}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.6875rem] uppercase tracking-wide text-ink-muted">
              {game.awayTeam} @ {game.homeTeam} · {status}
            </span>
          </>
        )}
        {shownTotal !== null ? (
          // Lit on a tag plate, like the map's game tags; a projection in italics.
          <span
            className={`shrink-0 bg-[var(--map-tag)] px-1.5 font-bold tabular-nums text-[var(--map-tag-ink)] ${compact ? "text-xs" : "text-sm"} ${
              game.state === "pre" ? "italic" : ""
            }`}
          >
            {game.state === "pre" ? shownTotal.toFixed(1) : shownTotal.toFixed(2)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label={compact ? `Take ${player.name}'s graph down` : "Back to the map"}
          title={compact ? "Take this graph down" : "Back to the map"}
          className="-mr-1 shrink-0 cursor-pointer px-1 text-base leading-none text-ink-muted transition-opacity hover:opacity-70"
        >
          ×
        </button>
      </div>

      <div
        ref={plotRef}
        className={`relative flex-1 select-none ${compact ? "min-h-0" : "min-h-[8rem] touch-pan-y"}`}
        onPointerMove={compact ? undefined : follow}
        onPointerDown={compact ? undefined : follow}
      >
        {plot && size ? (
          <svg width={size.width} height={size.height} className="absolute inset-0 overflow-visible" role="img" aria-label={`${player.name}'s fantasy points over the game`}>
            {/* The ground under the line: green while on pace, red while behind it. */}
            {pieces.map((p) => (
              <rect
                key={`${p.from}-${p.to}`}
                x={x(p.from)}
                width={Math.max(0, x(p.to) - x(p.from))}
                y={Math.min(y(p.value), baseline)}
                height={Math.abs(baseline - y(p.value))}
                className={fill(p.onPace)}
                fillOpacity={0.22}
              />
            ))}
            {/* The points axis: a faint rule at each step, 0 a little stronger. */}
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PAD.left} x2={PAD.left + plot.w} y1={y(v)} y2={y(v)} className="stroke-ink-muted" strokeOpacity={v === 0 ? 0.45 : 0.15} strokeWidth={1} />
                <text x={PAD.left - 5} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[0.625rem] tabular-nums">
                  {v}
                </text>
              </g>
            ))}
            {/* Where each quarter began. */}
            {quarters
              .filter((q) => q.period > 1)
              .map((q) => (
                <g key={`q${q.period}`}>
                  <line x1={x(q.at)} x2={x(q.at)} y1={PAD.top} y2={PAD.top + plot.h} className="stroke-ink-muted" strokeOpacity={0.35} />
                  {/* Its label steps aside while the cursor's time is over it. */}
                  {compact || (cursorAt !== null && Math.abs(x(q.at) + 8 - x(cursorAt)) < 30) ? null : (
                    <text x={x(q.at) + 3} y={PAD.top - 4} className="fill-ink-muted text-[0.5625rem] font-semibold uppercase">
                      {quarterName(q.period)}
                    </text>
                  )}
                </g>
              ))}
            {/* The clock along the bottom, and the minutes between. */}
            {(compact ? [] : marks).map((m, i) => (
              <text
                key={`x${m.at}`}
                x={x(m.at)}
                y={PAD.top + plot.h + 17}
                textAnchor={i === 0 ? "start" : m.at === end ? "end" : "middle"}
                className="fill-ink-muted text-[0.625rem] tabular-nums"
              >
                {m.label}
              </text>
            ))}
            {(compact ? [] : gaps).map((g) => (
              <text key={`g${g.at}`} x={x(g.at)} y={PAD.top + plot.h + 17} textAnchor="middle" className="fill-ink-muted text-[0.5625rem] opacity-60">
                {g.label}
              </text>
            ))}
            {/* Their pace: 0 at kickoff to the full projection at the final whistle. */}
            {projected !== null ? (
              <g>
                <line x1={x(start)} x2={x(end)} y1={y(0)} y2={y(projected)} className="stroke-ink-muted" strokeOpacity={0.7} strokeDasharray="4 3" />
                {compact ? null : (
                  <text x={x(end) - 2} y={y(projected) - 4} textAnchor="end" className="fill-ink-muted text-[0.5625rem] uppercase">
                    Proj {projected.toFixed(1)}
                  </text>
                )}
              </g>
            ) : null}
            {/* The line itself. */}
            {lineEnd !== null ? (
              <g className="text-ink-primary">
                <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="miter" />
                {makeUp !== null ? (
                  <line x1={x(lineEnd)} x2={x(lineEnd)} y1={y(playTotal)} y2={y(makeUp)} stroke="currentColor" strokeWidth={1.75} strokeDasharray="3 2" />
                ) : null}
                {/* Where it stands now, while the game's on. */}
                {live ? <circle cx={x(lineEnd)} cy={y(makeUp ?? playTotal)} r={2.5} fill="currentColor" className="animate-pulse" /> : null}
              </g>
            ) : null}
            {/* The cursor: a dotted line under the finger, left where it's lifted, with the time there. */}
            {cursorAt !== null && !compact ? (
              <g>
                <line x1={x(cursorAt)} x2={x(cursorAt)} y1={PAD.top} y2={PAD.top + plot.h} className="stroke-ink-primary" strokeWidth={1} strokeDasharray="2 2" />
                <text
                  x={Math.min(Math.max(x(cursorAt), PAD.left + 14), PAD.left + plot.w - 14)}
                  y={PAD.top - 4}
                  textAnchor="middle"
                  className="fill-ink-primary text-[0.5625rem] font-semibold tabular-nums"
                  paintOrder="stroke"
                  stroke="var(--page)"
                  strokeWidth={3}
                >
                  {clock(cursorAt)}
                </text>
              </g>
            ) : null}
          </svg>
        ) : null}
      </div>

      {/* The last play by the cursor (the latest, before any drag) — a fixed height whatever it says. */}
      {compact ? null : (
      <div className="flex h-[2.75rem] shrink-0 gap-2 overflow-hidden border-t border-ink-muted/25 px-2 py-1 text-[0.6875rem] leading-snug">
        <p className="line-clamp-2 min-w-0 flex-1 text-ink-secondary">
          {shownStep ? cleanPlayText(shownStep.text) : game.state === "pre" ? `Kicks off at ${clock(kickoff)}` : over && steps.length === 0 ? "No scoring plays" : "No points yet"}
        </p>
        {shownStep ? (
          <div className="flex shrink-0 flex-col items-end tabular-nums">
            <span className="text-ink-muted">
              {clock(shownStep.at)}
              {shownStep.period > 0 ? ` · ${quarterName(shownStep.period)} ${shownStep.clock}` : ""}
            </span>
            <span className={shownStep.delta < 0 ? "text-status-critical" : "text-status-good"}>
              {shownStep.delta > 0 ? "+" : ""}
              {shownStep.delta.toFixed(2)}
            </span>
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
