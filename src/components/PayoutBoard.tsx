"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BOARD_TILT, BlockFace, blockFaces, boardProjector } from "@/lib/board-3d";
import { formatMoney as money } from "@/lib/payout-plan";

// The payouts grid as a board seen at the dashboard map's opening angle:
// managers down it (the first at the back), weeks across, then the season's
// awards, the total and the net. The weeks and the season's awards are sunk
// into the board as a tray, as deep as the biggest cube is tall; every payout
// sits in it as a cube with its amount on top, its face as big (in area) as
// the amount — the regular season, the playoffs and the season's awards each
// on their own scale. Stacked, each manager's cubes slim to the smallest
// cube's size and lie end to end in one bar along their row, as long as
// everything they've won. All in px at the board's near edge, where the
// perspective leaves things their true size.

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

/** The columns, left to right, in px at the near edge (the weeks', and the season's, at least). */
const MIN_MANAGER = 112;
const MIN_WEEK = 28;
const SEASON_COL = 56;
const TOTAL_COL = 56;
const NET_COL = 56;
/** The header strip at the back (week numbers, and the regular season/playoffs labels over them), and each manager's row. */
const HEADER_DEPTH = 46;
const ROW_DEPTH = 44;
/** The room a cube leaves to the edges of its square, so the biggest a cube can be. */
const CUBE_GAP = 4;
const MAX_CUBE = ROW_DEPTH - 2 * CUBE_GAP;
/** The amount on a cube's top: its size, each character's width (in ems: the font is monospaced), and the room either side. */
const CUBE_FONT = 10.5;
const CHAR_EM = 0.5;
const FACE_PAD = 3;
/** Room past the end of a stacked bar for its total, and between the pieces while they make room to lengthen. */
const BAR_LABEL = 44;
const MAKE_ROOM = 6;
/** The board leans back a little less than the map, so the tray's walls hide less of it. */
const TILT = BOARD_TILT - 2;
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
/** A cube's top, where its amount sits (the legend's amounts sit on the same). */
export const CUBE_TOP = FACE.top;

