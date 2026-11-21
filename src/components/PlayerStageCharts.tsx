"use client";

import { useId, useLayoutEffect, useState } from "react";
import { nflLogoUrl } from "@/lib/nfl-logos";
import type { StatTier } from "@/lib/stat-tiers";

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
  /** What he was projected for it (a week he played, or one still to come), drawn faintly by his points. */
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

/** Keeps track of an element's size (its own px, however much bigger a zoom around it draws it), and where it is across the screen. */
function useBox(el: Element | null) {
  const [box, setBox] = useState<{ left: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const [width, height] = [el.clientWidth || r.width, el.clientHeight || r.height];
      setBox((was) => (was && was.left === r.left && was.width === width && was.height === height ? was : { left: r.left, width, height }));
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

/** How far in from the wall's edges the first and last games' slots start (px). */
const EDGE_PX = 4;
/** The room kept between one stat's row and the next (px). */
const ROW_SPACE_PX = 8;

/** How much of the wall the points line takes, over the stats' rows (its logos and weeks over it included); the least
 * it's drawn in (px); and the gap between it and the rows. */
const LINE_SHARE = 0.25;
const LINE_LEAST_PX = 48;
const ROWS_GAP_PX = 6;
/** The sizes the numbers on the line, the rows and the weeks are drawn at, least and most — as big as their week's slot
 * lets them be; and a character's width in the app's monospaced font, a share of its size. */
const POINTS_PX = [10, 13] as const;
const STAT_PX = [9, 12] as const;
const WEEK_PX = [9, 13] as const;
const CHAR = 0.6;
const between = ([least, most]: readonly [number, number], v: number) => Math.min(most, Math.max(least, v));
/** The shortest stretch of the points line drawn between two numbers (px). */
const LEAST_STRETCH_PX = 5;

/** How strong a step's fill is in its grade's color at the row's foot (see WallLine's `grade`), and how far up the step
 * it's faded to none. */
const GRADE_FILL = 0.25;
const GRADE_REACH = 0.5;
const GRADE_COLOR: Record<StatTier, string> = { good: "var(--status-good)", mid: "var(--status-warning)", bad: "var(--status-critical)" };

/** A stat's number as it's shown on its row: whole, or to the tenth. */
const statText = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

/**
 * His fantasy points as a line across the back wall: a slot for every game of the season (all 18 weeks, those to come
 * too — or every season of his), across the whole wall, a little in from its edges (EDGE_PX), along the top his
 * opponent's logo each week and the week under it; his points written where each game's point is (his best bold), all
 * joined in one line that stops short of each number (on across his byes, at none for a game he missed), a faint ring
 * at what he was projected. Under it, a row for each of his `stats` (see ChartStat): a stepped line, flat across each
 * game's slot at what he had of it (against his best at it), its number over it, and straight up or down to the next at
 * the slots' edge — at none for a game he missed, nothing across his byes — a little room kept between one
 * row and the next (ROW_SPACE_PX). The stats' names aren't drawn (no room's been found for them that wouldn't take
 * any from the rows); a row's name shows over it on hover, and is read out. The line takes about a quarter of the wall
 * (LINE_SHARE), the rows the rest. With `grade` (how good a game's stat was), each game's step is filled down to its
 * row's foot in a faint wash of its grade's color — green, yellow or red — gone halfway up it. Fills the room it's given on the wall; never
 * reaches the floor.
 */
export function WallLine({
  games,
  label,
  stats = [],
  grade,
}: {
  games: ChartGame[];
  label: string;
  stats?: ChartStat[];
  grade?: (key: string, value: number) => StatTier | null;
}) {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const box = useBox(svg);
  const w = box?.width ?? 0;
  const h = box?.height ?? 0;
  const n = games.length;
  // Each game's slot: the whole wall shared between them, a little in from its edges.
  const col = Math.max(8, (w - 2 * EDGE_PX) / Math.max(1, n));
  const x = (i: number) => EDGE_PX + (i + 0.5) * col;
  // The numbers as big as their slots let them be: the weeks', his points', his stats'.
  const weekPx = between(WEEK_PX, (col - 2) / (Math.max(2, ...games.map((g) => g.tag.length)) * CHAR));
  const pointsPx = between(POINTS_PX, col * 0.5);
  const statPx = between(STAT_PX, col * 0.46);
  // Along the top: each week's opponent's logo, as big as its slot lets it be, and the week under it.
  const logo = Math.max(9, Math.min(18, col - 6));
  const faced = games.some((g) => g.opponent);
  const weekY = (faced ? logo + 3 : 0) + weekPx;
  const header = weekY + 4;
  // The points line, about a quarter of the wall (no less than leaves it LINE_LEAST_PX to draw in); the rows of stats
  // sharing the rest, down to the wall's foot.
  const lineBlock = stats.length > 0 ? Math.min(h, Math.max(header + LINE_LEAST_PX + ROWS_GAP_PX, h * LINE_SHARE)) : h;
  const rowH = stats.length > 0 ? Math.max(14, (h - lineBlock) / stats.length) : 0;
  const rowsTop = h - rowH * stats.length;
  // His points, from none at the line's foot to his most at its top — room over and under for their numbers.
  const plotTop = header + pointsPx;
  const plotBottom = (stats.length > 0 ? rowsTop - ROWS_GAP_PX : h) - pointsPx * 0.6;
  const most = Math.max(5, ...games.map((g) => Math.max(g.value ?? 0, g.projected ?? 0)));
  const best = Math.max(...games.map((g) => g.value ?? -1));
  const y = (v: number) => plotTop + Math.max(0, plotBottom - plotTop) * (1 - v / most);
  // Each game's points: to the tenth where there's the room, else whole.
  const tenths = col >= 4 * pointsPx * CHAR + 2;
  const pointsText = (v: number) => (tenths ? v.toFixed(1) : `${Math.round(v)}`);
  // The games with points, in order (a game he missed at none), joined one to the next — each stretch stopping short
  // of the numbers at its ends, so it never runs through them.
  const points = games.flatMap((g, i) => (g.value === null ? [] : [{ x: x(i), y: y(g.value), half: (pointsText(g.value).length * pointsPx * CHAR) / 2 + 2 }]));
  const halfTall = pointsPx * 0.55 + 1;
  const segments = points.slice(1).flatMap((q, k) => {
    const p = points[k];
    const [dx, dy] = [q.x - p.x, q.y - p.y];
    // How far along the stretch it leaves the box round each end's number.
    const out = (half: number) => Math.min(dx ? half / Math.abs(dx) : Infinity, dy ? halfTall / Math.abs(dy) : Infinity);
    const [a, b] = [out(p.half), out(q.half)];
    // Too little left between them to read as a line (numbers side by side): none.
    if (a + b >= 1 || (1 - a - b) * Math.hypot(dx, dy) < LEAST_STRETCH_PX) return [];
    return [`M${(p.x + dx * a).toFixed(1)},${(p.y + dy * a).toFixed(1)}L${(q.x - dx * b).toFixed(1)},${(q.y - dy * b).toFixed(1)}`];
  });
  const id = useId().replace(/:/g, "");
  const halo = { stroke: "var(--page)", strokeWidth: 3, paintOrder: "stroke" as const };
  return (
    <svg ref={setSvg} role="group" aria-label={label} className="absolute inset-0 block h-full w-full select-none overflow-visible">
      {w > 0 && h > 0 ? (
        <>
          {/* Each grade's wash: its color at a step's foot, fading up to nothing at the step. */}
          {grade ? (
            <defs>
              {(Object.keys(GRADE_COLOR) as StatTier[]).map((tier) => (
                <linearGradient key={tier} id={`${id}-${tier}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0" stopColor={GRADE_COLOR[tier]} stopOpacity={GRADE_FILL} />
                  <stop offset={GRADE_REACH} stopColor={GRADE_COLOR[tier]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
          ) : null}
          {/* Along the top: who he played each week, and the week under it. */}
          {games.map((g, i) =>
            g.opponent ? <image key={`${g.key}-faced`} href={nflLogoUrl(g.opponent)} x={x(i) - logo / 2} y={0} width={logo} height={logo} opacity={0.85} aria-hidden /> : null
          )}
          {games.map((g, i) => (
            <text key={`${g.key}-week`} x={x(i)} y={weekY} textAnchor="middle" className="fill-[var(--ink-secondary)] font-semibold tabular-nums" style={{ fontSize: weekPx }} aria-hidden>
              {g.tag}
            </text>
          ))}
          {/* What he was projected each week he played, and each still to come: a faint ring, over or under his points. */}
          {games.map((g, i) =>
            (g.value !== null || g.future) && g.projected != null ? (
              <circle key={`${g.key}-projected`} cx={x(i)} cy={y(Math.max(0, g.projected))} r={2.75} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.35} strokeWidth={1.25} pointerEvents="none" />
            ) : null
          )}
          {/* A row for each stat: a stepped line, flat across each game's slot at its level, its number over it. */}
          {stats.map((stat, r) => {
            const bandTop = rowsTop + r * rowH;
            // The steps the height of the row, but for a little room kept clear between it and the next (ROW_SPACE_PX):
            // each one's number over it where there's the room in the row, under it where there isn't (a step at the
            // row's top) — no more room kept for them.
            const foot = bandTop + rowH - ROW_SPACE_PX / 2;
            const tallest = Math.max(0, rowH - ROW_SPACE_PX - 2);
            const capTall = statPx * 0.75;
            const valueOf = (g: ChartGame) => (g.stats && Number.isFinite(g.stats[stat.key]) ? g.stats[stat.key] : 0);
            const top = Math.max(0, ...games.map((g) => (g.stats ? valueOf(g) : 0)));
            // Each game's level, and what it was: what he had of it (none, a game he missed); none to draw for a bye or
            // one to come.
            const levelOf = (g: ChartGame): { at: number; value: number } | null =>
              g.stats ? { at: foot - (top > 0 ? (tallest * Math.max(0, valueOf(g))) / top : 0), value: valueOf(g) } : g.missed ? { at: foot, value: 0 } : null;
            let d = "";
            // The last game drawn: where its step ended, and whether a bye's come since.
            let prev: { x: number; y: number; gap: boolean } | null = null;
            const numbers: { x: number; at: number; value: number }[] = [];
            // Each game he played's step filled down to the row's foot, faintly, in its grade's color.
            const fills: { from: number; at: number; tier: StatTier }[] = [];
            games.forEach((g, i) => {
              const level = levelOf(g);
              if (level === null) {
                if (prev) prev.gap = true;
                // Nothing past a week still to come.
                if (g.future) prev = null;
                return;
              }
              const at = level.at;
              const [from, to] = [x(i) - col / 2, x(i) + col / 2];
              if (prev?.gap) {
                // After his bye: a step of its own, nothing drawn across the bye.
                d += `M${from.toFixed(1)},${at.toFixed(1)}`;
              } else {
                // Straight up or down from the last game's level at the slots' edge (or the first step).
                d += prev === null ? `M${from.toFixed(1)},${at.toFixed(1)}` : `V${at.toFixed(1)}`;
              }
              d += `H${to.toFixed(1)}`;
              prev = { x: to, y: at, gap: false };
              numbers.push({ x: x(i), at, value: level.value });
              const tier = g.stats && grade ? grade(stat.key, level.value) : null;
              if (tier && at < foot) fills.push({ from, at, tier });
            });
            return (
              <g key={stat.key} role="img" aria-label={stat.label}>
                {/* Its name, over it on hover (and read out): no room on the wall's taken for it. */}
                <title>{stat.label}</title>
                {fills.map((f, k) => (
                  <rect key={k} x={f.from} y={f.at} width={col} height={foot - f.at} fill={`url(#${id}-${f.tier})`} />
                ))}
                <path d={d} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.55} strokeWidth={1.25} strokeLinejoin="miter" />
                {numbers.map((num, k) => {
                  // Over its step where the row has the room, else under it — and where numbers this wide would run
                  // into the next one's, every other one the other way, so side by side they don't.
                  const above = num.at - 2 - capTall >= bandTop + 1;
                  const below = num.at + 2 + capTall <= bandTop + rowH - 1;
                  const crowded = statText(num.value).length * statPx * CHAR > col - 2;
                  const under = !above || (crowded && k % 2 === 1 && below);
                  return (
                    <text
                      key={k}
                      x={num.x}
                      y={under ? num.at + capTall + 2.5 : num.at - 2.5}
                      textAnchor="middle"
                      className={`tabular-nums ${num.value === 0 ? "fill-[var(--ink-muted)]" : "fill-[var(--ink-primary)] font-semibold"}`}
                      style={{ fontSize: statPx, opacity: num.value === 0 ? 0.6 : 1 }}
                    >
                      {statText(num.value)}
                    </text>
                  );
                })}
              </g>
            );
          })}
          {/* His points' line, stopping short of each number. */}
          <path d={segments.join("")} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.8} strokeWidth={1.5} strokeLinecap="round" />
          {/* His points each game he played, where its point is (none, one he missed); his best bold. */}
          {games.map((g, i) => {
            if (g.value === null) return null;
            const starred = g.value === best && best > 0;
            return (
              <text
                key={g.key}
                x={x(i)}
                y={y(g.value) + pointsPx * 0.35}
                textAnchor="middle"
                role="img"
                aria-label={g.label}
                {...halo}
                className={`tabular-nums ${starred ? "fill-[var(--ink-primary)] font-extrabold" : "fill-[var(--ink-primary)] font-semibold"}`}
                style={{ fontSize: pointsPx }}
              >
                {pointsText(g.value)}
              </text>
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
