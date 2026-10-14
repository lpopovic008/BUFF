"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BlockFace, blockFaces, boardProjector } from "@/lib/board-3d";
import { Swatch } from "@/lib/payout-colors";
import { formatMoney as money } from "@/lib/payout-plan";

// The payouts grid as a board seen at the dashboard map's opening angle:
// managers down it (the first at the back), weeks across, then the season's
// awards, the total and the net. Every payout stands on its square as a
// block as tall as the amount, in its rule's color; each manager's total is
// a bar as tall as the total. All in px at the board's near edge, where the
// perspective leaves things their true size.

/** One square of the board: a week, or the season's awards. */
export interface BoardCell {
  amount: number;
  /** Not played (or not decided) yet: a dot on the floor. */
  pending: boolean;
  /** The week in progress, whose amounts aren't final. */
  live?: boolean;
  /** The color of the rule that paid the most of it. */
  swatch?: Swatch;
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
const TOTAL_COL = 64;
const NET_COL = 56;
/** The header strip at the back (week numbers, and the regular season/playoffs labels over them — set well back, clear of the first row's blocks), and each manager's row. */
const HEADER_DEPTH = 46;
const ROW_DEPTH = 44;
/**
 * The tallest payout's height, and the tallest total's. A payout's height
 * goes with the square root of the amount, so a season prize ten times a
 * week's doesn't flatten every week to nothing; a total's is in proportion.
 */
const MAX_BLOCK = 72;
const MAX_BAR = 90;
/** A block's footprint inside its square, and the total bar's. */
const BLOCK_INSET_X = 3;
const BLOCK_INSET_Y = 7;
const BAR_WIDTH = 18;
const BAR_DEPTH = 12;
/** Even the smallest payout stands up off the board. */
const MIN_BLOCK = 4;
/** How long the blocks take to rise when the board first scrolls into view (desktop only). */
const RISE_MS = 1600;

/** An outline in the card's own color behind text, so it reads over whatever it crosses. */
const HALO = { stroke: "var(--color-surface-raised)", strokeWidth: 3, paintOrder: "stroke", strokeLinejoin: "round" } as const;

const FONT = { name: 13, username: 10.5, header: 11, label: 11.5 };

/** The faces of a block, shaded as if lit from above: the top in its color, the sides darker. */
const SHADE: Record<BlockFace["side"], number> = { top: 0, front: 26, left: 40, right: 40 };
const shade = (color: string, side: BlockFace["side"]) =>
  SHADE[side] === 0 ? color : `color-mix(in srgb, ${color} ${100 - SHADE[side]}%, black)`;

function Block({
  faces,
  color,
  edge,
}: {
  faces: BlockFace[];
  color: string;
  edge: string;
}) {
  return (
    <>
      {faces.map((f) => (
        <polygon key={f.side} points={f.points} style={{ fill: shade(color, f.side), stroke: edge, strokeWidth: 0.75, strokeLinejoin: "round" }} />
      ))}
    </>
  );
}

/** Desktop, and the viewer hasn't asked for less motion. */
function animationsOn(): boolean {
  return window.matchMedia("(min-width: 768px)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PayoutBoard({
  rows,
  weeks,
  regularSeasonWeeks,
  hasSeason,
}: {
  rows: BoardRow[];
  /** The week numbers across the board. */
  weeks: number[];
  regularSeasonWeeks: number;
  /** Whether there's a column for the season's awards. */
  hasSeason: boolean;
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

  // The blocks rise off the board the first time it scrolls into view.
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

  const maxCell = Math.max(1, ...rows.flatMap((r) => [...r.weeks, ...(r.season ? [r.season] : [])].map((c) => c.amount)));
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  // Where everything stands, at full height: every payout's block and every total's bar.
  const geometry = rows.map((r, i) => {
    const y0 = rowY(i) + BLOCK_INSET_Y;
    const y1 = rowY(i) + ROW_DEPTH - BLOCK_INSET_Y;
    const cells = [
      ...r.weeks.map((c, k) => ({ c, x: weekX(k), w: weekCol })),
      ...(r.season ? [{ c: r.season, x: seasonX, w: SEASON_COL }] : []),
    ]
      .filter(({ c }) => c.amount > 0)
      .map(({ c, x, w }) => ({ c, x0: x + BLOCK_INSET_X, x1: x + w - BLOCK_INSET_X, y0, y1, h: Math.max(MIN_BLOCK, Math.sqrt(c.amount / maxCell) * MAX_BLOCK) }));
    const bx = totalX + (TOTAL_COL - BAR_WIDTH) / 2;
    const by = rowY(i) + (ROW_DEPTH - BAR_DEPTH) / 2;
    const barH = r.total > 0 ? Math.max(MIN_BLOCK, (r.total / maxTotal) * MAX_BAR) : 0;
    return { cells, bx, by, barH };
  });

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

  // The board's extent once projected, every block and bar at full height (and the total over each bar), so the drawing is cropped to it.
  const extent = [
    project(0, 0),
    project(W, 0),
    project(0, depth),
    project(W, depth),
    ...geometry.flatMap((g) => [
      ...g.cells.flatMap((b) => [project(b.x0, b.y0, b.h), project(b.x1, b.y0, b.h)]),
      project(g.bx, g.by, g.barH + 16),
      project(g.bx + BAR_WIDTH, g.by, g.barH + 16),
    ]),
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

      {/* Each manager: the team name over the username, the squares not paid yet, and the net. */}
      {rows.map((r, i) => {
        const y = rowY(i);
        return (
          <g key={r.key}>
            {label(4, y + ROW_DEPTH * 0.36, 0, r.name, FONT.name, { fontWeight: 600, style: { fill: "var(--color-ink-primary)" } })}
            {label(4, y + ROW_DEPTH * 0.72, 0, r.username, FONT.username, { style: { fill: "var(--color-ink-muted)" } })}
            {r.weeks.map((c, k) =>
              c.amount > 0 ? null : (
                <g key={k}>
                  <title>{c.title}</title>
                  {label(weekX(k) + weekCol / 2, y + ROW_DEPTH / 2, 0, c.pending ? "·" : "—", FONT.label, {
                    textAnchor: "middle",
                    style: { fill: "var(--color-ink-muted)", opacity: c.pending ? 1 : 0.5 },
                  })}
                </g>
              )
            )}
            {r.season && r.season.amount <= 0 ? (
              <g>
                <title>{r.season.title}</title>
                {label(seasonX + SEASON_COL / 2, y + ROW_DEPTH / 2, 0, r.season.pending ? "·" : "—", FONT.label, {
                  textAnchor: "middle",
                  style: { fill: "var(--color-ink-muted)", opacity: r.season.pending ? 1 : 0.5 },
                })}
              </g>
            ) : null}
            <g>
              <title>Total won, less the buy-in</title>
              {label(netX + NET_COL - 2, y + ROW_DEPTH / 2, 0, `${r.net > 0 ? "+" : r.net < 0 ? "−" : ""}${money(Math.abs(r.net))}`, FONT.label, {
                textAnchor: "end",
                className: "tabular-nums",
                style: { fill: r.net > 0 ? "var(--color-status-good)" : r.net < 0 ? "var(--color-status-critical)" : "var(--color-ink-muted)" },
              })}
            </g>
          </g>
        );
      })}
    </g>
  );

  // The blocks and bars, back to front, so the nearer ones stand in front of the farther.
  const standing = rows.map((r, i) => {
    const { cells, bx, by, barH: fullBar } = geometry[i];
    const barH = fullBar * rise;
    return (
      <g key={r.key}>
        {cells.map(({ c, x0, x1, y0, y1, h: full }, k) => {
          const h = full * rise;
          const color = c.swatch?.bg ?? "var(--color-ink-muted)";
          return (
            <g key={k} style={{ opacity: c.live ? 0.75 : 1 }}>
              <title>{c.title}</title>
              <Block faces={blockFaces(project, x0, x1, y0, y1, h, center)} color={color} edge={shade(color, "right")} />
              {label((x0 + x1) / 2, (y0 + y1) / 2, h, money(c.amount), FONT.label, {
                textAnchor: "middle",
                fontWeight: 700,
                className: "tabular-nums",
                style: { fill: c.swatch?.ink ?? "var(--color-surface-raised)", fontStyle: c.live ? "italic" : undefined },
              })}
            </g>
          );
        })}
        {/* The total: a bar as tall as everything won (its amount is drawn over everything, below). */}
        <g>
          <title>{`${r.name}: ${money(r.total)} won`}</title>
          {barH > 0 ? (
            <Block faces={blockFaces(project, bx, bx + BAR_WIDTH, by, by + BAR_DEPTH, barH, center)} color="var(--map-tag)" edge="var(--map-tag)" />
          ) : null}
        </g>
      </g>
    );
  });

  // Drawn over everything, outlined in the card's color so they read across any block: the column
  // headings, and each total's amount over its bar.
  const overlay = (
    <g>
      {/* The header: what each column is, at the back of the board. */}
      <g className="uppercase" style={{ fill: "var(--color-ink-muted)", letterSpacing: "0.05em", ...HALO }}>
        {firstPlayoff !== 0 ? label(weekX(0) + ((firstPlayoff > 0 ? firstPlayoff : weeks.length) * weekCol) / 2, 6, 0, "Regular season", 9, { textAnchor: "middle" }) : null}
        {firstPlayoff > 0 ? label(weekX(firstPlayoff) + ((weeks.length - firstPlayoff) * weekCol) / 2, 6, 0, "Playoffs", 9, { textAnchor: "middle" }) : null}
        {label(4, 21, 0, "Manager", FONT.header, { fontWeight: 500 })}
        {weeks.map((w, i) =>
          i === live ? (
            <g key={w} style={{ fill: "var(--color-ink-primary)" }}>
              {label(weekX(i) + weekCol / 2, 21, 0, String(w), FONT.header, { textAnchor: "middle", fontWeight: 700 })}
              {label(weekX(i) + weekCol / 2, 30, 0, "Live", 8, { textAnchor: "middle", fontWeight: 600 })}
            </g>
          ) : (
            <g key={w}>{label(weekX(i) + weekCol / 2, 21, 0, String(w), FONT.header, { textAnchor: "middle", fontWeight: 500 })}</g>
          )
        )}
        {hasSeason ? label(seasonX + SEASON_COL / 2, 21, 0, "Season", FONT.header, { textAnchor: "middle", fontWeight: 500 }) : null}
        {label(totalX + TOTAL_COL / 2, 21, 0, "Total", FONT.header, { textAnchor: "middle", fontWeight: 500 })}
        {label(netX + NET_COL - 2, 21, 0, "Net", FONT.header, { textAnchor: "end", fontWeight: 500 })}
      </g>

      {rows.map((r, i) => {
        const { by, barH } = geometry[i];
        return (
          <g key={r.key}>
            {label(totalX + TOTAL_COL / 2, by + BAR_DEPTH / 2, barH * rise + 9, money(r.total), FONT.label + 0.5, {
              textAnchor: "middle",
              fontWeight: 700,
              className: "tabular-nums",
              style: { fill: "var(--color-ink-primary)", ...HALO },
            })}
          </g>
        );
      })}
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
          aria-label="Payouts by week for each manager: every payout stands as a block as tall as the amount, and each manager's total as a bar"
        >
          {floor}
          {standing}
          {overlay}
        </svg>
      ) : (
        <div style={{ height: HEADER_DEPTH + rows.length * ROW_DEPTH }} />
      )}
    </div>
  );
}