/** The tray's faces: its floor faintly, the walls a little more, the board's front edge most. */
const TRAY = {
  floor: "color-mix(in srgb, var(--map-tag) 4%, transparent)",
  back: "color-mix(in srgb, var(--map-tag) 10%, transparent)",
  side: "color-mix(in srgb, var(--map-tag) 7%, transparent)",
  edge: "color-mix(in srgb, var(--map-tag) 13%, transparent)",
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

/** How wide an amount (or any text) is on a cube's top at `size`, and the side a cube needs for it to fit. */
const textWidth = (amount: number | string, size = CUBE_FONT) => (typeof amount === "number" ? money(amount) : amount).length * CHAR_EM * size;
const sideFor = (amount: number) => textWidth(amount) + 2 * FACE_PAD;

/** The stretches of the season whose payouts are sized against each other. */
type Stretch = "regular" | "playoffs" | "season";

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
  /** Each manager's cubes laid end to end in one bar along their row (animated in and out). */
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

  // The cubes rise off the tray's floor the first time it scrolls into view.
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

  // Every payout, with the stretch of the season it's sized in.
  const stretchOf = (k: number): Stretch => (k >= weeks.length ? "season" : weeks[k] > regularSeasonWeeks ? "playoffs" : "regular");
  const paid = rows.map((r) =>
    [...r.weeks, ...(r.season ? [r.season] : [])]
      .map((c, k) => ({ c, k, stretch: stretchOf(k) }))
      .filter(({ c }) => c.amount > 0)
  );
  // In each stretch a cube's side goes with the square root of the amount (so its face's area with the
  // amount), at least big enough for every amount to fit on its cube's top — and no bigger than a row.
  const scales = new Map<Stretch, { least: number; most: number; biggest: number }>();
  for (const { c, stretch } of paid.flat()) {
    const s = scales.get(stretch) ?? { least: 0, most: Infinity, biggest: 0 };
    s.least = Math.max(s.least, sideFor(c.amount) / Math.sqrt(c.amount));
    s.biggest = Math.max(s.biggest, c.amount);
    s.most = MAX_CUBE / Math.sqrt(s.biggest);
    scales.set(stretch, s);
  }
  const needs = (stretch: Stretch) => {
    const s = scales.get(stretch);
    return s ? Math.min(s.least, s.most) * Math.sqrt(s.biggest) + 2 * CUBE_GAP : 0;
  };
  const minWeek = Math.ceil(Math.max(MIN_WEEK, needs("regular"), needs("playoffs")));
  const seasonCol = hasSeason ? Math.ceil(Math.max(SEASON_COL, needs("season"))) : 0;

  const moneyCols = seasonCol + TOTAL_COL + NET_COL;
  const minWidth = managerCol + weeks.length * minWeek + moneyCols;
  const W = Math.max(width, minWidth);
  const weekCol = (W - managerCol - moneyCols) / Math.max(1, weeks.length);
  const weekX = (i: number) => managerCol + i * weekCol;
  const seasonX = managerCol + weeks.length * weekCol;
  const totalX = seasonX + seasonCol;
  const netX = totalX + TOTAL_COL;
  const depth = HEADER_DEPTH + rows.length * ROW_DEPTH;
  const project = boardProjector(W, depth, TILT);
  const center = W / 2;
  const rowY = (i: number) => HEADER_DEPTH + i * ROW_DEPTH;
  const cellX = (k: number) => (k >= weeks.length ? seasonX + seasonCol / 2 : weekX(k) + weekCol / 2);

  // Each stretch's scale: as big as its squares leave room for, never smaller than its amounts need.
  const scaleOf = new Map<Stretch, number>();
  for (const [stretch, s] of scales) {
    const room = (stretch === "season" ? seasonCol : weekCol) - 2 * CUBE_GAP;
    scaleOf.set(stretch, Math.max(Math.min(s.least, s.most), Math.min(s.most, room / Math.sqrt(s.biggest))));
  }
  const sideOf = (amount: number, stretch: Stretch) => scaleOf.get(stretch)! * Math.sqrt(amount);
  const sides = paid.flat().map(({ c, stretch }) => sideOf(c.amount, stretch));
  /** The tray's depth: the biggest cube's top is level with the board. */
  const sunk = Math.max(0, ...sides);
  // The tray: from the manager column to the totals, under every manager.
  const trayX0 = managerCol;
  const trayX1 = totalX;
  // Stacked, the smallest amount's cube stays as it is and every other piece takes its height and depth,
  // as long as it needs for its front face to go with its amount — unless a bar would overrun the tray.
  const least = Math.min(...paid.flat().map(({ c }) => c.amount));
  const base = Math.min(sunk, ...paid.flat().filter(({ c }) => c.amount === least).map(({ c, stretch }) => sideOf(c.amount, stretch)));
  const room = trayX1 - trayX0 - 2 * CUBE_GAP - BAR_LABEL;
  const longest = Math.max(1, ...paid.map((cells) => cells.reduce((s, { c }) => s + (c.amount / least) * base, 0)));
  const perDollar = (base / least) * Math.min(1, room / longest);
  const barX = trayX0 + CUBE_GAP;

  // Stacking: first the cubes move apart (as little as they can) to make room, then each takes the base's
  // height and depth and lengthens to its amount, then they slide left together into one bar.
  const apart = stage(stack, 0, 0.33);
  const grow = stage(stack, 0.3, 0.66);
  const close = stage(stack, 0.63, 1);
  // Where each cube is now: its middle, its length across, its depth and its height.
  const geometry = paid.map((cells, i) => {
    const y = rowY(i) + ROW_DEPTH / 2;
    const lengths = cells.map(({ c }) => c.amount * perDollar);
    // Room to lengthen in: each piece as near its own square as the ones before it allow, then pulled back in from the tray's far wall.
    const starts: number[] = [];
    lengths.forEach((len, n) => {
      const after = n ? starts[n - 1] + lengths[n - 1] + MAKE_ROOM : barX;
      starts.push(Math.max(cellX(cells[n].k) - len / 2, after));
    });
    let limit = trayX1 - CUBE_GAP;
    for (let n = lengths.length - 1; n >= 0; n--) {
      starts[n] = Math.min(starts[n], limit - lengths[n]);
      limit = starts[n] - MAKE_ROOM;
    }
    const squeezed = starts.length > 0 && starts[0] < barX;
    let along = barX;
    const pieces = cells.map(({ c, k, stretch: st }, n) => {
      const side = sideOf(c.amount, st);
      const len = lengths[n];
      const stacked = along + len / 2;
      const roomy = squeezed ? stacked : starts[n] + len / 2;
      const thick = lerp(side, base, grow);
      const x = close > 0 ? lerp(roomy, stacked, close) : lerp(cellX(k), roomy, apart);
      along += len;
      return { k, c, side, x, y, len: lerp(side, len, grow), d: thick, h: thick };
    });
    return { pieces, y, end: along };
  });

  const pt = (x: number, y: number, h = 0) => {
    const [sx, sy] = project(x, y, h);
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  };
  const quad = (...corners: [number, number, number][]) => corners.map(([x, y, h]) => pt(x, y, h)).join(" ");
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

  // The board's extent once projected — its top at the back, the tray's floor at the front — so the drawing is cropped to it.
  const extent = [project(0, 0), project(W, 0), project(0, depth), project(W, depth), project(0, depth, -sunk), project(W, depth, -sunk)];
  const minX = Math.min(...extent.map((p) => p[0])) - 2;
  const maxX = Math.max(...extent.map((p) => p[0])) + 2;
  const minY = Math.min(...extent.map((p) => p[1])) - 8;
  const maxY = Math.max(...extent.map((p) => p[1])) + 2;

  const firstPlayoff = weeks.indexOf(regularSeasonWeeks + 1);
  const live = weeks.findIndex((_, i) => rows.some((r) => r.weeks[i]?.live));
  const D = -sunk;
  /** A line along the board at `y`, dipping into the tray across it. */
  const across = (y: number) => [pt(0, y), pt(trayX0, y), pt(trayX0, y, D), pt(trayX1, y, D), pt(trayX1, y), pt(W, y)].join(" ");
  /** A line down the board at `x` inside the tray: over the header, down the tray's back wall, along its floor. */
  const down = (x: number) => [pt(x, 0), pt(x, HEADER_DEPTH), pt(x, HEADER_DEPTH, D), pt(x, depth, D)].join(" ");

  const floor = (
    <g>
      {/* The tray: its floor, its back and side walls (their insides, facing the camera), and the board's front edge either side. */}
      <polygon points={quad([trayX0, HEADER_DEPTH, D], [trayX1, HEADER_DEPTH, D], [trayX1, depth, D], [trayX0, depth, D])} style={{ fill: TRAY.floor }} />
      <polygon points={quad([trayX0, HEADER_DEPTH, 0], [trayX1, HEADER_DEPTH, 0], [trayX1, HEADER_DEPTH, D], [trayX0, HEADER_DEPTH, D])} style={{ fill: TRAY.back }} />
      <polygon points={quad([trayX0, HEADER_DEPTH, 0], [trayX0, depth, 0], [trayX0, depth, D], [trayX0, HEADER_DEPTH, D])} style={{ fill: TRAY.side }} />
      <polygon points={quad([trayX1, HEADER_DEPTH, 0], [trayX1, depth, 0], [trayX1, depth, D], [trayX1, HEADER_DEPTH, D])} style={{ fill: TRAY.side }} />
      <polygon points={quad([0, depth, 0], [trayX0, depth, 0], [trayX0, depth, D], [0, depth, D])} style={{ fill: TRAY.edge }} />
      <polygon points={quad([trayX1, depth, 0], [W, depth, 0], [W, depth, D], [trayX1, depth, D])} style={{ fill: TRAY.edge }} />
      {/* The week in progress, shaded the length of the board. */}
      {live >= 0 ? (
        <polygon
          points={[
            pt(weekX(live), 0),
            pt(weekX(live) + weekCol, 0),
            pt(weekX(live) + weekCol, HEADER_DEPTH),
            pt(weekX(live) + weekCol, HEADER_DEPTH, D),
            pt(weekX(live) + weekCol, depth, D),
            pt(weekX(live), depth, D),
            pt(weekX(live), HEADER_DEPTH, D),
            pt(weekX(live), HEADER_DEPTH),
          ].join(" ")}
          style={{ fill: "color-mix(in srgb, var(--map-tag) 9%, transparent)" }}
        />
      ) : null}
      <g style={{ fill: "none", stroke: "var(--color-grid)", strokeWidth: 1, strokeLinejoin: "round" }}>
        {/* A line under the header and between managers, and the tray's edges. */}
        {rows.map((_, i) => (
          <polyline key={i} points={across(rowY(i))} />
        ))}
        <polyline points={[pt(trayX0, HEADER_DEPTH), pt(trayX0, depth), pt(trayX0, depth, D)].join(" ")} />
        <polyline points={[pt(trayX1, HEADER_DEPTH), pt(trayX1, depth), pt(trayX1, depth, D)].join(" ")} />
        <polyline points={[pt(0, depth), pt(trayX0, depth)].join(" ")} />
        <polyline points={[pt(trayX1, depth), pt(W, depth)].join(" ")} />
        <polyline points={[pt(0, depth, D), pt(W, depth, D)].join(" ")} />
        {/* Where the playoffs start. */}
        {firstPlayoff > 0 ? <polyline points={down(weekX(firstPlayoff))} /> : null}
        {/* Where the season's awards start. */}
        {hasSeason ? <polyline points={down(seasonX)} /> : null}
      </g>

    </g>
  );

  // The cubes, a row at a time back to front; in a row, the ones farther from the middle first (the nearer
  // ones hide their sides). Each has its amount on its top until it lengthens; stacked, the week it was won.
  const amountsShown = 1 - clamp01((stack - 0.3) / 0.1);
  const weeksShown = clamp01((stack - 0.4) / 0.1);
  const onTop = (text: string, room: number) => Math.min(CUBE_FONT, (room - 2 * FACE_PAD) / textWidth(text, 1));
  const standing = rows.map((r, i) => {
    const order = [...geometry[i].pieces].sort((a, b) => Math.abs(b.x - center) - Math.abs(a.x - center));
    return (
      <g key={r.key}>
        {order.map((p) => {
          const h = p.h * rise;
          const won = p.k >= weeks.length ? "Season" : `W${weeks[p.k]}`;
          return (
            <g key={p.k} style={{ opacity: p.c.live ? 0.7 : 1 }}>
              <title>{p.c.title}</title>
              <Cube faces={blockFaces(project, p.x - p.len / 2, p.x + p.len / 2, p.y - p.d / 2, p.y + p.d / 2, h, center, D)} />
              {amountsShown > 0 && rise > 0.6
                ? label(p.x, p.y, D + h, money(p.c.amount), onTop(money(p.c.amount), p.side), {
                    textAnchor: "middle",
                    fontWeight: 700,
                    className: "tabular-nums",
                    style: { fill: "var(--map-tag-ink)", fontStyle: p.c.live ? "italic" : undefined, opacity: amountsShown * clamp01((rise - 0.6) / 0.4) },
                  })
                : null}
              {weeksShown > 0
                ? label(p.x, p.y, D + h, won, onTop(won, p.len), {
                    textAnchor: "middle",
                    fontWeight: 700,
                    style: { fill: "var(--map-tag-ink)", fontStyle: p.c.live ? "italic" : undefined, opacity: weeksShown * rise },
                  })
                : null}
            </g>
          );
        })}
      </g>
    );
  });

  // Over everything, outlined in the card's color: the headings, each manager's name, total and net, and once stacked, each bar's total at its end.
  const totalShown = clamp01((stack - 0.9) / 0.1);
  const overlay = (
    <g>
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
        {hasSeason ? label(seasonX + seasonCol / 2, 21, 0, "Season", FONT.header, { textAnchor: "middle", fontWeight: 500 }) : null}
        {label(totalX + TOTAL_COL / 2, 21, 0, "Total", FONT.header, { textAnchor: "middle", fontWeight: 500 })}
        {label(netX + NET_COL - 2, 21, 0, "Net", FONT.header, { textAnchor: "end", fontWeight: 500 })}
      </g>
      {rows.map((r, i) => {
        const y = rowY(i);
        const { pieces, end } = geometry[i];
        return (
          <g key={r.key}>
            {label(4, y + ROW_DEPTH * 0.36, 0, r.name, FONT.name, { fontWeight: 600, style: { fill: "var(--color-ink-primary)", ...HALO } })}
            {label(4, y + ROW_DEPTH * 0.72, 0, r.username, FONT.username, { style: { fill: "var(--color-ink-muted)", ...HALO } })}
            {label(totalX + TOTAL_COL / 2, y + ROW_DEPTH / 2, 0, money(r.total), FONT.label, {
              textAnchor: "middle",
              fontWeight: 700,
              className: "tabular-nums",
              style: { fill: "var(--color-ink-primary)", ...HALO },
            })}
            <g>
              <title>Total won, less the buy-in</title>
              {label(netX + NET_COL - 2, y + ROW_DEPTH / 2, 0, `${r.net > 0 ? "+" : r.net < 0 ? "−" : ""}${money(Math.abs(r.net))}`, FONT.label, {
                textAnchor: "end",
                className: "tabular-nums",
                style: { fill: r.net > 0 ? "var(--color-status-good)" : r.net < 0 ? "var(--color-status-critical)" : "var(--color-ink-muted)", ...HALO },
              })}
            </g>
            {totalShown > 0 && pieces.length ? (
              <g style={{ opacity: totalShown }}>
                <title>{`${r.name}: ${money(r.total)} won`}</title>
                {label(end + 6, y + ROW_DEPTH / 2, D + (base * rise) / 2, money(r.total), FONT.label + 0.5, {
                  fontWeight: 700,
                  className: "tabular-nums",
                  style: { fill: "var(--color-ink-primary)", ...HALO },
                })}
              </g>
            ) : null}
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
          aria-label={
            stacked
              ? "Each manager's payouts laid end to end in one bar, as long as their total"
              : "Payouts by week for each manager: every payout sits on its square as a cube, its face as big as the amount"
          }
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
