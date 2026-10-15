"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GameStarters, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { cleanPlayText } from "@/lib/play-by-play";
import { pointsTimeline } from "@/lib/live-play-points";
import { gameWindows, leadPieces, Span, StarterPace, StarterTimeline, teamPace, teamTimeline, TeamStep } from "@/lib/matchup-timeline";
import { useGamePlays, withScoreboardPlay } from "@/hooks/useRedZoneFeed";
import { clock, GAME_MS, niceStep, quarterName, useLiveNow, useSize } from "./PointsGraph";

// Room around the plot for its labels, in px.
const PAD = { left: 30, right: 10, top: 14, bottom: 26 };
// The quiet stretch between two game windows, squeezed down to an etched column this wide.
const GAP_PX = 9;

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
 * ending on Sleeper's totals — through the week's game windows, the quiet
 * stretches between them squeezed into thin etched columns. The ground
 * between the lines is green wherever you lead, red wherever you trail, and
 * each team's projected pace (its starters' projections, each earned evenly
 * over their game) is dashed under it. Up in the corner, how much of the
 * week so far you've led and trailed. Drag or hover for a dotted cursor, left
 * where it's lifted, with the last scoring play by then described below; the
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
    return { lines, windows: gameWindows(spans) };
  }, [sides, gameOf, playsByGame, now, scoring]);

  const plotRef = useRef<HTMLDivElement>(null);
  const size = useSize(plotRef);
  const [cursor, setCursor] = useState<{ at: number; playId?: string } | null>(null);
  const etchId = `etch-${useId().replace(/:/g, "")}`;

  const { windows } = model;
  const start = windows[0]?.from ?? null;
  const end = windows[windows.length - 1]?.to ?? null;
  const started = weekGames.some((g) => g.state !== "pre");
  const over = weekGames.length > 0 && weekGames.every((g) => g.state === "post");
  // The lines run to now while games are on, to the last game's end once they're all over.
  const lineEnd = start === null || end === null || !started ? null : over ? end : Math.min(end, Math.max(start, now ?? start, ...model.lines.flatMap((l) => l.steps.map((s) => s.at))));

  const plot = size && start !== null && end !== null ? { w: Math.max(0, size.width - PAD.left - PAD.right), h: Math.max(0, size.height - PAD.top - PAD.bottom) } : null;
  const gaps = windows.length - 1;
  const playing = windows.reduce((sum, w) => sum + (w.to - w.from), 0);
  const perMs = plot && playing > 0 ? (plot.w - gaps * GAP_PX) / playing : 0;
  // Along the screen: each window evenly, the quiet between two a thin column.
  const x = (at: number) => {
    let px = PAD.left;
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (at <= w.to) return px + Math.max(0, at - w.from) * perMs;
      px += (w.to - w.from) * perMs;
      const next = windows[i + 1];
      if (!next) return px;
      if (at < next.from) return px + (GAP_PX * (at - w.to)) / (next.from - w.to);
      px += GAP_PX;
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
      const next = windows[i + 1];
      if (px < left + GAP_PX) return w.to + ((px - left) / GAP_PX) * (next.from - w.to);
      left += GAP_PX;
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

  // The axis: each window's start ("Sun 1:00", the day only when it changes) and the end ("~" while it's a guess).
  const marks: { at: number; label: string; anchor: "start" | "middle" | "end" }[] = [];
  if (plot && start !== null && end !== null) {
    const all: { at: number; label: string; anchor: "start" | "middle" | "end" }[] = [];
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const sameDay = i > 0 && new Date(windows[i - 1].from).toDateString() === new Date(w.from).toDateString();
      all.push({ at: w.from, label: sameDay ? clock(w.from) : dayClock(w.from), anchor: i === 0 ? "start" : "middle" });
    }
    all.push({ at: end, label: `${over ? "" : "~"}${clock(end)}`, anchor: "end" });
    // Each label's reach along the axis — about 5.6px a character — so none runs into the next.
    const reach = (m: (typeof all)[number]) => {
      const w = m.label.length * 5.6;
      const at = x(m.at);
      return m.anchor === "start" ? [at, at + w] : m.anchor === "end" ? [at - w, at] : [at - w / 2, at + w / 2];
    };
    for (const m of all) {
      const last = marks[marks.length - 1];
      if (last && reach(m)[0] - reach(last)[1] < 8) {
        // Crowded: the end always shows, in the one before's place.
        if (m.anchor === "end" && marks.length > 1) marks[marks.length - 1] = m;
        continue;
      }
      marks.push(m);
    }
  }

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
  const cursorAt = cursor?.at ?? null;

  const team = (side: MatchupSide, own: boolean) => (
    <span className="flex min-w-0 items-center gap-1.5">
      {/* The line's own look, as a key: yours solid and bright, theirs grey. */}
      <span aria-hidden className={`h-[2px] w-3 shrink-0 ${own ? "bg-ink-primary" : "bg-ink-muted"}`} />
      <span className={`min-w-0 truncate text-xs sm:text-sm ${own ? "text-ink-primary" : "text-ink-secondary"}`}>{side.name}</span>
      <span
        className={`shrink-0 px-1.5 text-xs font-bold tabular-nums sm:text-sm ${
          own ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "border border-ink-muted/60 text-ink-primary"
        }`}
      >
        {side.points.toFixed(2)}
      </span>
    </span>
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {/* The two teams and their totals. */}
      <div className="flex items-center justify-between gap-3 px-2 py-1.5">
        {team(mine, true)}
        {theirs ? team(theirs, false) : null}
      </div>

      <div ref={plotRef} className="relative min-h-[8rem] flex-1 touch-pan-y select-none" onPointerMove={follow} onPointerDown={follow}>
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
            {/* The quiet between game windows: thin columns of etched lines. */}
            <defs>
              <pattern id={etchId} width={3} height={3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={3} className="stroke-ink-muted" strokeOpacity={0.55} strokeWidth={1} />
              </pattern>
            </defs>
            {windows.slice(0, -1).map((w) => (
              <rect key={`gap${w.to}`} x={x(w.to)} y={PAD.top} width={GAP_PX} height={plot.h} fill={`url(#${etchId})`} className="stroke-ink-muted" strokeOpacity={0.35} strokeWidth={0.75} />
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
            {/* The clock along the bottom. */}
            {marks.map((m) => (
              <text key={`x${m.at}`} x={x(m.at)} y={PAD.top + plot.h + 17} textAnchor={m.anchor} className="fill-ink-muted text-[0.625rem] tabular-nums">
                {m.label}
              </text>
            ))}
            {/* Each team's projected pace. */}
            {model.lines.map((l, i) => (
              <path key={`pace${i}`} d={pacePath(l.paces)} fill="none" className={i === 0 ? "stroke-ink-primary" : "stroke-ink-muted"} strokeOpacity={i === 0 ? 0.45 : 0.6} strokeDasharray="4 3" />
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
              </g>
            ) : null}
          </svg>
        ) : null}
      </div>

      {/* The last scoring play by the cursor (the latest, before any drag) — a fixed height whatever it says. */}
      <div className="flex h-[2.75rem] shrink-0 gap-2 overflow-hidden border-t border-ink-muted/25 px-2 py-1 text-[0.6875rem] leading-snug">
        <p className="line-clamp-2 min-w-0 flex-1 text-ink-secondary">
          {shownEvent ? (
            <>
              <span className={shownEvent.mine ? "text-ink-primary" : "text-ink-muted"}>{shownEvent.name}</span> · {cleanPlayText(shownEvent.text)}
            </>
          ) : started ? (
            "No points yet"
          ) : start !== null ? (
            `Kicks off ${dayClock(start)}`
          ) : (
            ""
          )}
        </p>
        {shownEvent ? (
          <div className="flex shrink-0 flex-col items-end tabular-nums">
            <span className="text-ink-muted">{shownEvent.period > 0 ? `${quarterName(shownEvent.period)} ${shownEvent.clock}` : " "}</span>
            {/* Your points green, theirs red. */}
            <span className={shownEvent.mine ? "text-status-good" : "text-status-critical"}>
              {shownEvent.delta > 0 ? "+" : ""}
              {shownEvent.delta.toFixed(2)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
