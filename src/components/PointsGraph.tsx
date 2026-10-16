"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { halftimeSpan, pacePieces, periodStarts, pointsTimeline } from "@/lib/live-play-points";
import { useGamePlays, withScoreboardPlay } from "@/hooks/useRedZoneFeed";

// Room around the plot for its labels, in px.
const FULL_PAD = { left: 30, right: 10, top: 14, bottom: 26 };
// Side by side with others, there's no clock along the bottom or labels on top.
const COMPACT_PAD = { left: 24, right: 6, top: 6, bottom: 6 };
export const HOUR_MS = 60 * 60 * 1000;
// About how long a game runs, for the empty graph before kickoff.
export const GAME_MS = 3.25 * HOUR_MS;

/** A time of day without AM/PM, e.g. "1:30". */
export function clock(at: number): string {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
}

/** Round, readable steps for the points axis — about four of them over `span`. */
export function niceStep(span: number): number {
  for (const step of [1, 2, 5, 10, 20, 50]) if (span / step <= 5) return step;
  return 100;
}

export function quarterName(period: number): string {
  return period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
}

/** The plot's size, tracked as its box resizes. */
export function useSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } | null {
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
export function useLiveNow(live: boolean): number | null {
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
 * on to about when the game should end. Each play is scored under the
 * league's own rules (`scoring`; PPR without one) — bonuses, a TE premium, a
 * defense's points-allowed bracket and all; should Sleeper's total still
 * differ — stats no single play carries — a dashed rise at the end makes up
 * the difference, so the line always ends on the number in their row.
 * Dragging (or hovering) across it puts a dotted line under the finger,
 * left where it's lifted, and the Red Zone shows the last play by then
 * (`onCursorPlay`); tapping the graph again, or anywhere off it, takes the
 * cursor away, and the Red Zone goes back to where it was.
 */
export function PointsGraph({
  player,
  game,
  onClose,
  compact = false,
  scoring,
  onCursorPlay,
}: {
  player: GroupedStarter;
  game: NFLGame;
  onClose: () => void;
  /** The league's scoring (Sleeper's scoring_settings) each play is scored under — standard PPR without one. */
  scoring?: Record<string, number>;
  /** One of several on screen: just the name, the total, the points axis and the lines. */
  compact?: boolean;
  /** Told the play by the cursor (its game and ESPN play id) whenever that changes — null once the cursor's gone. */
  onCursorPlay?: (play: { gameId: string; playId: string } | null) => void;
}) {
  const PAD = compact ? COMPACT_PAD : FULL_PAD;
  const followed = useMemo(() => [{ game, players: [player] }], [game, player]);
  const playsByGame = useGamePlays(followed);
  const plays = useMemo(
    () => (game.state === "pre" ? [] : withScoreboardPlay(game, playsByGame[game.id] ?? [])),
    [game, playsByGame]
  );
  const steps = useMemo(
    () =>
      pointsTimeline(
        plays,
        { playerId: player.playerId, name: player.name, position: player.position, team: player.team },
        scoring,
        { home: game.homeTeam, away: game.awayTeam }
      ),
    [plays, player.playerId, player.name, player.position, player.team, scoring, game.homeTeam, game.awayTeam]
  );
  const quarters = useMemo(() => periodStarts(plays), [plays]);
  const halftime = useMemo(() => halftimeSpan(plays), [plays]);
  const etchId = `etch-${useId().replace(/:/g, "")}`;
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
  // Halftime squeezed down to a thin etched column; the rest of the clock runs evenly either side of it.
  const ht = halftime && halftime.from > start && halftime.to < end ? halftime : null;
  const htWidth = ht ? (compact ? 5 : 9) : 0;
  const perMs = plot ? (plot.w - htWidth) / (end - start - (ht ? ht.to - ht.from : 0)) : 0;
  const x = (at: number) => {
    if (!ht || at <= ht.from) return PAD.left + (at - start) * perMs;
    const before = PAD.left + (ht.from - start) * perMs;
    if (at >= ht.to) return before + htWidth + (at - ht.to) * perMs;
    return before + (htWidth * (at - ht.from)) / (ht.to - ht.from);
  };
  const y = (v: number) => PAD.top + (plot ? (1 - (v - lo) / (hi - lo)) * plot.h : 0);
  const timeAt = (px: number) => {
    if (!plot || perMs <= 0) return start;
    const rel = Math.min(plot.w, Math.max(0, px - PAD.left));
    const before = ht ? (ht.from - start) * perMs : Infinity;
    if (!ht || rel <= before) return start + rel / perMs;
    if (rel >= before + htWidth) return ht.to + (rel - before - htWidth) / perMs;
    return ht.from + ((rel - before) / htWidth) * (ht.to - ht.from);
  };

  // The step line: flat between plays, straight up (or down) at each.
  let line = "";
  if (plot && lineEnd !== null) {
    line = `M${x(start)},${y(0)}`;
    for (const s of steps) line += ` H${x(s.at)} V${y(s.total)}`;
    line += ` H${x(lineEnd)}`;
  }
  // Measured along the screen, so the pace line is straight and stands still through halftime's column.
  const pieces =
    plot && lineEnd !== null
      ? pacePieces(steps.map((s) => ({ at: x(s.at), total: s.total })), x(start), x(lineEnd), x(end), projected)
      : [];
  // How much of the game so far they've been on pace, and behind it — halftime aside.
  const share = (() => {
    const htFrom = ht ? x(ht.from) : 0;
    const htTo = ht ? x(ht.to) : 0;
    const playing = (p: { from: number; to: number }) => p.to - p.from - Math.max(0, Math.min(p.to, htTo) - Math.max(p.from, htFrom));
    let ahead = 0;
    let behind = 0;
    for (const p of pieces) {
      if (p.onPace === true) ahead += playing(p);
      else if (p.onPace === false) behind += playing(p);
    }
    const total = ahead + behind;
    if (total <= 0) return null;
    const onPace = Math.round((ahead / total) * 100);
    return { onPace, behind: 100 - onPace };
  })();

  const yTicks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);

  // The clock along the bottom: kickoff, each quarter's start, and the end —
  // "~" while that's only a guess — with the minutes between each pair
  // halfway along, wherever there's room.
  const marks: { at: number; label: string }[] = [];
  if (plot) {
    const kickoffMark = { at: start, label: clock(start), rank: 0 };
    const endMark = { at: end, label: `${over ? "" : "~"}${clock(end)}`, rank: 1 };
    // Halftime has no mark of its own: the 3rd quarter's start stands for its end, and keeps its place under its line before the others.
    const quarterMarks = quarters
      .filter((q) => q.period > 1)
      .map((q) => ({ at: q.at, label: clock(q.at), rank: q.period === 3 ? 2 : 3 }));
    // Placed in order of standing, each only where it won't crowd one already placed.
    for (const m of [kickoffMark, endMark, ...quarterMarks].sort((p, q) => p.rank - q.rank)) {
      if (marks.some((placed) => Math.abs(x(placed.at) - x(m.at)) < 40)) continue;
      marks.push({ at: m.at, label: m.label });
    }
    marks.sort((p, q) => p.at - q.at);
  }
  const gaps = marks.slice(1).flatMap((m, i) => {
    const prev = marks[i];
    // Only spans that have played out, with room for the label.
    if (!over && m.at === end) return [];
    // The clock that ran between them, halftime left out — so the 2nd quarter's figure is how long it really took.
    const halftimeIn = ht ? Math.max(0, Math.min(m.at, ht.to) - Math.max(prev.at, ht.from)) : 0;
    return x(m.at) - x(prev.at) >= 70 ? [{ px: (x(prev.at) + x(m.at)) / 2, label: minutes(m.at - prev.at - halftimeIn) }] : [];
  });

  // The play by the cursor: the last by its time (or the latest, for the arrow keys to start from).
  const shownStep =
    cursor === null
      ? (steps[steps.length - 1] ?? null)
      : ((cursor.playId ? steps.find((s) => s.playId === cursor.playId) : undefined) ?? [...steps].reverse().find((s) => s.at <= cursor.at) ?? null);
  const follow = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = plotRef.current;
    if (!el || !plot) return;
    setCursor({ at: timeAt(e.clientX - el.getBoundingClientRect().left) });
  };
  // A press on the graph: with the cursor up, a tap (no drag) takes it away; a drag moves it. A mouse
  // just hovering moves it too — but not straight back after a tap took it away, until it leaves and returns.
  const press = useRef<{ x: number; y: number; clearing: boolean; moved: boolean } | null>(null);
  const hoverOff = useRef(false);
  const plotHandlers = compact
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          hoverOff.current = false;
          press.current = { x: e.clientX, y: e.clientY, clearing: cursor !== null, moved: false };
          if (cursor === null) follow(e);
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          const p = press.current;
          if (p) {
            if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
            p.moved = true;
            follow(e);
          } else if (e.pointerType === "mouse" && !hoverOff.current) follow(e);
        },
        onPointerUp: () => {
          const p = press.current;
          press.current = null;
          if (p?.clearing && !p.moved) {
            setCursor(null);
            hoverOff.current = true;
          }
        },
        onPointerCancel: () => {
          press.current = null;
        },
        onPointerLeave: (e: React.PointerEvent<HTMLDivElement>) => {
          if (e.pointerType === "mouse") hoverOff.current = false;
        },
      };
  // Anywhere off the graph takes the cursor away too.
  const rootRef = useRef<HTMLDivElement>(null);
  const cursorUp = cursor !== null;
  useEffect(() => {
    if (!cursorUp) return;
    const off = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setCursor(null);
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [cursorUp]);
  // The Red Zone shows the play by the cursor (a defense's points-allowed step is its play's).
  const cursorPlayId = cursor !== null && shownStep ? shownStep.playId.split(":")[0] : null;
  useEffect(() => {
    onCursorPlay?.(cursorPlayId ? { gameId: game.id, playId: cursorPlayId } : null);
  }, [cursorPlayId, game.id, onCursorPlay]);
  useEffect(() => () => onCursorPlay?.(null), [onCursorPlay]);

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
    <div ref={rootRef} className="flex h-full w-full min-w-0 flex-col bg-[var(--page)]">
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
        {...plotHandlers}
      >
        {plot && size ? (
          <svg width={size.width} height={size.height} className="absolute inset-0 overflow-visible" role="img" aria-label={`${player.name}'s fantasy points over the game`}>
            {/* The ground under the line: green while on pace, red while behind it. */}
            {pieces.map((p) => (
              <rect
                key={`${p.from}-${p.to}`}
                x={p.from}
                width={Math.max(0, p.to - p.from)}
                y={Math.min(y(p.value), baseline)}
                height={Math.abs(baseline - y(p.value))}
                className={fill(p.onPace)}
                fillOpacity={0.22}
              />
            ))}
            {/* Halftime: a thin column of etched lines. */}
            {ht ? (
              <g>
                <defs>
                  <pattern id={etchId} width={3} height={3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1={0} y1={0} x2={0} y2={3} className="stroke-ink-muted" strokeOpacity={0.55} strokeWidth={1} />
                  </pattern>
                </defs>
                <rect x={x(ht.from)} y={PAD.top} width={htWidth} height={plot.h} fill={`url(#${etchId})`} className="stroke-ink-muted" strokeOpacity={0.35} strokeWidth={0.75} />
              </g>
            ) : null}
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
              .map((q, i, shown) => (
                <g key={`q${q.period}`}>
                  <line x1={x(q.at)} x2={x(q.at)} y1={PAD.top} y2={PAD.top + plot.h} className="stroke-ink-muted" strokeOpacity={0.35} />
                  {/* Its label steps aside while the cursor's time is over it, or when it'd crowd the one before — the 3rd quarter's keeping its place. */}
                  {compact || (cursorAt !== null && Math.abs(x(q.at) + 8 - x(cursorAt)) < 30) ||
                  (i > 0 && q.period !== 3 && x(q.at) - x(shown[i - 1].at) < 24) ||
                  (shown[i + 1]?.period === 3 && x(shown[i + 1].at) - x(q.at) < 24) ? null : (
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
              <text key={`g${g.px}`} x={g.px} y={PAD.top + plot.h + 17} textAnchor="middle" className="fill-ink-muted text-[0.5625rem] opacity-60">
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
            {/* How much of the game they've been on pace (green) and behind it (red), up in the corner. */}
            {!compact && share ? (
              <g className="text-[0.625rem] font-semibold tabular-nums" paintOrder="stroke" stroke="var(--page)" strokeWidth={3}>
                <text x={PAD.left + 5} y={PAD.top + 11} className="fill-status-good">
                  {share.onPace}%
                </text>
                <text x={PAD.left + 5} y={PAD.top + 23} className="fill-status-critical">
                  {share.behind}%
                </text>
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

    </div>
  );
}

/** One graph to put up: the player, their game, and the scoring to draw it under. */
export interface GraphedPlayer {
  player: GroupedStarter;
  game: NFLGame;
  scoring?: Record<string, number>;
}

/**
 * Up to four players' graphs, filling the box they're given: one alone in
 * full, two stacked one over the other, three or four one to a corner — each
 * pared back (see PointsGraph's `compact`) once there's more than one.
 */
export function PointsGraphGrid({
  graphs,
  onClose,
  onCursorPlay,
}: {
  graphs: GraphedPlayer[];
  onClose: (playerId: string) => void;
  /** Told the play by the (one, full) graph's cursor — see PointsGraph. */
  onCursorPlay?: (play: { gameId: string; playId: string } | null) => void;
}) {
  return (
    <div
      className={`grid h-full w-full gap-x-3 gap-y-2 ${
        graphs.length === 1 ? "grid-cols-1 grid-rows-1" : graphs.length === 2 ? "grid-cols-1 grid-rows-2" : "grid-cols-2 grid-rows-2"
      }`}
    >
      {graphs.map(({ player, game, scoring }) => (
        <div key={`${game.id}-${player.playerId}`} className="min-h-0 min-w-0">
          <PointsGraph
            player={player}
            game={game}
            scoring={scoring}
            compact={graphs.length > 1}
            onClose={() => onClose(player.playerId)}
            onCursorPlay={graphs.length > 1 ? undefined : onCursorPlay}
          />
        </div>
      ))}
    </div>
  );
}
