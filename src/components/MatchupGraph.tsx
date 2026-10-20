"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GameStarters, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { cleanPlayText } from "@/lib/play-by-play";
import { pointsTimeline } from "@/lib/live-play-points";
import { gameWindows, leadPieces, Span, StarterPace, StarterTimeline, teamPace, teamTimeline, TeamStep } from "@/lib/matchup-timeline";
import { useGamePlays, withScoreboardPlay } from "@/hooks/useRedZoneFeed";
import { kickoffBlockLabel } from "@/lib/game-map";
import { clock, GAME_MS, niceStep, quarterName, useLiveNow, useSize } from "./PointsGraph";

// Room around the plot for its labels, in px.
const PAD = { left: 30, right: 10, top: 14, bottom: 26 };
// Room along the bottom once the time blocks' names go to two lines.
const STACKED_BOTTOM = 38;

/** One starter in a matchup: who, their points in the league so far, and their projection under its rules. */
export interface MatchupStarter {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  points: number;
  projected: number | null;
}

/** One side of a matchup. */
export interface MatchupSide {
  name: string;
  points: number;
  starters: MatchupStarter[];
}

/** "Sun 1:00" — the day, then the time without AM/PM. */
function dayClock(at: number): string {
  return `${new Date(at).toLocaleDateString("en-US", { weekday: "short" })} ${clock(at)}`;
}

/** A starter's game this week, and the time it takes up: kickoff to its last play — or, before it's over, to about when it should end. */
function gameSpan(game: NFLGame, lastPlayAt: number, now: number | null): Span {
  const kickoff = new Date(game.kickoff).getTime();
  if (game.state === "post") return { from: kickoff, to: Math.max(kickoff + 60_000, lastPlayAt) };
  return { from: kickoff, to: Math.max(kickoff + GAME_MS, lastPlayAt, now ?? 0) };
}

/**
 * A matchup's two team totals over the week, in the points graph's style:
 * your team's line (black, white in the dark) and theirs (grey), each every
 * starter's points added up play by play — scored under the league's rules,
 * ending on Sleeper's totals — through the week's game windows, set back to
 * back with the time between them cut out, a line where each starts. The ground
 * between the lines is green wherever you lead, red wherever you trail, and
 * each team's projected pace (its starters' projections, each earned evenly
 * over their game) is a dotted line under it. Up in the corner, how much of the
 * week so far you've led and trailed. Drag or hover for a dotted cursor, left
 * where it's lifted: each team's total at that moment shows by their name up
 * top (a dot where the cursor crosses their line), and the last scoring play
 * by then is described below; the
 * arrow keys step it a play at a time.
 */
