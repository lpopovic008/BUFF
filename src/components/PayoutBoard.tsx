"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BlockFace, blockFaces, boardProjector } from "@/lib/board-3d";
import { formatMoney as money } from "@/lib/payout-plan";

// The payouts grid as a board seen at the dashboard map's opening angle:
// managers down it (the first at the back), weeks across, then the season's
// awards, the total and the net. Every payout sits on its square as a cube,
// as big (in volume) as the amount, its amount over it. Stacked, each
// manager's cubes slim down to the smallest cube's base and pile up into one
// bar on the left, as tall as everything they've won. All in px at the
// board's near edge, where the perspective leaves things their true size.

/** One square of the board: a week, or the season's awards. */
export interface BoardCell {
  amount: number;
  /** Not played (or not decided) yet: a dot on the floor. */
  pending: boolean;
  /** The week in progress, whose amounts aren't final. */
  live?: boolean;
  title: string;
}

export interface BoardRow {
  key: number;
  /** The team name, over the manager's username. */
  name: string;
  username: string;
  weeks: BoardCell[];
  season: BoardCell | null;
  total: number;
  net: number;
}

/** The columns, left to right, in px at the near edge. */
const MIN_MANAGER = 112;
const MIN_WEEK = 28;
const SEASON_COL = 56;
const TOTAL_COL = 56;
const NET_COL = 56;
/** The header strip at the back (week numbers, and the regular season/playoffs labels over them — set well back, clear of the first row's cubes), and each manager's row. */
const HEADER_DEPTH = 46;
const ROW_DEPTH = 44;
/** The biggest cube's side and the smallest's, and the room a cube leaves to the edges of its square. */
const MAX_CUBE = 34;
const MIN_CUBE = 6;
const CUBE_GAP = 4;
/** The tallest a manager's bar can be, stacked (a taller pile is squeezed down to it). */
const MAX_STACK = 200;
/** An amount's height over its cube. */
const LABEL_LIFT = 8;
/** How long the cubes take to rise when the board first scrolls into view (desktop only), and to stack (or spread back out). */
const RISE_MS = 1600;
const STACK_MS = 1500;

/** An outline in the card's own color behind text, so it reads over whatever it crosses. */
const HALO = { stroke: "var(--color-surface-raised)", strokeWidth: 3, paintOrder: "stroke", strokeLinejoin: "round" } as const;

const FONT = { name: 13, username: 10.5, header: 11, label: 11.5 };

/** A cube's faces, in the map tags' color: the front full, the side and top washed toward the card as if lit from above. */
const FACE: Record<BlockFace["side"], string> = {
  front: "var(--map-tag)",
  left: "color-mix(in srgb, var(--map-tag) 84%, var(--color-surface-raised))",
  right: "color-mix(in srgb, var(--map-tag) 84%, var(--color-surface-raised))",
  top: "color-mix(in srgb, var(--map-tag) 68%, var(--color-surface-raised))",
};

function Cube({ faces }: { faces: BlockFace[] }) {
  return (
    <>
      {faces.map((f) => (
        // Edged in the card's color, so stacked pieces show where one amount ends and the next begins.
        <polygon key={f.side} points={f.points} style={{ fill: FACE[f.side], stroke: "var(--color-surface-raised)", strokeWidth: 0.75, strokeLinejoin: "round" }} />
      ))}
    </>
  );
}

