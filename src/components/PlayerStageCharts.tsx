"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FLOOR_TILT, GRID_PX, PERSPECTIVE_PX } from "@/lib/grid-room";
import type { StatTier } from "@/lib/stat-tiers";

// A player's card's charts (see PlayerStage): his fantasy points game by game as a line on the back wall, and his
// stats game by game as bars standing in the room's floor below it — a game to each of the floor's grid columns, right
// under its dot on the wall, a stat to each of its grid rows. Slid side to side together (see useChartPan).

/** A game of his (or a season), as the charts draw it: its points — null for a week he didn't play (or hasn't yet) —
 * its stats, how each was graded, and how it's read out. */
export interface ChartGame {
  key: string;
  /** Under the line's x axis: the week (or the year). */
  tag: string;
  value: number | null;
  stats: Record<string, number> | null;
  tiers: Record<string, StatTier | null>;
  label: string;
  /** A week still to come this season (nothing to draw for it yet). */
  future?: boolean;
}

/** A stat the floor's bars show: its name and its key in a game's stats. */
export interface ChartStat {
  label: string;
  key: string;
}

/** A game's column (and a stat's row) on the floor: one of its grid squares — and a game's slot on the wall over it. */
const CELL = GRID_PX;

/** How far the charts are slid: which game's column stands in the middle of the screen (`x`, in columns), and how many
 * of the floor's rows the stats are slid back (`z`). */
export interface ChartPan {
  x: number;
  z: number;
}

/**
 * The charts' slide, for whatever's shown (`view`; a fresh one starts with game `startX` in the middle): `set` while
 * dragged, then `settle` eases it onto the floor's grid — a whole column, a whole row.
 */
export function useChartPan(view: string, startX: number) {
  const [state, setState] = useState<(ChartPan & { view: string }) | null>(null);
  const pan: ChartPan = state?.view === view ? state : { x: startX, z: 0 };
  const latest = useRef(pan);
  useEffect(() => {
    latest.current = pan;
  });
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const set = useCallback(
    (to: ChartPan) => {
      cancelAnimationFrame(frame.current);
      latest.current = to;
      setState({ view, ...to });
    },
    [view]
  );
  const settle = useCallback(
    (to: ChartPan) => {
      cancelAnimationFrame(frame.current);
      const from = latest.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 180);
        const e = 1 - (1 - t) ** 3;
        const at = { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e };
        latest.current = at;
        setState({ view, ...at });
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [view]
  );
  return { pan, set, settle, latest };
}

/**
 * Dragging (or a wheel) on `el`: `move` with how far it's gone from where it was pressed, `end` once it's let go (or the
 * wheel's stopped) — and a press that didn't move, `tap`. A drag's click is swallowed.
 */
function useGrab(
  el: Element | null,
  handlers: {
    start: () => void;
    move: (from: { x: number; y: number }, to: { x: number; y: number }) => void;
    end: () => void;
    tap?: (at: { x: number; y: number }) => void;
    wheel: (dx: number, dy: number) => void;
  }
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    if (!el) return;
    const target = el as HTMLElement;
    let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
    let swallow = false;
    let wheelDone = 0;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      swallow = false;
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        drag.moved = true;
        target.setPointerCapture(e.pointerId);
        latest.current.start();
      }
      e.preventDefault();
      latest.current.move({ x: drag.x, y: drag.y }, { x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const was = drag;
      drag = null;
      if (was.moved) {
        swallow = true;
        latest.current.end();
      } else if (e.type === "pointerup") latest.current.tap?.({ x: e.clientX, y: e.clientY });
    };
    const click = (e: Event) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!wheelDone) latest.current.start();
      const [dx, dy] = e.shiftKey ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
      latest.current.wheel(dx, dy);
      window.clearTimeout(wheelDone);
      wheelDone = window.setTimeout(() => {
        wheelDone = 0;
        latest.current.end();
      }, 160);
    };
    const select = (e: Event) => e.preventDefault();
    target.addEventListener("pointerdown", down);
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
    target.addEventListener("click", click, true);
    target.addEventListener("wheel", wheel, { passive: false });
    target.addEventListener("selectstart", select);
    return () => {
      window.clearTimeout(wheelDone);
      target.removeEventListener("pointerdown", down);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      target.removeEventListener("click", click, true);
      target.removeEventListener("wheel", wheel);
      target.removeEventListener("selectstart", select);
    };
  }, [el]);
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