export function MatchupGraph({
  mine,
  theirs,
  weekGames,
  scoring,
}: {
  mine: MatchupSide;
  theirs: MatchupSide | null;
  weekGames: NFLGame[];
  scoring?: Record<string, number>;
}) {
  const sides = useMemo(() => (theirs ? [mine, theirs] : [mine]), [mine, theirs]);
  // Every starter's game, and the games to follow plays in.
  const gameOf = useMemo(() => {
    const byTeam = new Map<string, NFLGame>();
    for (const g of weekGames) {
      byTeam.set(g.homeTeam, g);
      byTeam.set(g.awayTeam, g);
    }
    return (team: string | null) => (team ? byTeam.get(team) : undefined);
  }, [weekGames]);
  const followed = useMemo<GameStarters[]>(() => {
    const byGame = new Map<string, GameStarters>();
    for (const side of sides) {
      for (const s of side.starters) {
        const game = gameOf(s.team);
        if (!game) continue;
        const entry = byGame.get(game.id) ?? { game, players: [] };
        const asStarter: GroupedStarter = { playerId: s.playerId, name: s.name, position: s.position, team: s.team, leagueIds: [], points: s.points, pointsByLeague: {} };
        entry.players.push(asStarter);
        byGame.set(game.id, entry);
      }
    }
    return [...byGame.values()];
  }, [sides, gameOf]);
  const playsByGame = useGamePlays(followed);
  const live = weekGames.some((g) => g.state === "in");
  const now = useLiveNow(live);

  // Each team's line, its pace, and the windows the week's games take up.
  const model = useMemo(() => {
    const spans: Span[] = [];
    // When each kickoff time block began (Thursday night, Sunday noon, Sunday afternoon...), by its first game.
    const blockStarts = new Map<string, number>();
    const lines = sides.map((side) => {
      const timelines: StarterTimeline[] = [];
      const paces: StarterPace[] = [];
      for (const s of side.starters) {
        const game = gameOf(s.team);
        if (!game) continue;
        const plays = game.state === "pre" ? [] : withScoreboardPlay(game, playsByGame[game.id] ?? []);
        const lastPlayAt = Math.max(0, ...plays.map((p) => p.at ?? 0));
        const span = gameSpan(game, lastPlayAt, now);
        spans.push(span);
        const block = kickoffBlockLabel(game);
        blockStarts.set(block, Math.min(blockStarts.get(block) ?? Infinity, span.from));
        if (s.projected !== null && s.projected > 0) paces.push({ projected: s.projected, ...span });
        if (game.state === "pre") continue;
        const steps = pointsTimeline(plays, { playerId: s.playerId, name: s.name, position: s.position, team: s.team }, scoring, {
          home: game.homeTeam,
          away: game.awayTeam,
        });
        const fromPlays = steps.length > 0 ? steps[steps.length - 1].total : 0;
        const rest = Math.round((s.points - fromPlays) * 100) / 100;
        // What Sleeper has that no play accounts for comes in at the end of their game (or now, while it's on).
        const restAt = game.state === "post" ? span.to : Math.max(lastPlayAt, Math.min(now ?? lastPlayAt, span.to));
        timelines.push({ playerId: s.playerId, name: s.name, steps, makeUp: Math.abs(rest) >= 0.05 ? { at: restAt, delta: rest } : null });
      }
      return { steps: teamTimeline(timelines), paces };
    });
    return { lines, windows: gameWindows(spans), blockStarts: [...blockStarts.values()] };
  }, [sides, gameOf, playsByGame, now, scoring]);

  const plotRef = useRef<HTMLDivElement>(null);
  const size = useSize(plotRef);
  const [cursor, setCursor] = useState<{ at: number; playId?: string } | null>(null);

  const { windows } = model;
  const start = windows[0]?.from ?? null;
  const end = windows[windows.length - 1]?.to ?? null;
  const started = weekGames.some((g) => g.state !== "pre");
  const over = weekGames.length > 0 && weekGames.every((g) => g.state === "post");
  // The lines run to now while games are on, to the last game's end once they're all over.
  const lineEnd = start === null || end === null || !started ? null : over ? end : Math.min(end, Math.max(start, now ?? start, ...model.lines.flatMap((l) => l.steps.map((s) => s.at))));

  const plotW = size && start !== null && end !== null ? Math.max(0, size.width - PAD.left - PAD.right) : null;
  const playing = windows.reduce((sum, w) => sum + (w.to - w.from), 0);
  const perMs = plotW !== null && playing > 0 ? plotW / playing : 0;
  // Along the screen: the game windows back to back, the time between them cut out.
  const x = (at: number) => {
    let px = PAD.left;
    for (const w of windows) {
      if (at <= w.to) return px + Math.max(0, at - w.from) * perMs;
      px += (w.to - w.from) * perMs;
    }
    return px;
  };
  const timeAt = (px: number) => {
    let left = PAD.left;
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const width = (w.to - w.from) * perMs;
      if (px <= left + width || i === windows.length - 1) return Math.min(w.to, w.from + Math.max(0, px - left) / (perMs || 1));
      left += width;
    }
    return start ?? 0;
  };

  const myLine = useMemo(() => model.lines[0]?.steps ?? [], [model]);
  const theirLine = useMemo(() => model.lines[1]?.steps ?? [], [model]);
  const finals = [mine.points, theirs?.points ?? 0];
  const paceEnds = model.lines.map((l) => l.paces.reduce((sum, p) => sum + p.projected, 0));
  const values = [0, ...myLine.map((s) => s.total), ...theirLine.map((s) => s.total), ...finals, ...paceEnds];
  const step = niceStep(Math.max(10, Math.max(...values) - Math.min(...values)));
  const lo = Math.floor(Math.min(...values) / step) * step;
  const hi = Math.max(lo + step, Math.ceil(Math.max(...values, 10) / step) * step);
  const y = (v: number) => PAD.top + (plot ? (1 - (v - lo) / (hi - lo)) * plot.h : 0);
  const yTicks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);

  const linePath = (steps: TeamStep[]) => {
    if (!plot || lineEnd === null || start === null) return "";
    let d = `M${x(start)},${y(0)}`;
    for (const s of steps) if (s.at <= lineEnd) d += ` H${x(s.at)} V${y(s.total)}`;
    return `${d} H${x(lineEnd)}`;
  };
  // A pace line, through every starter's kickoff and finish.
  const pacePath = (paces: StarterPace[]) => {
    if (!plot || start === null || end === null || paces.length === 0) return "";
    const knots = [...new Set([start, end, ...windows.flatMap((w) => [w.from, w.to]), ...paces.flatMap((p) => [p.from, p.to])])].sort((a, b) => a - b);
    return knots.map((t, i) => `${i === 0 ? "M" : "L"}${x(t)},${y(teamPace(paces, t))}`).join(" ");
  };

  const pieces = theirs && lineEnd !== null && start !== null ? leadPieces(myLine, theirLine, start, lineEnd) : [];
  // How much of the week so far you've led and trailed, the quiet between games aside.
  const share = (() => {
    let led = 0;
    let trailed = 0;
    for (const p of pieces) {
      let inPlay = 0;
      for (const w of windows) inPlay += Math.max(0, Math.min(p.to, w.to) - Math.max(p.from, w.from));
      if (p.lead === true) led += inPlay;
      else if (p.lead === false) trailed += inPlay;
    }
    if (led + trailed <= 0) return null;
    const lead = Math.round((led / (led + trailed)) * 100);
    return { lead, trail: 100 - lead };
  })();

  // The week in time blocks — every kickoff window (Thursday night, Sunday noon, Sunday afternoon...) a band of
  // its own, from its first kickoff (or the start of a game window) to the next — each named along the bottom.
  const bands: Span[] = (() => {
    if (start === null || end === null) return [];
    const starts = [...new Set([...windows.map((w) => w.from), ...model.blockStarts])].filter((t) => t >= start && t < end).sort((p, q) => p - q);
    return starts.map((from, i) => ({ from, to: starts[i + 1] ?? end }));
  })();
  type Mark = { at: number; day: string; time: string; anchor: "start" | "middle" | "end" };
  const weekday = (at: number) => new Date(at).toLocaleDateString("en-US", { weekday: "short" });
  const allMarks: Mark[] = [
    ...bands.map((b, i): Mark => ({ at: b.from, day: weekday(b.from), time: clock(b.from), anchor: i === 0 ? "start" : "middle" })),
  ];
  // Each label's reach along the axis — about 5.6px a character — one line ("Sun 1:00") or two (the day over the time).
  const reach = (m: Mark, stacked: boolean) => {
    const w = (stacked ? Math.max(m.day.length, m.time.length) : m.day.length + 1 + m.time.length) * 5.6;
    const at = x(m.at);
    return m.anchor === "start" ? [at, at + w] : m.anchor === "end" ? [at - w, at] : [at - w / 2, at + w / 2];
  };
  const collides = (marks: Mark[], stacked: boolean) => marks.some((m, i) => i > 0 && reach(m, stacked)[0] - reach(marks[i - 1], stacked)[1] < 6);
  // Any two crowding each other on one line: every label goes to two, the day over the time.
  const stacked = plotW !== null && collides(allMarks, false);
  // Still crowded on two lines: the later one gives way.
  const marks: Mark[] = [];
  if (plotW !== null) {
    for (const m of allMarks) {
      const last = marks[marks.length - 1];
      if (last && reach(m, stacked)[0] - reach(last, stacked)[1] < 6) {
        continue;
      }
      marks.push(m);
    }
  }
  const plot = plotW !== null && size ? { w: plotW, h: Math.max(0, size.height - PAD.top - (stacked ? STACKED_BOTTOM : PAD.bottom)) } : null;

  // Every scoring moment, both teams', in order — for the cursor and the arrow keys.
  const events = useMemo(
    () => [...myLine.map((s) => ({ ...s, mine: true })), ...theirLine.map((s) => ({ ...s, mine: false }))].sort((a, b) => a.at - b.at),
    [myLine, theirLine]
  );
  // Before any drag, the latest play — not a starter's unaccounted-for remainder.
  const latestPlay = [...events].reverse().find((e) => !e.playId.endsWith(":rest")) ?? events[events.length - 1] ?? null;
  const shownEvent =
    cursor === null
      ? latestPlay
      : ((cursor.playId ? events.find((e) => `${e.mine}-${e.playId}` === cursor.playId) : undefined) ??
        [...events].reverse().find((e) => e.at <= cursor.at) ??
        null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || events.length === 0) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      const i = shownEvent ? events.indexOf(shownEvent) : -1;
      const onEvent = cursor === null || (shownEvent !== null && (cursor.playId === `${shownEvent.mine}-${shownEvent.playId}` || cursor.at === shownEvent.at));
      const next =
        e.key === "ArrowLeft"
          ? i < 0
            ? null
            : events[onEvent ? Math.max(0, i - 1) : i]
          : cursor === null
            ? events[events.length - 1]
            : events[Math.min(events.length - 1, i + 1)];
      if (next) setCursor({ at: next.at, playId: `${next.mine}-${next.playId}` });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [events, cursor, shownEvent]);
  const follow = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = plotRef.current;
    if (!el || !plot) return;
    setCursor({ at: timeAt(e.clientX - el.getBoundingClientRect().left) });
  };
  // A press on the graph, as on the player graphs: with the cursor up, a tap (no drag) takes it away; a drag
  // moves it. A mouse just hovering moves it too — but not straight back after a tap took it away, until it
  // leaves and returns.
  const press = useRef<{ x: number; y: number; clearing: boolean; moved: boolean } | null>(null);
  const hoverOff = useRef(false);
  const plotHandlers = {
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
  const cursorAt = cursor?.at ?? null;
  // Each team's total at the cursor's time — shown by the team's name, a dot where the cursor crosses each
  // line. At or past the lines' end, the totals as they stand.
  const cursorTotals = (() => {
    if (cursorAt === null || lineEnd === null || !plot || cursorAt >= lineEnd) return null;
    const totalAt = (steps: TeamStep[]) => {
      let v = 0;
      for (const st of steps) if (st.at <= cursorAt) v = st.total;
      return v;
    };
    return { mine: totalAt(myLine), theirs: theirs ? totalAt(theirLine) : null };
  })();

  const team = (side: MatchupSide, own: boolean, value: number) => (
    <span className="flex min-w-0 items-center gap-1.5">
      {/* The line's own look, as a key: yours solid and bright, theirs grey. */}
      <span aria-hidden className={`h-[2px] w-3 shrink-0 ${own ? "bg-ink-primary" : "bg-ink-muted"}`} />
      <span className={`min-w-0 truncate text-xs sm:text-sm ${own ? "text-ink-primary" : "text-ink-secondary"}`}>{side.name}</span>
      <span
        className={`shrink-0 px-1.5 text-xs font-bold tabular-nums sm:text-sm ${
          own ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "border border-ink-muted/60 text-ink-primary"
        }`}
      >
        {value.toFixed(2)}
      </span>
    </span>
  );

  return (
    <div ref={rootRef} className="flex h-full w-full min-w-0 flex-col">
      {/* The two teams and their totals — at the cursor's moment while it's on the lines. */}
      <div className="flex items-center justify-between gap-3 px-2 py-1.5">
        {team(mine, true, cursorTotals?.mine ?? mine.points)}
        {theirs ? team(theirs, false, cursorTotals?.theirs ?? theirs.points) : null}
      </div>

      <div ref={plotRef} className="relative min-h-[8rem] flex-1 touch-pan-y select-none" {...plotHandlers}>
        {plot && size && start !== null && end !== null ? (
          <svg width={size.width} height={size.height} className="absolute inset-0 overflow-visible" role="img" aria-label="Both teams' points over the week">
            {/* Green between the lines wherever you lead, red wherever you trail. */}
            {pieces.map((p) =>
              p.lead === null ? null : (
                <rect
                  key={`${p.from}-${p.to}`}
                  x={x(p.from)}
                  width={Math.max(0, x(p.to) - x(p.from))}
                  y={y(Math.max(p.mine, p.theirs))}
                  height={Math.abs(y(p.mine) - y(p.theirs))}
                  className={p.lead ? "fill-status-good" : "fill-status-critical"}
                  fillOpacity={0.22}
                />
              )
            )}
            {/* Every time block a band of its own, a line where each begins. */}
            {bands.slice(1).map((band) => (
              <line key={`band${band.from}`} x1={x(band.from)} x2={x(band.from)} y1={PAD.top} y2={PAD.top + plot.h} className="stroke-ink-muted" strokeOpacity={0.35} />
            ))}
            {/* The points axis. */}
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PAD.left} x2={PAD.left + plot.w} y1={y(v)} y2={y(v)} className="stroke-ink-muted" strokeOpacity={v === 0 ? 0.45 : 0.15} strokeWidth={1} />
                <text x={PAD.left - 5} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[0.625rem] tabular-nums">
                  {v}
                </text>
              </g>
            ))}
            {/* Each time block named along the bottom: "Sun 1:00", or — crowded — the day over the time. */}
            {marks.map((m) => (
              <text key={`x${m.at}`} x={x(m.at)} y={PAD.top + plot.h + 17} textAnchor={m.anchor} className="fill-ink-muted text-[0.625rem] tabular-nums">
                {stacked ? (
                  <>
                    <tspan x={x(m.at)}>{m.day}</tspan>
                    <tspan x={x(m.at)} dy="1.15em">
                      {m.time}
                    </tspan>
                  </>
                ) : (
                  `${m.day} ${m.time}`
                )}
              </text>
            ))}
            {/* Each team's projected pace: a run of round dots, so it never reads as one of the solid score lines. */}
            {model.lines.map((l, i) => (
              <path
                key={`pace${i}`}
                d={pacePath(l.paces)}
                fill="none"
                className={i === 0 ? "stroke-ink-primary" : "stroke-ink-muted"}
                strokeOpacity={i === 0 ? 0.6 : 0.75}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeDasharray="0 4"
              />
            ))}
            {/* The lines themselves: theirs under, yours on top. */}
            {theirs ? <path d={linePath(theirLine)} fill="none" className="stroke-ink-muted" strokeWidth={1.75} /> : null}
            <path d={linePath(myLine)} fill="none" className="stroke-ink-primary" strokeWidth={1.75} />
            {live && lineEnd !== null ? (
              <>
                {theirs ? <circle cx={x(lineEnd)} cy={y(theirLine[theirLine.length - 1]?.total ?? 0)} r={2.5} className="animate-pulse fill-ink-muted" /> : null}
                <circle cx={x(lineEnd)} cy={y(myLine[myLine.length - 1]?.total ?? 0)} r={2.5} className="animate-pulse fill-ink-primary" />
              </>
            ) : null}
            {/* How much of the week you've led (green) and trailed (red). */}
            {share ? (
              <g className="text-[0.625rem] font-semibold tabular-nums" paintOrder="stroke" stroke="var(--page)" strokeWidth={3}>
                <text x={PAD.left + 5} y={PAD.top + 11} className="fill-status-good">
                  {share.lead}%
                </text>
                <text x={PAD.left + 5} y={PAD.top + 23} className="fill-status-critical">
                  {share.trail}%
                </text>
              </g>
            ) : null}
            {/* The cursor, left where it's lifted, with the time there. */}
            {cursorAt !== null ? (
              <g>
                <line x1={x(cursorAt)} x2={x(cursorAt)} y1={PAD.top} y2={PAD.top + plot.h} className="stroke-ink-primary" strokeWidth={1} strokeDasharray="2 2" />
                <text
                  x={Math.min(Math.max(x(cursorAt), PAD.left + 24), PAD.left + plot.w - 24)}
                  y={PAD.top - 4}
                  textAnchor="middle"
                  className="fill-ink-primary text-[0.5625rem] font-semibold tabular-nums"
                  paintOrder="stroke"
                  stroke="var(--page)"
                  strokeWidth={3}
                >
                  {dayClock(cursorAt)}
                </text>
                {/* Where it crosses each line (the totals there are up by the teams' names). */}
                {cursorTotals ? (
                  <>
                    {cursorTotals.theirs !== null ? <circle cx={x(cursorAt)} cy={y(cursorTotals.theirs)} r={2.5} className="fill-ink-muted" /> : null}
                    <circle cx={x(cursorAt)} cy={y(cursorTotals.mine)} r={2.5} className="fill-ink-primary" />
                  </>
                ) : null}
              </g>
            ) : null}
          </svg>
        ) : null}
      </div>

      {/* The last scoring play by the cursor (the latest, before any drag), in full. Every play's description
          sits in the same spot, all but the shown one invisible, so the box is as tall as the longest
          and never changes size as the cursor moves. */}
      <div className="flex shrink-0 gap-2 border-t border-ink-muted/25 px-2 py-1 text-[0.6875rem] leading-snug">
        <div className="grid min-w-0 flex-1 text-ink-secondary">
          {events.map((e) => (
            <p key={`${e.mine}-${e.playId}`} className={`col-start-1 row-start-1 ${e === shownEvent ? "" : "invisible"}`} aria-hidden={e !== shownEvent}>
              <span className={e.mine ? "text-ink-primary" : "text-ink-muted"}>{e.name}</span> · {cleanPlayText(e.text)}
            </p>
          ))}
          <p className={`col-start-1 row-start-1 ${shownEvent ? "invisible" : ""}`} aria-hidden={!!shownEvent}>
            {started ? "No points yet" : start !== null ? `Kicks off ${dayClock(start)}` : "\u00a0"}
          </p>
        </div>
        {/* Two lines whatever's shown, so the box keeps its height. */}
        <div className="flex shrink-0 flex-col items-end tabular-nums">
          <span className="text-ink-muted">{shownEvent && shownEvent.period > 0 ? `${quarterName(shownEvent.period)} ${shownEvent.clock}` : "\u00a0"}</span>
          {/* Your points green, theirs red. */}
          <span className={shownEvent?.mine ? "text-status-good" : "text-status-critical"}>
            {shownEvent ? `${shownEvent.delta > 0 ? "+" : ""}${shownEvent.delta.toFixed(2)}` : "\u00a0"}
          </span>
        </div>
      </div>
    </div>
  );
}
