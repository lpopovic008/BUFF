"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FAR_OPACITY, FULL_DEPTH_SHARE, HORIZON_OPACITY, LINE_OPACITY } from "@/components/FloorGrid";
import { FLOOR_TILT, GRID_PX, PERSPECTIVE_PX } from "@/lib/grid-room";
import type { StatTier } from "@/lib/stat-tiers";

// A player's card's charts (see PlayerStage): his fantasy points game by game as a line on the back wall, and his
// stats game by game as bars standing on the room's floor below it, the floor made a flight of stairs going down
// toward you (see FloorStairs) — a game to each of the floor's grid columns, right under its dot on the wall, a stat
// to each step. Slid together (see useChartPan).

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

/** How long the floor takes to become stairs (ms), and to go flat again (inside the stage's own going, STAGE_MS). */
const STAIRS_IN_MS = 750;
const STAIRS_OUT_MS = 400;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** How far the floor's become stairs, 0 (flat, the room's own) to 1, run toward `up` from wherever it is. */
export function useStairs(up: boolean) {
  const [q, setQ] = useState(0);
  const now = useRef(0);
  useEffect(() => {
    const target = up ? 1 : 0;
    const from = now.current;
    if (from === target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 1 : (up ? STAIRS_IN_MS : STAIRS_OUT_MS) * Math.abs(target - from);
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      start ??= t;
      const k = Math.min(1, (t - start) / ms);
      now.current = from + (target - from) * k;
      setQ(now.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [up]);
  return easeInOut(q);
}

/**
 * The floor as a flight of stairs going down toward you from the wall, slid as the charts are (`pan`), `q` of the way
 * from flat: each of the grid's lines across an edge of a step, each step a grid square deep and a grid square down
 * from the one behind it. Row `z` of the stats (whole rows, `r`) sits on the step under the one at the wall — the
 * landing — with as many games across as `pan.x` has it. Where floor point (`a` games across, `z` rows), `up` px off
 * row `r`'s step, shows on the screen; and the step's own edges.
 */
function stairLens(screenWidth: number, horizon: number, pan: ChartPan, q: number) {
  const W = screenWidth;
  const project = (across: number, d: number, h: number): [number, number, number] => {
    const toward = Math.min(d * SIN + h * COS, NEAREST);
    const s = PERSPECTIVE_PX / (PERSPECTIVE_PX - toward);
    return [W / 2 + across * s, horizon + (d * COS - h * SIN) * s, s];
  };
  // Row r's step: how far back from the wall it starts, and how far down it is.
  const back = (r: number) => (r - pan.z + 1) * GRID_PX;
  const down = (r: number) => -(r - pan.z + 1) * GRID_PX * q;
  const at = (a: number, z: number, r: number, up = 0) => project((a - pan.x) * GRID_PX, (z - pan.z + 1) * GRID_PX, down(r) + up);
  return { project, back, down, at };
}

/**
 * The room's floor while a player's card is up, as stairs (see stairLens) across the whole room — drawn in place of
 * the room's own grid (which is put away, `onAway`, while it's anything but flat), each line where the grid's was
 * when it's flat, faded toward the horizon as the grid's are, each step's face (its riser) faintly lit.
 */
export function FloorStairs({ room, horizon, pan, q, onAway }: { room: { width: number; height: number }; horizon: number; pan: ChartPan; q: number; onAway?: (away: boolean) => void }) {
  const away = q > 0.001;
  useEffect(() => {
    onAway?.(away);
  }, [away, onAway]);
  useEffect(() => () => onAway?.(false), [onAway]);
  if (!away || !onAway) return null;
  const { width: W, height: H } = room;
  const { project, back, down } = stairLens(W, horizon, pan, q);
  const fullDepth = H * FULL_DEPTH_SHARE;
  const fade = (d: number) => LINE_OPACITY * Math.min(1, FAR_OPACITY + (1 - FAR_OPACITY) * (Math.max(0, d) / fullDepth));
  // The grid's lines running back: one between every two games' columns, as far across as shows.
  const reach = W / 2 / GRID_PX + 2;
  const columns: number[] = [];
  for (let i = Math.floor(pan.x - reach); i <= Math.ceil(pan.x + reach); i++) columns.push((i + 0.5 - pan.x) * GRID_PX);
  const drawn: React.ReactNode[] = [];
  for (let r = Math.floor(pan.z) - 1; ; r++) {
    const d0 = back(r);
    const d1 = d0 + GRID_PX;
    // Its riser, from the step behind's front edge down to its own back edge — then its tread.
    const [, yTop] = project(0, d0, down(r - 1));
    const [, yBase, sBase] = project(0, d0, down(r));
    const [, yFront, sFront] = project(0, d1, down(r));
    if (yTop > H) break;
    if (d1 <= 0) continue;
    const o = fade(d0);
    const riser = yBase - yTop;
    if (riser > 0.5) {
      drawn.push(<rect key={`riser-${r}`} x={0} y={yTop} width={W} height={riser} fill="var(--ink-primary)" fillOpacity={0.03 * q} />);
      drawn.push(<line key={`nose-${r}`} x1={0} x2={W} y1={yTop} y2={yTop} stroke="var(--ink-primary)" strokeOpacity={o} strokeWidth={1} />);
    }
    drawn.push(<line key={`base-${r}`} x1={0} x2={W} y1={yBase} y2={yBase} stroke="var(--ink-primary)" strokeOpacity={o} strokeWidth={1} />);
    const path = columns
      .map((c) => {
        const [xt] = project(c, d0, down(r - 1));
        const xb = W / 2 + c * sBase;
        const xf = W / 2 + c * sFront;
        return `M${xt.toFixed(1)} ${yTop.toFixed(1)}L${xb.toFixed(1)} ${yBase.toFixed(1)}L${xf.toFixed(1)} ${yFront.toFixed(1)}`;
      })
      .join("");
    drawn.push(<path key={`cols-${r}`} d={path} fill="none" stroke="var(--ink-primary)" strokeOpacity={fade((d0 + d1) / 2)} strokeWidth={1} />);
  }
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: -1 }}>
      <defs>
        <clipPath id="floor-stairs-clip">
          <rect x={0} y={horizon} width={W} height={Math.max(0, H - horizon)} />
        </clipPath>
        <linearGradient id="floor-stairs-horizon" gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">
          <stop offset="0" stopColor="var(--ink-primary)" stopOpacity="0" />
          <stop offset="0.2" stopColor="var(--ink-primary)" stopOpacity={HORIZON_OPACITY} />
          <stop offset="0.8" stopColor="var(--ink-primary)" stopOpacity={HORIZON_OPACITY} />
          <stop offset="1" stopColor="var(--ink-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={horizon} y2={horizon} stroke="url(#floor-stairs-horizon)" strokeWidth={1} />
      <g clipPath="url(#floor-stairs-clip)">{drawn}</g>
    </svg>
  );
}

/** The tallest bar, in px on the floor (a stat's best): just short of the step behind, so a row never hides the next. */
const TALLEST = 54;
/** Steps between the primary stats and the secondary ones. */
const BLOCK_GAP = 1;

const TIER_FILL: Record<StatTier, string> = { good: "var(--status-good)", mid: "var(--series-4)", bad: "var(--status-critical)" };

/**
 * His stats game by game as bars standing on the stairs (see FloorStairs): the x axis his games, one to each of the
 * floor's grid columns, each right under its slot on the wall's line (see WallLine), their weeks along the wall's foot;
 * the z axis his stats, one to each step down from the landing at the wall (his primary ones, then — further down, on
 * as the stairs are slid up — his secondary ones); the y axis up, each stat's bars as tall as it went against his best
 * at it, in its grade's color (green, yellow, red). Dragged (or a wheel) side to side for every game, up and down along
 * the stairs, settling on a whole game and a whole step; a tap picks a game.
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
  q,
  up,
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
  /** How far the floor's become stairs (see useStairs). */
  q: number;
  /** Shown (else fading away). */
  up: boolean;
}) {
  const W = screenWidth;
  const n = games.length;
  const blocks = [
    { name: "Primary", stats: primary, z0: 0 },
    { name: "Secondary", stats: secondary, z0: primary.length + BLOCK_GAP },
  ].filter((b) => b.stats.length > 0);
  const last = blocks.length > 0 ? blocks[blocks.length - 1].z0 + blocks[blocks.length - 1].stats.length - 1 : 0;
  // Slid down the stairs as far as brings the last row up to the step under the landing.
  const maxZ = Math.max(0, last);
  const clamp = (p: ChartPan) => ({ x: Math.max(0, Math.min(n - 1, p.x)), z: Math.max(0, Math.min(maxZ, p.z)) });
  const { project, back, down, at } = stairLens(W, horizon, pan, q);

  // Which row's step is under screen y (its riser and tread), and how big things are there.
  const rowAt = (y: number) => {
    for (let r = Math.floor(pan.z) - 1; r < Math.floor(pan.z) + 40; r++) {
      const [, yFront, s] = project(0, back(r) + GRID_PX, down(r));
      if (y < yFront) return { r, s, pitch: Math.max(8, yFront - project(0, back(r), down(r - 1))[1]) };
    }
    return null;
  };

  const [pad, setPad] = useState<HTMLDivElement | null>(null);
  const from = useRef<{ pan: ChartPan; s: number; pitch: number }>({ pan, s: 1, pitch: 60 });
  useGrab(pad, {
    start: () => {
      const at = rowAt((horizon + bottom) / 2);
      from.current = { pan, s: at?.s ?? 1, pitch: at?.pitch ?? 60 };
    },
    move: (a, b) => {
      const f = from.current;
      // Side to side as far as the stairs went under the finger; up and down a step for each step's height.
      onPan(clamp({ x: f.pan.x - (b.x - a.x) / (GRID_PX * f.s), z: f.pan.z - (b.y - a.y) / f.pitch }));
    },
    end: () => {
      const moved = pan.z - from.current.pan.z;
      const z = moved > 0.25 ? Math.ceil(pan.z - 1e-6) : moved < -0.25 ? Math.floor(pan.z + 1e-6) : Math.round(pan.z);
      onSettle(clamp({ x: Math.round(pan.x), z }));
    },
    tap: ({ x, y }) => {
      const at = rowAt(y);
      if (!at) return;
      const i = Math.round((x - W / 2) / (GRID_PX * at.s) + pan.x);
      if (i >= 0 && i < n && games[i].value !== null) onPick(i);
    },
    wheel: (dx, dy) => onPan(clamp({ x: pan.x + dx / GRID_PX, z: pan.z + dy / 90 })),
  });

  // Each stat's best this season (or career), for its bars' heights.
  const bestOf = new Map<string, number>();
  for (const b of blocks)
    for (const s of b.stats) bestOf.set(s.key, Math.max(0, ...games.map((g) => (g.stats && Number.isFinite(g.stats[s.key]) ? g.stats[s.key] : 0))));
  // Only the rows on the stairs that show — from the one under the landing — and the games across the floor's stretch.
  const rowShown = (r: number) => r - pan.z > -0.95 && project(0, back(r), down(r - 1))[1] < bottom;
  const colShown = (i: number, r: number) => {
    const [x0] = at(i - 0.5, r + 1, r);
    const [x1] = at(i + 0.5, r + 1, r);
    return x1 > left && x0 < right;
  };
  // Games from the outside in, toward the middle of the screen: nearer the middle stand over those beside them.
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q2) => Math.abs(q2 - pan.x) - Math.abs(p - pan.x));
  const label = { stroke: "var(--page)", strokeWidth: 3, paintOrder: "stroke" as const };
  const pts = (ps: [number, number, number][]) => ps.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const rise = Math.min(1, q * 1.15);

  const drawn: React.ReactNode[] = [];
  const names: React.ReactNode[] = [];
  for (const b of blocks) {
    b.stats.forEach((s, j) => {
      const r = b.z0 + j;
      if (!rowShown(r)) return;
      const most = bestOf.get(s.key) || 1;
      // The picked game's column lit, down its step's face and across its tread.
      if (picked >= 0 && colShown(picked, r)) {
        const face = [at(picked - 0.5, r, r - 1), at(picked + 0.5, r, r - 1), at(picked + 0.5, r, r), at(picked + 0.5, r + 1, r), at(picked - 0.5, r + 1, r), at(picked - 0.5, r, r)];
        drawn.push(<polygon key={`${b.name}-${s.key}-lit`} points={pts(face)} fill="var(--ink-primary)" fillOpacity={0.08} />);
      }
      // The y axis, standing at the step's back left corner, up to a stat's best.
      const [yb, yt] = [at(-0.5, r + 0.15, r), at(-0.5, r + 0.15, r, TALLEST * rise)];
      drawn.push(<line key={`${b.name}-${s.key}-y`} x1={yb[0]} y1={yb[1]} x2={yt[0]} y2={yt[1]} stroke="var(--ink-primary)" strokeOpacity={0.45} />);
      drawn.push(<line key={`${b.name}-${s.key}-y-best`} x1={yt[0] - 3} y1={yt[1]} x2={yt[0] + 3} y2={yt[1]} stroke="var(--ink-primary)" strokeOpacity={0.45} />);
      for (const i of order) {
        if (!colShown(i, r)) continue;
        const g = games[i];
        const lit = i === picked;
        const v = g.stats ? (Number.isFinite(g.stats[s.key]) ? g.stats[s.key] : 0) : null;
        const [x0, x1] = [i - 0.3, i + 0.3];
        const [z0, z1] = [r + 0.15, r + 0.75];
        if (v === null) {
          // A week he didn't play: its footprint, empty. Nothing yet for a week to come.
          if (g.future) continue;
          drawn.push(
            <polygon
              key={`${b.name}-${g.key}-${s.key}`}
              points={pts([at(x0, z0, r), at(x1, z0, r), at(x1, z1, r), at(x0, z1, r)])}
              fill="none"
              stroke="var(--ink-muted)"
              strokeOpacity={0.45}
              strokeDasharray="2 2"
            />
          );
          continue;
        }
        const tall = Math.max(1.5, (TALLEST * Math.max(0, v)) / most) * rise;
        const tier = g.tiers[s.key];
        const fill = tier ? TIER_FILL[tier] : "var(--ink-primary)";
        const [fl, fr, bl, br] = [at(x0, z1, r), at(x1, z1, r), at(x0, z0, r), at(x1, z0, r)];
        const [tfl, tfr, tbl, tbr] = [at(x0, z1, r, tall), at(x1, z1, r, tall), at(x0, z0, r, tall), at(x1, z0, r, tall)];
        // Its side toward the middle of the screen, its top, its front.
        const leftOfMiddle = i < pan.x;
        drawn.push(
          <g key={`${b.name}-${g.key}-${s.key}`} opacity={lit ? 1 : 0.85}>
            {Math.abs(i - pan.x) > 0.01 ? <polygon points={pts(leftOfMiddle ? [fr, br, tbr, tfr] : [fl, bl, tbl, tfl])} fill={fill} fillOpacity={0.3} /> : null}
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
      // The stat's name, on its step's face at the floor's left side, however far it's slid.
      const [, ny] = project(0, back(r), down(r - 1));
      names.push(
        <text key={`${b.name}-${s.key}-name`} x={left + 4} y={ny + 11} {...label} className="fill-[var(--ink-secondary)] text-[0.5625rem] font-bold uppercase">
          {s.label}
        </text>
      );
    });
    // The secondary stats named on the step before theirs.
    if (b.z0 > 0 && rowShown(b.z0 - 1)) {
      const [, hy] = project(0, back(b.z0 - 1), down(b.z0 - 2));
      names.push(
        <text key={`${b.name}-name`} x={left + 4} y={hy + 11} {...label} className="fill-[var(--ink-muted)] text-[0.5625rem] font-bold uppercase tracking-wide">
          {b.name} stats ↓
        </text>
      );
    }
  }
  // The x axis: each game's week along the wall's foot, right under its slot on the wall.
  const tags = games.map((g, i) => {
    const [tx] = project((i - pan.x) * GRID_PX, 0, 0);
    if (tx < left + 4 || tx > right - 4) return null;
    return (
      <text
        key={`${g.key}-tag`}
        x={tx}
        y={horizon + 10}
        textAnchor="middle"
        {...label}
        className={`text-[0.5625rem] tabular-nums ${i === picked ? "fill-[var(--ink-primary)] font-extrabold" : "fill-[var(--ink-muted)]"}`}
      >
        {g.tag}
      </text>
    );
  });
  const more = pan.z < maxZ - 0.5;

  return (
    <>
      <svg aria-hidden className={`pointer-events-none fixed inset-0 z-[7] h-full w-full transition-opacity ease-out ${up ? "opacity-100" : "opacity-0"}`} style={{ transitionDuration: `${STAIRS_OUT_MS}ms` }}>
        <defs>
          <clipPath id="floor-stat-bars-clip">
            <rect x={left} y={horizon + 12} width={Math.max(0, right - left)} height={Math.max(0, bottom - horizon - 12)} />
          </clipPath>
        </defs>
        <g clipPath="url(#floor-stat-bars-clip)">
          {drawn}
          {names}
        </g>
        {tags}
        {more ? (
          <text x={right - 4} y={bottom - 4} textAnchor="end" {...label} className="fill-[var(--ink-muted)] text-[0.5625rem] font-bold uppercase tracking-wide">
            Swipe up · more stats ↓
          </text>
        ) : null}
      </svg>
      {/* What's dragged: the floor's stretch of the screen. */}
      <div
        ref={setPad}
        data-floor-ui
        className={`fixed z-[8] cursor-grab touch-none select-none active:cursor-grabbing ${up ? "" : "pointer-events-none"}`}
        style={{ top: horizon, left, width: Math.max(0, right - left), height: Math.max(0, bottom - horizon) }}
        aria-label="Drag along the stairs for every game and stat"
      />
    </>
  );
}