/**
 * His fantasy points as a line across the back wall: a slot along the x axis for every game of the season (all 18
 * weeks, those to come too — or every season of his), each right over its column of bars on the floor (a grid
 * square wide, slid with them: `pan`, on a screen `screenWidth` wide), the y axis his points, a dot on each game he
 * played joined to the next he played (a week he didn't, left open), his best starred, the one picked lit and read
 * out. Each dot is a button (the arrow keys move along them). Dragged side to side with the floor. Never reaches the
 * floor.
 */
export function WallLine({
  games,
  picked,
  onPick,
  label,
  pan,
  screenWidth,
  onPan,
  onSettle,
}: {
  games: ChartGame[];
  picked: number;
  onPick: (i: number) => void;
  label: string;
  pan: number;
  screenWidth: number;
  /** Slid to game `x` in the middle — and, let go, eased onto a whole one. */
  onPan: (x: number) => void;
  onSettle: (x: number) => void;
}) {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const box = useBox(svg);
  const w = box?.width ?? 0;
  const h = box?.height ?? 0;
  const pad = { left: 26, right: 0, top: 14, bottom: 18 };
  const n = games.length;
  const most = Math.max(5, ...games.map((g) => g.value ?? 0));
  const top = Math.ceil(most / 5) * 5;
  const best = Math.max(...games.map((g) => g.value ?? -1));
  // Game i's slot: over its column on the floor, where that column meets the wall.
  const x = (i: number) => screenWidth / 2 + (i - pan) * CELL - (box?.left ?? 0);
  const y = (v: number) => pad.top + (h - pad.top - pad.bottom) * (1 - v / top);
  const inView = (i: number) => x(i) > pad.left - CELL && x(i) < w + CELL;
  // The line, in runs of games he played in a row.
  const runs: [number, number][][] = [];
  games.forEach((g, i) => {
    if (g.value === null) return;
    const point: [number, number] = [x(i), y(g.value)];
    const prev = games[i - 1];
    if (i > 0 && prev?.value !== null && runs.length > 0) runs[runs.length - 1].push(point);
    else runs.push([point]);
  });
  const ticks = [0, top / 2, top];
  const from = useRef(pan);
  useGrab(svg, {
    start: () => (from.current = pan),
    move: (a, b) => onPan(Math.max(0, Math.min(n - 1, from.current - (b.x - a.x) / CELL))),
    end: () => onSettle(Math.max(0, Math.min(n - 1, Math.round(pan)))),
    wheel: (dx) => onPan(Math.max(0, Math.min(n - 1, pan + dx / CELL))),
  });
  const clip = `wall-line-clip-${label.length}`;
  return (
    <svg ref={setSvg} role="group" aria-label={label} className="block h-full min-h-[8rem] w-full cursor-grab touch-pan-y select-none overflow-hidden active:cursor-grabbing">
      {w > 0 && h > 0 ? (
        <>
          <defs>
            <clipPath id={clip}>
              <rect x={pad.left} y={0} width={Math.max(0, w - pad.left)} height={h} />
            </clipPath>
          </defs>
          {/* The y axis, its points, and a faint line across at each. */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={w} y1={y(t)} y2={y(t)} stroke="var(--ink-primary)" strokeOpacity={t === 0 ? 0.5 : 0.12} />
              <text x={pad.left - 4} y={y(t) + 3} textAnchor="end" className="fill-[var(--ink-muted)] text-[0.5625rem] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={h - pad.bottom} stroke="var(--ink-primary)" strokeOpacity={0.5} />
          <g clipPath={`url(#${clip})`}>
            {/* The x axis: a slot for every game. */}
            {games.map((g, i) =>
              inView(i) ? (
                <text
                  key={g.key}
                  x={x(i)}
                  y={h - pad.bottom + 12}
                  textAnchor="middle"
                  className={`text-[0.5625rem] tabular-nums ${i === picked ? "fill-[var(--ink-primary)] font-bold" : "fill-[var(--ink-muted)]"}`}
                >
                  {g.tag}
                </text>
              ) : null
            )}
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
            {games.map((g, i) => {
              if (g.value === null || !inView(i)) return null;
              const lit = i === picked;
              return (
                <g
                  key={g.key}
                  role="button"
                  tabIndex={0}
                  aria-label={g.label}
                  aria-pressed={lit}
                  data-dot={i}
                  className="cursor-pointer outline-none"
                  onClick={() => onPick(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPick(i);
                    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault();
                      const by = e.key === "ArrowLeft" ? -1 : 1;
                      let next = i + by;
                      while (next >= 0 && next < games.length && games[next].value === null) next += by;
                      if (next < 0 || next >= games.length) return;
                      onPick(next);
                      onSettle(next);
                      requestAnimationFrame(() => svg?.querySelector<SVGGElement>(`[data-dot="${next}"]`)?.focus());
                    }
                  }}
                >
                  {/* Its whole slot, to tap. */}
                  <rect x={x(i) - CELL / 2} y={pad.top} width={CELL} height={h - pad.top - pad.bottom} fill="transparent" />
                  <circle cx={x(i)} cy={y(g.value)} r={lit ? 4.5 : 3} fill={lit ? "var(--ink-primary)" : "var(--page)"} stroke="var(--ink-primary)" strokeWidth={1.5} />
                  {lit || (g.value === best && best > 0) ? (
                    <text
                      x={x(i)}
                      y={y(g.value) - 8}
                      textAnchor="middle"
                      stroke="var(--page)"
                      strokeWidth={3}
                      paintOrder="stroke"
                      className={`text-[0.625rem] tabular-nums ${lit ? "fill-[var(--ink-primary)] font-extrabold" : "fill-[var(--ink-muted)] font-semibold"}`}
                    >
                      {g.value === best && best > 0 ? "★ " : ""}
                      {g.value.toFixed(1)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </>
      ) : null}
    </svg>
  );
}

const SIN = Math.sin((FLOOR_TILT * Math.PI) / 180);
const COS = Math.cos((FLOOR_TILT * Math.PI) / 180);
const NEAREST = (PERSPECTIVE_PX / SIN) * 0.97;
/** How the floor magnifies what's `d` px back from the hinge (see grid-room's floorScale). */
const scaleAt = (d: number) => PERSPECTIVE_PX / (PERSPECTIVE_PX - Math.min(d, NEAREST) * SIN);

/** The tallest bar, in px on the floor (a stat's best); how far up off the floor the bars may reach past the horizon. */
const TALLEST = 30;
export const BARS_OVER_HORIZON = 30;
/** Rows between the primary stats' block and the secondary's; room under a block for its games' tags (screen px). */
const BLOCK_GAP = 0.5;
const TAGS_H = 16;

const TIER_FILL: Record<StatTier, string> = { good: "var(--status-good)", mid: "var(--series-4)", bad: "var(--status-critical)" };

/**
 * His stats game by game as bars standing in the room's floor, under its own lens and on its own grid: the x axis his
 * games, one to each of the floor's grid columns, each right under its slot on the wall's line (see WallLine); the z
 * axis his stats, one to each grid row, from the top of the floor down (his primary ones, then — below, off the floor
 * until it's swiped up — his secondary ones); the y axis up, each stat's bars as tall as it went against his best at it,
 * in its grade's color (green, yellow, red). Dragged (or a wheel) side to side for every game, up and down for the
 * secondary stats, settling on the grid; a tap picks a game.
 */
export function FloorStatBars({
  games,
  primary,
  secondary,
  screenWidth,
  horizon,
  bottom,
  left,
  right,
  picked,
  onPick,
  pan,
  onPan,
  onSettle,
}: {
  games: ChartGame[];
  primary: ChartStat[];
  secondary: ChartStat[];
  screenWidth: number;
  /** Where the floor's hinged to the wall, down the screen. */
  horizon: number;
  /** The floor's stretch of screen: from the horizon down to `bottom`, across `left`..`right`. */
  bottom: number;
  left: number;
  right: number;
  picked: number;
  onPick: (i: number) => void;
  pan: ChartPan;
  onPan: (to: ChartPan) => void;
  onSettle: (to: ChartPan) => void;
}) {
  const W = screenWidth;
  const n = games.length;
  const depthOf = (y: number) => {
    const below = Math.max(0, y - horizon);
    return (below * PERSPECTIVE_PX) / (COS * PERSPECTIVE_PX + below * SIN);
  };
  const blocks = [
    { name: "Primary", stats: primary, z0: 0 },
    { name: "Secondary", stats: secondary, z0: primary.length + BLOCK_GAP },
  ].filter((b) => b.stats.length > 0);
  // A stat's row, deep enough that the primary ones reach from the floor's top to its bottom (their games' tags under
  // them); slid back a block at a time, the secondary ones the same.
  const ROW = depthOf(bottom - TAGS_H) / Math.max(1, primary.length || secondary.length);
  const stops = blocks.map((b) => b.z0);
  const maxZ = stops[stops.length - 1] ?? 0;
  const clamp = (p: ChartPan) => ({ x: Math.max(0, Math.min(n - 1, p.x)), z: Math.max(0, Math.min(maxZ, p.z)) });
  // Let go: on a whole game, and on whichever block it was swiped toward.
  const settleAt = (p: ChartPan, was: ChartPan) => {
    const moved = p.z - was.z;
    const near = stops.reduce((best, s) => (Math.abs(s - p.z) < Math.abs(best - p.z) ? s : best), 0);
    const toward = moved > 0.4 ? stops.find((s) => s > was.z + 0.01) : moved < -0.4 ? [...stops].reverse().find((s) => s < was.z - 0.01) : undefined;
    return clamp({ x: Math.round(p.x), z: toward ?? near });
  };

  // A floor point `a` across (in columns from the middle game's) and `z` rows back from the stats' top, `up` px off it.
  const at = (a: number, z: number, up = 0): [number, number] => {
    const d = (z - pan.z) * ROW;
    const s = scaleAt(d);
    return [W / 2 + (a - pan.x) * CELL * s, horizon + (Math.min(d, NEAREST) * COS - up * SIN) * s];
  };
  const pts = (ps: [number, number][]) => ps.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");

  const [pad, setPad] = useState<HTMLDivElement | null>(null);
  const from = useRef(pan);
  // The floor point under the finger stays under it.
  const floorAtScreen = (x: number, y: number) => {
    const d = depthOf(y);
    return { a: (x - W / 2) / (CELL * scaleAt(d)), z: d / ROW };
  };
  useGrab(pad, {
    start: () => (from.current = pan),
    move: (a, b) => {
      const [p, q] = [floorAtScreen(a.x, a.y), floorAtScreen(b.x, b.y)];
      onPan(clamp({ x: from.current.x + p.a - q.a, z: from.current.z + p.z - q.z }));
    },
    end: () => onSettle(settleAt(pan, from.current)),
    tap: ({ x, y }) => {
      const p = floorAtScreen(x, y);
      const i = Math.round(p.a + pan.x);
      if (i >= 0 && i < n && games[i].value !== null) onPick(i);
    },
    wheel: (dx, dy) => onPan(clamp({ x: pan.x + dx / CELL, z: pan.z + dy / ROW })),
  });

  // Each stat's best this season (or career), for its bars' heights.
  const bestOf = new Map<string, number>();
  for (const b of blocks)
    for (const s of b.stats) bestOf.set(s.key, Math.max(0, ...games.map((g) => (g.stats && Number.isFinite(g.stats[s.key]) ? g.stats[s.key] : 0))));
  // Only the rows on the floor's stretch, and the columns across it.
  const rowShown = (z: number) => z - pan.z > -0.2 && (z - pan.z) * ROW < depthOf(bottom) + ROW;
  const colShown = (i: number, z: number) => {
    const [x0] = at(i - 0.5, z + 1);
    const [x1] = at(i + 0.5, z + 1);
    return x1 > left && x0 < right;
  };
  // Games from the outside in, toward the middle of the screen: nearer the middle stand over those beside them.
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => Math.abs(q - pan.x) - Math.abs(p - pan.x));
  const label = { stroke: "var(--page)", strokeWidth: 3, paintOrder: "stroke" as const };

  const drawn: React.ReactNode[] = [];
  const names: React.ReactNode[] = [];
  for (const b of blocks) {
    const zEnd = b.z0 + b.stats.length;
    const back = Math.max(b.z0, pan.z);
    if (!rowShown(b.z0) && !rowShown(zEnd - 1)) continue;
    // The block's floor, faint, with the picked game's column lit; the z axis along its first game's left edge, the
    // x axis along its near edge, the y axis standing at its far left corner up to a stat's best.
    drawn.push(<polygon key={`${b.name}-floor`} points={pts([at(-0.5, back), at(n - 0.5, back), at(n - 0.5, zEnd), at(-0.5, zEnd)])} fill="var(--ink-primary)" fillOpacity={0.035} />);
    if (picked >= 0)
      drawn.push(
        <polygon key={`${b.name}-lit`} points={pts([at(picked - 0.5, back), at(picked + 0.5, back), at(picked + 0.5, zEnd), at(picked - 0.5, zEnd)])} fill="var(--ink-primary)" fillOpacity={0.1} />
      );
    drawn.push(<polyline key={`${b.name}-axes`} points={pts([at(-0.5, back), at(-0.5, zEnd), at(n - 0.5, zEnd)])} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.6} />);
    const [yb, yt] = [at(-0.5, back), at(-0.5, back, TALLEST)];
    drawn.push(<line key={`${b.name}-y`} x1={yb[0]} y1={yb[1]} x2={yt[0]} y2={yt[1]} stroke="var(--ink-primary)" strokeOpacity={0.6} />);
    drawn.push(<line key={`${b.name}-y-best`} x1={yt[0] - 3} y1={yt[1]} x2={yt[0] + 3} y2={yt[1]} stroke="var(--ink-primary)" strokeOpacity={0.6} />);
    drawn.push(
      <text key={`${b.name}-y-name`} x={yt[0] - 5} y={yt[1] + 3} textAnchor="end" {...label} className="fill-[var(--ink-muted)] text-[0.5625rem] font-bold">
        ★
      </text>
    );
    // The weeks (or years) along the near edge.
    games.forEach((g, i) => {
      if (!colShown(i, zEnd - 1)) return;
      const [tx, ty] = at(i, zEnd);
      drawn.push(
        <text key={`${b.name}-${g.key}-tag`} x={tx} y={ty + 11} textAnchor="middle" {...label} className={`text-[0.5625rem] tabular-nums ${i === picked ? "fill-[var(--ink-primary)] font-extrabold" : "fill-[var(--ink-muted)]"}`}>
          {g.tag}
        </text>
      );
    });
    // Back to front, so nearer bars stand over farther ones.
    b.stats.forEach((s, j) => {
      const z = b.z0 + j;
      if (!rowShown(z)) return;
      const most = bestOf.get(s.key) || 1;
      for (const i of order) {
        if (!colShown(i, z)) continue;
        const g = games[i];
        const lit = i === picked;
        const v = g.stats ? (Number.isFinite(g.stats[s.key]) ? g.stats[s.key] : 0) : null;
        const [x0, x1] = [i - 0.3, i + 0.3];
        const [z0, z1] = [z + 0.2, z + 0.8];
        if (v === null) {
          // A week he didn't play: its footprint, empty. Nothing yet for a week to come.
          if (g.future) continue;
          drawn.push(
            <polygon key={`${b.name}-${g.key}-${s.key}`} points={pts([at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)])} fill="none" stroke="var(--ink-muted)" strokeOpacity={0.45} strokeDasharray="2 2" />
          );
          continue;
        }
        const tall = Math.max(1.5, (TALLEST * Math.max(0, v)) / most);
        const tier = g.tiers[s.key];
        const fill = tier ? TIER_FILL[tier] : "var(--ink-primary)";
        const [fl, fr, bl, br] = [at(x0, z1), at(x1, z1), at(x0, z0), at(x1, z0)];
        const [tfl, tfr, tbl, tbr] = [at(x0, z1, tall), at(x1, z1, tall), at(x0, z0, tall), at(x1, z0, tall)];
        // Its side toward the middle of the screen, its top, its front.
        const leftOfMiddle = i < pan.x;
        drawn.push(
          <g key={`${b.name}-${g.key}-${s.key}`} opacity={lit ? 1 : 0.85}>
            {i !== pan.x ? <polygon points={pts(leftOfMiddle ? [fr, br, tbr, tfr] : [fl, bl, tbl, tfl])} fill={fill} fillOpacity={0.3} /> : null}
            <polygon points={pts([tbl, tbr, tfr, tfl])} fill={fill} fillOpacity={0.75} />
            <polygon points={pts([fl, fr, tfr, tfl])} fill={fill} fillOpacity={0.5} stroke={fill} strokeWidth={lit ? 1 : 0.5} />
            {lit ? (
              <text x={(tfl[0] + tfr[0]) / 2} y={Math.min(tfl[1], tbl[1]) - 3} textAnchor="middle" {...label} className="fill-[var(--ink-primary)] text-[0.625rem] font-extrabold tabular-nums">
                {Number.isInteger(v) ? v : v.toFixed(1)}
              </text>
            ) : null}
          </g>
        );
      }
      // The stat's name, at the floor's left side however far it's slid.
      const [, ny] = at(0, z + 0.5);
      names.push(
        <text key={`${b.name}-${s.key}-name`} x={left + 4} y={ny + 3} {...label} className="fill-[var(--ink-secondary)] text-[0.5625rem] font-bold uppercase">
          {s.label}
        </text>
      );
    });
    if (b.z0 > 0 && rowShown(b.z0 - 1)) {
      const [, hy] = at(0, b.z0 - 0.35);
      names.push(
        <text key={`${b.name}-name`} x={left + 4} y={hy + 3} {...label} className="fill-[var(--ink-muted)] text-[0.5625rem] font-bold uppercase tracking-wide">
          {b.name} stats
        </text>
      );
    }
  }
  const more = blocks.length > 1 && pan.z < maxZ - 0.5;
  const clipTop = horizon - BARS_OVER_HORIZON;

  return (
    <>
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-[7] h-full w-full">
        <defs>
          <clipPath id="floor-stat-bars-clip">
            <rect x={left} y={clipTop} width={Math.max(0, right - left)} height={Math.max(0, bottom - clipTop)} />
          </clipPath>
        </defs>
        <g clipPath="url(#floor-stat-bars-clip)">
          {drawn}
          {names}
        </g>
        {more ? (
          <text x={right - 4} y={bottom - 4} textAnchor="end" {...label} className="fill-[var(--ink-muted)] text-[0.5625rem] font-bold uppercase tracking-wide">
            Swipe up · secondary stats ↓
          </text>
        ) : null}
      </svg>
      {/* What's dragged: the floor's stretch of the screen. */}
      <div
        ref={setPad}
        data-floor-ui
        className="fixed z-[8] cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ top: horizon, left, width: Math.max(0, right - left), height: Math.max(0, bottom - horizon) }}
        aria-label="Drag along the floor for every game and stat"
      />
    </>
  );
}