/** Desktop, and the viewer hasn't asked for less motion. */
function animationsOn(): boolean {
  return window.matchMedia("(min-width: 768px)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** How far along one stage of the stacking is, at `stack` (0: spread out, 1: stacked), for the stage from `a` to `b`. */
const stage = (stack: number, a: number, b: number) => easeInOut(clamp01((stack - a) / (b - a)));

export function PayoutBoard({
  rows,
  weeks,
  regularSeasonWeeks,
  hasSeason,
  stacked,
}: {
  rows: BoardRow[];
  /** The week numbers across the board. */
  weeks: number[];
  regularSeasonWeeks: number;
  /** Whether there's a column for the season's awards. */
  hasSeason: boolean;
  /** Each manager's cubes piled into one bar on the left (animated in and out). */
  stacked: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [managerCol, setManagerCol] = useState(MIN_MANAGER);
  const namesKey = rows.map((r) => r.name).join("\n");
  // The board's width follows its box; the manager column fits the longest team name.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = () => {
      setWidth(Math.round(el.clientWidth));
      if (!ctx) return;
      ctx.font = `600 ${FONT.name}px ${getComputedStyle(el).fontFamily}`;
      const widest = Math.max(0, ...namesKey.split("\n").map((n) => ctx.measureText(n).width));
      setManagerCol(Math.min(Math.max(MIN_MANAGER, Math.ceil(widest) + 14), 220));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [namesKey]);

  // The cubes rise off the board the first time it scrolls into view.
  // Flat to start with where they'll rise (the board isn't drawn until it's measured, so this never reaches the server's markup).
  const [rise, setRise] = useState(() => (typeof window !== "undefined" && animationsOn() ? 0 : 1));
  const rising = rise < 1;
  useEffect(() => {
    const el = wrap.current;
    if (!rising || !el) return;
    let raf = 0;
    const observer = new IntersectionObserver(
      (seen) => {
        if (!seen.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        let start: number | null = null;
        const tick = (now: number) => {
          start ??= now;
          const t = Math.min(1, (now - start) / RISE_MS);
          setRise(1 - Math.pow(1 - t, 3));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
    // Once started it runs to the end: `rising` going false doesn't need to stop it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // How stacked the cubes are, 0 to 1, run toward `stacked` from wherever it is (so a second press mid-way turns it back).
  const [stack, setStack] = useState(stacked ? 1 : 0);
  const stackNow = useRef(stack);
  useEffect(() => {
    const target = stacked ? 1 : 0;
    const from = stackNow.current;
    if (from === target) return;
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : STACK_MS * Math.abs(target - from);
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / ms);
      stackNow.current = lerp(from, target, t);
      setStack(stackNow.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stacked]);

  const moneyCols = (hasSeason ? SEASON_COL : 0) + TOTAL_COL + NET_COL;
  const minWidth = managerCol + weeks.length * MIN_WEEK + moneyCols;
  const W = Math.max(width, minWidth);
  const weekCol = (W - managerCol - moneyCols) / Math.max(1, weeks.length);
  const weekX = (i: number) => managerCol + i * weekCol;
  const seasonX = managerCol + weeks.length * weekCol;
  const totalX = seasonX + (hasSeason ? SEASON_COL : 0);
  const netX = totalX + TOTAL_COL;
  const depth = HEADER_DEPTH + rows.length * ROW_DEPTH;
  const project = boardProjector(W, depth);
  const center = W / 2;
  const rowY = (i: number) => HEADER_DEPTH + i * ROW_DEPTH;

  // Every payout's cube: its volume goes with the amount, so its side with the cube root, scaled so the
  // biggest fits its square (a week's is narrower than the season's). Stacked, each slims to the smallest
  // cube's base, keeping its volume (so its height goes with the amount), and sits on the ones from the
  // weeks before it — every piece squeezed alike if that would pile higher than MAX_STACK.
  const paid = rows.map((r) => [
    ...r.weeks.map((c, k) => ({ c, x: weekX(k) + weekCol / 2, room: weekCol })),
    ...(r.season ? [{ c: r.season, x: seasonX + SEASON_COL / 2, room: SEASON_COL }] : []),
  ].filter(({ c }) => c.amount > 0));
  const roomFor = (room: number) => Math.min(MAX_CUBE, room - 2 * CUBE_GAP, ROW_DEPTH - 2 * CUBE_GAP);
  const scale = Math.min(Infinity, ...paid.flat().map(({ c, room }) => roomFor(room) / Math.cbrt(c.amount)));
  const sideOf = (amount: number) => Math.max(MIN_CUBE, scale * Math.cbrt(amount));
  const sides = paid.flat().map(({ c }) => sideOf(c.amount));
  const biggest = Math.max(0, ...sides);
  const base = Math.min(biggest, ...sides);
  const slimmed = (amount: number) => Math.pow(sideOf(amount), 3) / (base * base);
  const highest = Math.max(1, ...paid.map((cells) => cells.reduce((s, { c }) => s + slimmed(c.amount), 0)));
  const squeeze = Math.min(1, MAX_STACK / highest);
  const barX = managerCol + CUBE_GAP + base / 2;

  const slim = stage(stack, 0, 0.4);
  const lift = stage(stack, 0.3, 0.65);
  const slide = stage(stack, 0.55, 1);
  // Where each cube is now: its middle, its side across (and deep), its height and how far up it sits.
  const geometry = paid.map((cells, i) => {
    const y = rowY(i) + ROW_DEPTH / 2;
    let below = 0;
    const pieces = cells.map(({ c, x }, k) => {
      const side = sideOf(c.amount);
      const tall = slimmed(c.amount) * squeeze;
      const piece = { k, c, x: lerp(x, barX, slide), y, w: lerp(side, base, slim), h: lerp(side, tall, slim), z: lerp(0, below, lift) };
      below += tall;
      return piece;
    });
    return { pieces, y, top: below };
  });
  // Text sits level with the biggest cube's top.
  const raised = biggest;

  const pt = (x: number, y: number, h = 0) => {
    const [sx, sy] = project(x, y, h);
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  };
  /** Text standing upright at a board point, sized by its distance. */
  const label = (
    x: number,
    y: number,
    h: number,
    text: string,
    size: number,
    props: React.SVGProps<SVGTextElement> = {}
  ) => {
    const [sx, sy, s] = project(x, y, h);
    return (
      <text x={sx} y={sy} fontSize={size * s} dominantBaseline="middle" {...props}>
        {text}
      </text>
    );
  };

  // The board's extent once projected — every cube at full height as it stands now, with its amount over it,
  // and the raised headings — so the drawing is cropped to it (and grows and shrinks as the cubes stack).
  const extent = [
    project(0, 0, raised + 8),
    project(W, 0, raised + 8),
    project(0, depth),
    project(W, depth),
    ...geometry.flatMap((g) =>
      g.pieces.flatMap((p) => [project(p.x - p.w / 2, p.y - p.w / 2, p.z + p.h + LABEL_LIFT + 6), project(p.x + p.w / 2, p.y - p.w / 2, p.z + p.h + LABEL_LIFT + 6)])
    ),
  ];
  const minX = Math.min(...extent.map((p) => p[0])) - 2;
  const maxX = Math.max(...extent.map((p) => p[0])) + 2;
  const minY = Math.min(...extent.map((p) => p[1])) - 6;
  const maxY = Math.max(...extent.map((p) => p[1])) + 4;

  const firstPlayoff = weeks.indexOf(regularSeasonWeeks + 1);
  const live = weeks.findIndex((_, i) => rows.some((r) => r.weeks[i]?.live));

  const floor = (
    <g>
      {/* The week in progress, shaded the length of the board. */}
      {live >= 0 ? (
        <polygon
          points={[pt(weekX(live), 0), pt(weekX(live) + weekCol, 0), pt(weekX(live) + weekCol, depth), pt(weekX(live), depth)].join(" ")}
          style={{ fill: "color-mix(in srgb, var(--map-tag) 9%, transparent)" }}
        />
      ) : null}
      {/* A line under the header and between managers. */}
      {rows.map((_, i) => (
        <line
          key={i}
          x1={project(0, rowY(i))[0]}
          y1={project(0, rowY(i))[1]}
          x2={project(W, rowY(i))[0]}
          y2={project(W, rowY(i))[1]}
          stroke="var(--color-grid)"
          strokeWidth={1}
        />
      ))}
      {/* Where the playoffs start. */}
      {firstPlayoff > 0 ? (
        <line
          x1={project(weekX(firstPlayoff), 0)[0]}
          y1={project(weekX(firstPlayoff), 0)[1]}
          x2={project(weekX(firstPlayoff), depth)[0]}
          y2={project(weekX(firstPlayoff), depth)[1]}
          stroke="var(--color-grid)"
          strokeWidth={1}
        />
      ) : null}

      {/* The squares not paid yet. */}
      {rows.map((r, i) => {
        const y = rowY(i) + ROW_DEPTH / 2;
        return (
          <g key={r.key}>
            {r.weeks.map((c, k) =>
              c.amount > 0 ? null : (
                <g key={k}>
                  <title>{c.title}</title>
                  {label(weekX(k) + weekCol / 2, y, 0, c.pending ? "·" : "—", FONT.label, {
                    textAnchor: "middle",
                    style: { fill: "var(--color-ink-muted)", opacity: c.pending ? 1 : 0.5 },
                  })}
                </g>
              )
            )}
            {r.season && r.season.amount <= 0 ? (
              <g>
                <title>{r.season.title}</title>
                {label(seasonX + SEASON_COL / 2, y, 0, r.season.pending ? "·" : "—", FONT.label, {
                  textAnchor: "middle",
                  style: { fill: "var(--color-ink-muted)", opacity: r.season.pending ? 1 : 0.5 },
                })}
              </g>
            ) : null}
          </g>
        );
      })}
    </g>
  );

  // Each manager's name, total and net, level with the biggest cube's top.
  const names = rows.map((r, i) => {
    const y = rowY(i);
    return (
      <g key={r.key}>
        {label(4, y + ROW_DEPTH * 0.36, raised, r.name, FONT.name, { fontWeight: 600, style: { fill: "var(--color-ink-primary)", ...HALO } })}
        {label(4, y + ROW_DEPTH * 0.72, raised, r.username, FONT.username, { style: { fill: "var(--color-ink-muted)", ...HALO } })}
        {label(totalX + TOTAL_COL / 2, y + ROW_DEPTH / 2, raised, money(r.total), FONT.label, {
          textAnchor: "middle",
          fontWeight: 700,
          className: "tabular-nums",
          style: { fill: "var(--color-ink-primary)", ...HALO },
        })}
        <g>
          <title>Total won, less the buy-in</title>
          {label(netX + NET_COL - 2, y + ROW_DEPTH / 2, raised, `${r.net > 0 ? "+" : r.net < 0 ? "−" : ""}${money(Math.abs(r.net))}`, FONT.label, {
            textAnchor: "end",
            className: "tabular-nums",
            style: { fill: r.net > 0 ? "var(--color-status-good)" : r.net < 0 ? "var(--color-status-critical)" : "var(--color-ink-muted)", ...HALO },
          })}
        </g>
      </g>
    );
  });

  // The cubes, a row at a time back to front. In a row, spread out, the ones farther from the middle first
  // (the nearer ones hide their sides); stacking, from the bottom of the pile up.
  const standing = rows.map((r, i) => {
    const order = [...geometry[i].pieces].sort((a, b) => (stack < 0.5 ? Math.abs(b.x - center) - Math.abs(a.x - center) : a.z - b.z));
    return (
      <g key={r.key}>
        {order.map((p) => (
          <g key={p.k} style={{ opacity: p.c.live ? 0.7 : 1 }}>
            <title>{p.c.title}</title>
            <Cube faces={blockFaces(project, p.x - p.w / 2, p.x + p.w / 2, p.y - p.w / 2, p.y + p.w / 2, p.h * rise, center, p.z * rise)} />
          </g>
        ))}
      </g>
    );
  });

  // Over every cube (outlined in the card's color, so they read across any in front): each amount, or once
  // stacked, each bar's total.
  const amountsShown = 1 - clamp01(stack / 0.25);
  const totalShown = clamp01((stack - 0.9) / 0.1);
  const amounts = rows.map((r, i) => {
    const { pieces, y, top } = geometry[i];
    const text = { textAnchor: "middle", fontWeight: 700, className: "tabular-nums" } as const;
    return (
      <g key={r.key}>
        {amountsShown > 0
          ? pieces.map((p) => (
              <g key={p.k} style={{ opacity: amountsShown }}>
                {label(p.x, p.y, (p.z + p.h) * rise + LABEL_LIFT, money(p.c.amount), FONT.label, {
                  ...text,
                  style: { fill: "var(--color-ink-primary)", fontStyle: p.c.live ? "italic" : undefined, ...HALO },
                })}
              </g>
            ))
          : null}
        {totalShown > 0 && pieces.length ? (
          <g style={{ opacity: totalShown }}>
            <title>{`${r.name}: ${money(r.total)} won`}</title>
            {label(barX, y, top * rise + LABEL_LIFT + 1, money(r.total), FONT.label + 0.5, { ...text, style: { fill: "var(--color-ink-primary)", ...HALO } })}
          </g>
        ) : null}
      </g>
    );
  });

  // The header: what each column is, at the back of the board, level with the biggest cube's top.
  const header = (
    <g className="uppercase" style={{ fill: "var(--color-ink-muted)", letterSpacing: "0.05em", ...HALO }}>
      {firstPlayoff !== 0 ? label(weekX(0) + ((firstPlayoff > 0 ? firstPlayoff : weeks.length) * weekCol) / 2, 6, raised, "Regular season", 9, { textAnchor: "middle" }) : null}
      {firstPlayoff > 0 ? label(weekX(firstPlayoff) + ((weeks.length - firstPlayoff) * weekCol) / 2, 6, raised, "Playoffs", 9, { textAnchor: "middle" }) : null}
      {label(4, 21, raised, "Manager", FONT.header, { fontWeight: 500 })}
      {weeks.map((w, i) =>
        i === live ? (
          <g key={w} style={{ fill: "var(--color-ink-primary)" }}>
            {label(weekX(i) + weekCol / 2, 21, raised, String(w), FONT.header, { textAnchor: "middle", fontWeight: 700 })}
            {label(weekX(i) + weekCol / 2, 30, raised, "Live", 8, { textAnchor: "middle", fontWeight: 600 })}
          </g>
        ) : (
          <g key={w}>{label(weekX(i) + weekCol / 2, 21, raised, String(w), FONT.header, { textAnchor: "middle", fontWeight: 500 })}</g>
        )
      )}
      {hasSeason ? label(seasonX + SEASON_COL / 2, 21, raised, "Season", FONT.header, { textAnchor: "middle", fontWeight: 500 }) : null}
      {label(totalX + TOTAL_COL / 2, 21, raised, "Total", FONT.header, { textAnchor: "middle", fontWeight: 500 })}
      {label(netX + NET_COL - 2, 21, raised, "Net", FONT.header, { textAnchor: "end", fontWeight: 500 })}
    </g>
  );

  return (
    // Too narrow for every week (a phone), the board scrolls sideways.
    <div ref={wrap} className="overflow-x-auto">
      {width > 0 ? (
        <svg
          width={maxX - minX}
          height={maxY - minY}
          viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
          className="block max-w-none"
          style={{ width: width >= minWidth ? "100%" : maxX - minX, height: "auto" }}
          role="img"
          aria-label={
            stacked
              ? "Each manager's payouts stacked into one bar, as tall as their total"
              : "Payouts by week for each manager: every payout sits on its square as a cube as big as the amount"
          }
        >
          {floor}
          {header}
          {names}
          {standing}
          {amounts}
        </svg>
      ) : (
        <div style={{ height: HEADER_DEPTH + rows.length * ROW_DEPTH }} />
      )}
    </div>
  );
}
