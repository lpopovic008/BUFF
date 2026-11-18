"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StatTier } from "@/lib/stat-tiers";

// A player's card's charts (see PlayerStage): his fantasy points game by game as a line on the back wall, and his
// stats game by game as bars standing on the floor in front of it.

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

/** Keeps track of an element's size. */
function useSize(el: Element | null) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((was) => (was && was.width === r.width && was.height === r.height ? was : { width: r.width, height: r.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return size;
}

/**
 * His fantasy points as a line across the back wall: a slot along the x axis for every game of the season (all 18
 * weeks, those to come too — or every season of his), the y axis his points, a dot on each game he played joined to
 * the next he played (a week he didn't, left open), his best starred, the one picked lit and read out. Each dot is a
 * button (the arrow keys move along them). Fills the room it's given on the wall; never reaches the floor.
 */
export function WallLine({ games, picked, onPick, label }: { games: ChartGame[]; picked: number; onPick: (i: number) => void; label: string }) {
  const [box, setBox] = useState<SVGSVGElement | null>(null);
  const size = useSize(box);
  const w = size?.width ?? 0;
  const h = size?.height ?? 0;
  const pad = { left: 26, right: 8, top: 14, bottom: 18 };
  const n = Math.max(1, games.length);
  const most = Math.max(5, ...games.map((g) => g.value ?? 0));
  const top = Math.ceil(most / 5) * 5;
  const best = Math.max(...games.map((g) => g.value ?? -1));
  const x = (i: number) => pad.left + ((w - pad.left - pad.right) * (i + 0.5)) / n;
  const y = (v: number) => pad.top + (h - pad.top - pad.bottom) * (1 - v / top);
  // The line, in runs of games he played in a row.
  const runs: [number, number][][] = [];
  games.forEach((g, i) => {
    if (g.value === null) return;
    const point: [number, number] = [x(i), y(g.value)];
    const prev = games[i - 1];
    if (i > 0 && prev?.value !== null && runs.length > 0) runs[runs.length - 1].push(point);
    else runs.push([point]);
  });
  const every = n > 12 && w / n < 22 ? 2 : 1;
  const ticks = [0, top / 2, top];
  return (
    <svg ref={setBox} role="group" aria-label={label} className="block h-full min-h-[8rem] w-full overflow-visible">
      {w > 0 && h > 0 ? (
        <>
          {/* The y axis, its points, and a faint line across at each. */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} stroke="var(--ink-primary)" strokeOpacity={t === 0 ? 0.5 : 0.12} />
              <text x={pad.left - 4} y={y(t) + 3} textAnchor="end" className="fill-[var(--ink-muted)] text-[0.5625rem] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={h - pad.bottom} stroke="var(--ink-primary)" strokeOpacity={0.5} />
          {/* The x axis: a slot for every game. */}
          {games.map((g, i) =>
            i % every === 0 || i === picked ? (
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
            if (g.value === null) return null;
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
                    e.currentTarget.parentElement?.querySelector<SVGGElement>(`[data-dot="${next}"]`)?.focus();
                  }
                }}
              >
                {/* Its whole slot, to tap. */}
                <rect x={x(i) - (w - pad.left - pad.right) / n / 2} y={pad.top} width={(w - pad.left - pad.right) / n} height={h - pad.top - pad.bottom} fill="transparent" />
                <circle cx={x(i)} cy={y(g.value)} r={lit ? 4.5 : 3} fill={lit ? "var(--ink-primary)" : "var(--page)"} stroke="var(--ink-primary)" strokeWidth={1.5} />
                {lit || (g.value === best && best > 0) ? (
                  <text x={x(i)} y={y(g.value) - 8} textAnchor="middle" className={`text-[0.625rem] tabular-nums ${lit ? "fill-[var(--ink-primary)] font-extrabold" : "fill-[var(--ink-muted)] font-semibold"}`}>
                    {g.value === best && best > 0 ? "★ " : ""}
                    {g.value.toFixed(1)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </>
      ) : null}
    </svg>
  );
}

/** How much bigger the floor chart's nearest row stands than its farthest (its own lens: gentler than the room's, so
 * every game's row can be read, from the floor's top to its bottom). */
const NEAR_OVER_FAR = 1.4;
/** The floor's chart at its nearest row, in screen px: a stat's column wide, the tallest bar, and the room under a
 * block for its stats' names. */
const COL = 84;
const TALLEST = 46;
const NAMES_H = 16;
/** The gap between the primary stats' block and the secondary's, in games' rows; the fewest rows a block's laid for. */
const BLOCK_GAP = 3;
const FEWEST_ROWS = 8;

const TIER_FILL: Record<StatTier, string> = { good: "var(--status-good)", mid: "var(--series-4)", bad: "var(--status-critical)" };

/**
 * His stats game by game as bars standing on the floor: the x axis his stats across (his primary ones), the z axis his
 * games from the top of the floor down to its bottom (week 1 at the back), the y axis up — each stat's bars as tall as
 * it went against his best at it, in its grade's color (green, yellow, red). Below them, off the floor until it's
 * swiped up, the same for his secondary stats. Dragged (or a wheel) side to side for the stats off the screen, up and
 * down for the secondary stats; a tap picks a game's row.
 */
export function FloorStatBars({
  games,
  primary,
  secondary,
  top,
  bottom,
  left,
  right,
  picked,
  onPick,
}: {
  games: ChartGame[];
  primary: ChartStat[];
  secondary: ChartStat[];
  /** The floor's stretch of screen: from the horizon down to `bottom`, across `left`..`right`. */
  top: number;
  bottom: number;
  left: number;
  right: number;
  picked: number;
  onPick: (i: number) => void;
}) {
  // A block's laid back from where its first game's tallest bar reaches the floor's top, to where its stats' names
  // still show at the bottom: `D` rows deep (in games' rows), seen through a lens of its own — `P` rows from its eye.
  const D = Math.max(FEWEST_ROWS, games.length);
  const P = (D * NEAR_OVER_FAR) / (NEAR_OVER_FAR - 1);
  const G = D / (P - D);
  const yTop = top + TALLEST / NEAR_OVER_FAR + 14;
  const Y = Math.max(40, bottom - NAMES_H - yTop);
  const blocks = [
    { name: "Primary", stats: primary, z0: 0 },
    { name: "Secondary", stats: secondary, z0: games.length + BLOCK_GAP },
  ].filter((b) => b.stats.length > 0);
  const depth = blocks.length > 0 ? blocks[blocks.length - 1].z0 + games.length : 0;
  const widest = Math.max(0, ...blocks.map((b) => b.stats.length)) * COL;
  const middle = (left + right) / 2;

  const [off, setOff] = useState({ x: 0, z: 0 });
  // Slid far enough to bring the last block's near edge (and its names) up to the floor's bottom, and the widest
  // block's ends in from its sides.
  const maxZ = Math.max(0, depth - D);
  const maxX = Math.max(0, widest - (right - left - 36)) / 2;
  const clampOff = (o: { x: number; z: number }) => ({ x: Math.max(-maxX, Math.min(maxX, o.x)), z: Math.max(0, Math.min(maxZ, o.z)) });
  // A row of games `z` rows back from the block's far edge, as the floor's slid: how far down the screen, and how big.
  const lens = (z: number) => Math.min(z - off.z, P * 0.9);
  const yAt = (z: number) => {
    const d = lens(z);
    return yTop + (Y * (d / (P - d))) / G;
  };
  const scaleAt = (z: number) => (P - D) / (P - lens(z));
  // A row's height on the screen at its nearest — for how far a drag slides the floor.
  const nearRow = (Y * P) / (D * (P - D)) / G;

  const [pad, setPad] = useState<HTMLDivElement | null>(null);
  const latest = useRef({ off, clampOff, onPick, games, blocks, nearRow, yTop, Y, P, G });
  useEffect(() => {
    latest.current = { off, clampOff, onPick, games, blocks, nearRow, yTop, Y, P, G };
  });
  useEffect(() => {
    if (!pad) return;
    let drag: { id: number; x: number; y: number; from: { x: number; z: number }; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: latest.current.off, moved: false };
      pad.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const [dx, dy] = [e.clientX - drag.x, e.clientY - drag.y];
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      const l = latest.current;
      setOff(l.clampOff({ x: drag.from.x - dx, z: drag.from.z - dy / (l.nearRow * 0.7) }));
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const was = drag;
      drag = null;
      if (was.moved) return;
      // A tap: the game's row under it, in whichever block.
      const l = latest.current;
      const t = ((e.clientY - l.yTop) * l.G) / l.Y;
      const z = (l.P * t) / (1 + t) + l.off.z;
      for (const b of l.blocks) {
        const i = Math.floor(z - b.z0);
        if (i >= 0 && i < l.games.length) {
          if (l.games[i].value !== null) l.onPick(i);
          return;
        }
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const l = latest.current;
      const [dx, dy] = e.shiftKey ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
      setOff(l.clampOff({ x: l.off.x + dx, z: l.off.z + dy / l.nearRow }));
    };
    pad.addEventListener("pointerdown", down);
    pad.addEventListener("pointermove", move);
    pad.addEventListener("pointerup", up);
    pad.addEventListener("pointercancel", up);
    pad.addEventListener("wheel", wheel, { passive: false });
    return () => {
      pad.removeEventListener("pointerdown", down);
      pad.removeEventListener("pointermove", move);
      pad.removeEventListener("pointerup", up);
      pad.removeEventListener("pointercancel", up);
      pad.removeEventListener("wheel", wheel);
    };
  }, [pad]);

  // A point on the floor (`a` screen px across from the chart's middle, at its nearest row; `z` rows back), `up` px
  // (at its nearest row) up off it → the screen.
  const at = (a: number, z: number, upPx = 0): [number, number] => {
    const s = scaleAt(z);
    return [middle + (a - off.x) * s, yAt(z) - upPx * s];
  };
  const pts = (ps: [number, number][]) => ps.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  // Each stat's best this season (or career), for its bars' heights.
  const bestOf = new Map<string, number>();
  for (const b of blocks)
    for (const s of b.stats) bestOf.set(s.key, Math.max(0, ...games.map((g) => (g.stats && Number.isFinite(g.stats[s.key]) ? g.stats[s.key] : 0))));
  // Only the rows on the floor's stretch.
  const shown = (z: number) => z - off.z > -2 && z - off.z < D + 1;
  // The z axis's weeks keep to the floor's left side however far it's slid.
  const tagX = (x: number) => Math.max(left + 18, x);

  const drawn: React.ReactNode[] = [];
  for (const b of blocks) {
    const n = b.stats.length;
    const a0 = (-n * COL) / 2;
    const zNear = b.z0 + games.length;
    const back = Math.max(b.z0, off.z - 0.5);
    if (shown(back) || shown(zNear)) {
      // The block's floor, faint; the z axis (its games) along its left edge, the x axis (its stats) along its near one.
      drawn.push(
        <polygon key={`${b.name}-floor`} points={pts([at(a0, back), at(a0 + n * COL, back), at(a0 + n * COL, zNear), at(a0, zNear)])} fill="var(--ink-primary)" fillOpacity={0.03} />
      );
      drawn.push(<polyline key={`${b.name}-axes`} points={pts([at(a0, back), at(a0, zNear), at(a0 + n * COL, zNear)])} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.6} />);
      // The y axis, standing at the block's far left corner (or as far back as is shown), up to his best.
      const [yb, yt] = [at(a0, back), at(a0, back, TALLEST)];
      drawn.push(<line key={`${b.name}-y`} x1={yb[0]} y1={yb[1]} x2={yt[0]} y2={yt[1]} stroke="var(--ink-primary)" strokeOpacity={0.6} />);
      drawn.push(<line key={`${b.name}-y-best`} x1={yt[0] - 3} y1={yt[1]} x2={yt[0] + 3} y2={yt[1]} stroke="var(--ink-primary)" strokeOpacity={0.6} />);
      drawn.push(
        <text key={`${b.name}-name`} x={yt[0] + 5} y={yt[1] + 3} className="fill-[var(--ink-muted)] text-[0.5625rem] font-bold uppercase tracking-wide">
          {b.name} · best ★
        </text>
      );
      // The stats' names along the near edge.
      b.stats.forEach((s, j) => {
        const [tx, ty] = at(a0 + COL * (j + 0.5), zNear);
        drawn.push(
          <text key={`${b.name}-${s.key}-head`} x={tx} y={ty + 11} textAnchor="middle" className="fill-[var(--ink-secondary)] text-[0.5625rem] font-bold uppercase">
            {s.label}
          </text>
        );
      });
    }
    // Back to front, so nearer bars stand over farther ones.
    games.forEach((g, i) => {
      const z = b.z0 + i;
      if (!shown(z)) return;
      const lit = i === picked;
      const [wx, wy] = at(a0 - 8, z + 0.5);
      drawn.push(
        <text
          key={`${b.name}-${g.key}-tag`}
          x={tagX(wx)}
          y={wy + 3}
          textAnchor="end"
          className={`text-[0.5625rem] tabular-nums ${lit ? "fill-[var(--ink-primary)] font-extrabold" : "fill-[var(--ink-muted)]"}`}
        >
          {g.tag}
        </text>
      );
      if (lit) {
        const row = [at(a0, z), at(a0 + n * COL, z), at(a0 + n * COL, z + 1), at(a0, z + 1)];
        drawn.push(<polygon key={`${b.name}-${g.key}-lit`} points={pts(row)} fill="var(--ink-primary)" fillOpacity={0.12} />);
      }
      b.stats.forEach((s, j) => {
        const v = g.stats ? (Number.isFinite(g.stats[s.key]) ? g.stats[s.key] : 0) : null;
        const [x0, x1] = [a0 + COL * j + COL * 0.22, a0 + COL * (j + 1) - COL * 0.22];
        const [z0, z1] = [z + 0.2, z + 0.8];
        if (v === null) {
          // A week he didn't play: its footprint, empty. Nothing yet for a week to come.
          if (g.future) return;
          drawn.push(
            <polygon key={`${b.name}-${g.key}-${s.key}`} points={pts([at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)])} fill="none" stroke="var(--ink-muted)" strokeOpacity={0.45} strokeDasharray="2 2" />
          );
          return;
        }
        const most = bestOf.get(s.key) || 1;
        const tall = Math.max(1.5, (TALLEST * Math.max(0, v)) / most);
        const tier = g.tiers[s.key];
        const fill = tier ? TIER_FILL[tier] : "var(--ink-primary)";
        const [fl, fr, bl, br] = [at(x0, z1), at(x1, z1), at(x0, z0), at(x1, z0)];
        const [tfl, tfr, tbl, tbr] = [at(x0, z1, tall), at(x1, z1, tall), at(x0, z0, tall), at(x1, z0, tall)];
        // Its side toward the middle of the chart, its top, its front.
        const leftOfMiddle = (fl[0] + fr[0]) / 2 < middle;
        drawn.push(
          <g key={`${b.name}-${g.key}-${s.key}`} opacity={lit ? 1 : 0.8}>
            <polygon points={pts(leftOfMiddle ? [fr, br, tbr, tfr] : [fl, bl, tbl, tfl])} fill={fill} fillOpacity={0.3} />
            <polygon points={pts([tbl, tbr, tfr, tfl])} fill={fill} fillOpacity={0.75} />
            <polygon points={pts([fl, fr, tfr, tfl])} fill={fill} fillOpacity={0.5} stroke={fill} strokeWidth={lit ? 1 : 0.5} />
            {lit ? (
              <text x={(tfl[0] + tfr[0]) / 2} y={Math.min(tfl[1], tbl[1]) - 3} textAnchor="middle" className="fill-[var(--ink-primary)] text-[0.625rem] font-extrabold tabular-nums">
                {Number.isInteger(v) ? v : v.toFixed(1)}
              </text>
            ) : null}
          </g>
        );
      });
    });
  }
  // Below, while the secondary stats are still off the floor: where they are.
  const more = blocks.length > 1 && off.z < maxZ - 0.5;

  return (
    <>
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-[7] h-full w-full">
        <defs>
          <clipPath id="floor-stat-bars-clip">
            <rect x={left} y={top} width={Math.max(0, right - left)} height={Math.max(0, bottom - top)} />
          </clipPath>
        </defs>
        <g clipPath="url(#floor-stat-bars-clip)">{drawn}</g>
        {more ? (
          <text x={right - 6} y={top + 12} textAnchor="end" className="fill-[var(--ink-muted)] text-[0.5625rem] font-bold uppercase tracking-wide">
            Swipe up · secondary stats ↓
          </text>
        ) : null}
      </svg>
      {/* What's dragged: the floor's stretch of the screen. */}
      <div
        ref={setPad}
        data-floor-ui
        className="fixed z-[8] cursor-grab touch-none active:cursor-grabbing"
        style={{ top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }}
        aria-label="Drag along the floor for every game and stat"
      />
    </>
  );
}
