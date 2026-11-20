"use client";

import { useLayoutEffect, useState } from "react";
import { nflLogoUrl } from "@/lib/nfl-logos";

// A player's card's charts (see PlayerStage), on the back wall: his fantasy points game by game as a line, his stats
// game by game as rows of bars under it (see WallLine) — or his value over time (see ValueLine).

/** A game of his (or a season), as the charts draw it: its points — null for a week he didn't play (or hasn't yet) —
 * its stats, and how it's read out. */
export interface ChartGame {
  key: string;
  /** Under the line's x axis: the week (or the year). */
  tag: string;
  value: number | null;
  /** Its stat line, in Sleeper's keys — none for a week he didn't play. */
  stats?: Record<string, number> | null;
  /** What he was projected for it (a week he played), drawn faintly by his points. */
  projected?: number | null;
  label: string;
  /** A week still to come this season (nothing to draw for it yet). */
  future?: boolean;
  /** His team's bye: nothing to draw, his line running on across it. */
  bye?: boolean;
  /** A game his team played that he didn't: counted as none (`value` 0), marked as missed. */
  missed?: boolean;
  /** Who he played (or plays) that week: their logo under it. */
  opponent?: string | null;
}

/** Keeps track of an element's size, and where it is across the screen. */
function useBox(el: Element | null) {
  const [box, setBox] = useState<{ left: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((was) => (was && was.left === r.left && was.width === r.width && was.height === r.height ? was : { left: r.left, width: r.width, height: r.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    // The stage may still be sliding into place.
    const late = window.setTimeout(measure, 400);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(late);
    };
  }, [el]);
  return box;
}

/** A stat the rows of bars show: its name and its key in a game's stats. */
export interface ChartStat {
  label: string;
  key: string;
}

/** The widest a game's slot is, however few games there are. */
const MOST_COLUMN = 72;

/** How much of the wall the points line takes, over the stats' rows; room over it for the best week's points; the least
 * it's drawn in (px); and the gap between it and the rows. */
const LINE_SHARE = 0.25;
const LINE_TOP_PX = 22;
const LINE_LEAST_PX = 48;
const ROWS_GAP_PX = 6;

/**
 * His fantasy points as a line across the back wall: a slot along the x axis for every game of the season (all 18
 * weeks, those to come too — or every season of his), as wide as lets them all fit (up to MOST_COLUMN), centered, the
 * y axis his points, a dot on each game he played — a cross
 * at none on a game he missed — all joined in one line, on across his byes; its points over it, his best starred, a
 * faint ring at what he was projected, and under each week's number his opponent's logo. Under it all, a row for each
 * of his `stats` (see ChartStat): a stepped line, flat across each game's slot at what he had of it (against his best
 * at it) and straight up or down to the next at the slots' edge — at none for a game he missed, a faint dashed line
 * across his byes — the stat's name at its left, the rows sharing the three quarters of the wall under the line
 * (LINE_SHARE). Fills the room it's given on the wall; never reaches the floor.
 */
export function WallLine({ games, label, stats = [] }: { games: ChartGame[]; label: string; stats?: ChartStat[] }) {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const box = useBox(svg);
  const w = box?.width ?? 0;
  const h = box?.height ?? 0;
  const n = games.length;
  // Room at the left for the y axis's numbers (and the rows' names).
  const left = 34;
  // Each game's slot: as wide as fits them all right of it, up to the most.
  const col = Math.max(8, Math.min(MOST_COLUMN, (w - left) / Math.max(1, n)));
  // Each week's opponent's logo under its number, as big as its slot lets it be.
  const logo = Math.max(9, Math.min(16, col - 6));
  const faced = games.some((g) => g.opponent);
  // The points line along the top, about a quarter of the wall (no less than leaves it LINE_LEAST_PX to draw in), its
  // weeks and who he faced under it; the rows of stats sharing the rest, down to the wall's foot.
  const axis = faced ? 18 + logo + 4 : 18;
  const lineBlock = stats.length > 0 ? Math.min(h, Math.max(LINE_TOP_PX + LINE_LEAST_PX + axis + ROWS_GAP_PX, h * LINE_SHARE)) : h;
  const rowH = stats.length > 0 ? Math.max(14, (h - lineBlock) / stats.length) : 0;
  const rowsTop = h - rowH * stats.length;
  const pad = { left: 26, right: 0, top: LINE_TOP_PX, bottom: axis + (h - rowsTop) + (stats.length > 0 ? ROWS_GAP_PX : 0) };
  const most = Math.max(5, ...games.map((g) => Math.max(g.value ?? 0, g.value !== null ? (g.projected ?? 0) : 0)));
  const top = Math.ceil(most / 5) * 5;
  const best = Math.max(...games.map((g) => g.value ?? -1));
  // Game i's slot: the slots all centered right of the y axis's numbers.
  const x = (i: number) => left + (w - left) / 2 + (i - (n - 1) / 2) * col;
  const y = (v: number) => pad.top + (h - pad.top - pad.bottom) * (1 - v / top);
  // The line, through every game with points (a game he missed at none), on across his byes.
  const runs: [number, number][][] = [games.flatMap((g, i): [number, number][] => (g.value === null ? [] : [[x(i), y(g.value)]]))];
  const ticks = [0, top / 2, top];
  // Each dot's points over it: to the tenth where there's the room, else whole.
  const tenths = col >= 26;
  const stroke = { stroke: "var(--page)", strokeWidth: 3, paintOrder: "stroke" as const };
  return (
    <svg ref={setSvg} role="group" aria-label={label} className="absolute inset-0 block h-full w-full select-none overflow-visible">
      {w > 0 && h > 0 ? (
        <>
          {/* The y axis, its points, and a faint line across at each — under the games. */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={Math.min(pad.left, x(0) - col / 2)} x2={Math.max(w, x(n - 1) + col / 2)} y1={y(t)} y2={y(t)} stroke="var(--ink-primary)" strokeOpacity={t === 0 ? 0.5 : 0.12} />
              <text x={x(0) - col / 2 - 4} y={y(t) + 3} textAnchor="end" className="fill-[var(--ink-muted)] text-[0.5625rem] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          <line x1={x(0) - col / 2} x2={x(0) - col / 2} y1={pad.top} y2={h - pad.bottom} stroke="var(--ink-primary)" strokeOpacity={0.5} />
          {/* The x axis: a slot for every game. */}
          {games.map((g, i) => (
            <text
              key={g.key}
              x={x(i)}
              y={h - pad.bottom + 12}
              textAnchor="middle"
              className="fill-[var(--ink-muted)] text-[0.5625rem] tabular-nums"
            >
              {g.tag}
            </text>
          ))}
          {/* Under each week, who he played. */}
          {games.map((g, i) =>
            g.opponent ? (
              <image key={`${g.key}-faced`} href={nflLogoUrl(g.opponent)} x={x(i) - logo / 2} y={h - pad.bottom + 16} width={logo} height={logo} opacity={0.85} aria-hidden />
            ) : null
          )}
          {/* What he was projected each week he played: a faint ring, over or under his points. */}
          {games.map((g, i) =>
            g.value !== null && g.projected != null ? (
              <circle key={`${g.key}-projected`} cx={x(i)} cy={y(Math.max(0, g.projected))} r={2.75} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.35} strokeWidth={1.25} pointerEvents="none" />
            ) : null
          )}
          {/* A row for each stat: a stepped line, flat across each game's slot at its level. */}
          {stats.map((stat, r) => {
            const foot = rowsTop + (r + 1) * rowH - 2;
            const tallest = rowH - 6;
            const valueOf = (g: ChartGame) => (g.stats && Number.isFinite(g.stats[stat.key]) ? g.stats[stat.key] : 0);
            const most = Math.max(0, ...games.map((g) => (g.stats ? valueOf(g) : 0)));
            return (
              <g key={stat.key} aria-hidden>
                <line x1={x(0) - col / 2} x2={x(n - 1) + col / 2} y1={foot} y2={foot} stroke="var(--ink-primary)" strokeOpacity={0.15} />
                <text x={x(0) - col / 2 - 4} y={foot - 1} textAnchor="end" className="fill-[var(--ink-muted)] text-[0.5rem] font-bold uppercase">
                  {stat.label}
                </text>
                {(() => {
                  // Each game's level: what he had of it (none, a game he missed); none to draw for a bye or one to come.
                  const level = (g: ChartGame) => (g.stats ? foot - (most > 0 ? (tallest * Math.max(0, valueOf(g))) / most : 0) : g.missed ? foot : null);
                  let d = "";
                  let byes = "";
                  // The last game drawn: where its step ended, and whether a bye's come since.
                  let last: { x: number; y: number; gap: boolean } | null = null;
                  games.forEach((g, i) => {
                    const at = level(g);
                    if (at === null) {
                      if (last) last.gap = true;
                      // Nothing past a week still to come.
                      if (g.future) last = null;
                      return;
                    }
                    const [from, to] = [x(i) - col / 2, x(i) + col / 2];
                    if (last?.gap) {
                      // Across his bye: faint and dashed, from the last game's step to this one's.
                      byes += `M${last.x.toFixed(1)},${last.y.toFixed(1)}L${from.toFixed(1)},${at.toFixed(1)}`;
                      d += `M${from.toFixed(1)},${at.toFixed(1)}`;
                    } else {
                      // Straight up or down from the last game's level at the slots' edge (or the first step).
                      d += last === null ? `M${from.toFixed(1)},${at.toFixed(1)}` : `V${at.toFixed(1)}`;
                    }
                    d += `H${to.toFixed(1)}`;
                    last = { x: to, y: at, gap: false };
                  });
                  return (
                    <>
                      <path d={d} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.55} strokeWidth={1.25} strokeLinejoin="miter" />
                      {byes ? <path d={byes} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="2 2" /> : null}
                    </>
                  );
                })()}
              </g>
            );
          })}
          {runs.map((run, k) => (
            <polyline
              key={k}
              points={run.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}
              fill="none"
              stroke="var(--ink-primary)"
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {/* Each game he played: a dot (a cross at none, one he missed), its points over it, his best starred. */}
          {games.map((g, i) => {
            if (g.value === null) return null;
            const starred = g.value === best && best > 0;
            return (
              <g key={g.key} aria-label={g.label} role="img">
                {g.missed ? (
                  <path d={`M${x(i) - 3.5},${y(0) - 3.5}l7,7m0,-7l-7,7`} stroke="var(--ink-primary)" strokeOpacity={0.7} strokeWidth={1.5} strokeLinecap="round" />
                ) : (
                  <circle cx={x(i)} cy={y(g.value)} r={2.75} fill="var(--page)" stroke="var(--ink-primary)" strokeWidth={1.5} />
                )}
                <text
                  x={x(i)}
                  y={y(g.value) - 7}
                  textAnchor="middle"
                  {...stroke}
                  className={`text-[0.5625rem] tabular-nums ${starred ? "fill-[var(--ink-primary)] font-bold" : "fill-[var(--ink-secondary)] font-semibold"}`}
                >
                  {starred && tenths ? "★" : ""}
                  {tenths ? g.value.toFixed(1) : Math.round(g.value)}
                </text>
              </g>
            );
          })}
        </>
      ) : null}
    </svg>
  );
}

/**
 * A player's KTC value over time as a line across the back wall: from when KTC first listed him to now (`points`, a
 * value — or nothing — at each day), on a scale from nothing up to his highest, its grades (a value's hundreds) up the
 * y axis, years along the x axis, his highest and his value now marked. Fills the room it's given.
 */
export function ValueLine({ points, label }: { points: { day: number; value: number }[]; label: string }) {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const box = useBox(svg);
  const w = box?.width ?? 0;
  const h = box?.height ?? 0;
  const pad = { left: 26, right: 30, top: 18, bottom: 18 };
  const grade = (v: number) => Math.floor(v / 100);
  if (points.length < 2) {
    return (
      <svg ref={setSvg} className="absolute inset-0 h-full w-full" aria-label={label}>
        <text x={8} y={20} className="fill-[var(--ink-muted)] text-xs">
          No value history for him yet.
        </text>
      </svg>
    );
  }
  const [first, last] = [points[0].day, points[points.length - 1].day];
  const top = Math.max(10, Math.ceil(Math.max(...points.map((p) => grade(p.value))) / 10) * 10);
  const x = (day: number) => pad.left + ((day - first) / Math.max(1, last - first)) * (w - pad.left - pad.right);
  const y = (v: number) => pad.top + (h - pad.top - pad.bottom) * (1 - v / 100 / top);
  const ticks = [0, top / 2, top];
  // A tick at the start of each year between.
  const years: { day: number; year: number }[] = [];
  for (let yr = new Date(first * 86400000).getUTCFullYear() + 1; ; yr++) {
    const day = Date.UTC(yr, 0, 1) / 86400000;
    if (day > last) break;
    years.push({ day, year: yr });
  }
  const highest = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]);
  const now = points[points.length - 1];
  const stroke = { stroke: "var(--page)", strokeWidth: 3, paintOrder: "stroke" as const };
  return (
    <svg ref={setSvg} role="img" aria-label={label} className="absolute inset-0 block h-full w-full overflow-visible">
      {w > 0 && h > 0 ? (
        <>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={w - pad.right} y1={y(t * 100)} y2={y(t * 100)} stroke="var(--ink-primary)" strokeOpacity={t === 0 ? 0.5 : 0.12} />
              <text x={pad.left - 4} y={y(t * 100) + 3} textAnchor="end" className="fill-[var(--ink-muted)] text-[0.5625rem] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={h - pad.bottom} stroke="var(--ink-primary)" strokeOpacity={0.5} />
          {years.map((yr) => (
            <g key={yr.year}>
              <line x1={x(yr.day)} x2={x(yr.day)} y1={pad.top} y2={h - pad.bottom} stroke="var(--ink-primary)" strokeOpacity={0.08} />
              <text x={x(yr.day)} y={h - pad.bottom + 12} textAnchor="middle" className="fill-[var(--ink-muted)] text-[0.5625rem] tabular-nums">
                {yr.year}
              </text>
            </g>
          ))}
          <polyline
            points={points.map((p) => `${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--ink-primary)"
            strokeWidth={1.75}
            strokeLinejoin="round"
          />
          {/* His highest, and his value now. */}
          <circle cx={x(highest.day)} cy={y(highest.value)} r={3} fill="var(--page)" stroke="var(--ink-primary)" strokeWidth={1.5} />
          <text x={x(highest.day)} y={y(highest.value) - 7} textAnchor="middle" {...stroke} className="fill-[var(--ink-primary)] text-[0.625rem] font-bold tabular-nums">
            ★ {grade(highest.value)}
          </text>
          <circle cx={x(now.day)} cy={y(now.value)} r={4} fill="var(--ink-primary)" />
          <text x={x(now.day) + 7} y={y(now.value) + 3} {...stroke} className="fill-[var(--ink-primary)] text-[0.6875rem] font-extrabold tabular-nums">
            {grade(now.value)}
          </text>
        </>
      ) : null}
    </svg>
  );
}
