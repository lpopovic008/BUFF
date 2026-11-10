"use client";

import { useEffect, useState } from "react";
import { FLOOR_TILT, floorDepth, floorPoint, floorScale, HORIZON_SHARE, PERSPECTIVE_PX } from "@/lib/grid-room";
import { ChevronLeftIcon } from "@/components/ui/Icon";

/** What the League Room's floor offers, each a button lying on a square of its grid. */
export type FloorAction = "bench" | "graph" | "payouts" | "writeups" | "history" | "more";

type Pt = [number, number];
/** A ring of points around (cx, cy), radius r, in an icon's unit square. */
const ring = (cx: number, cy: number, r: number, n = 28): Pt[] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
/** Part of a ring, from angle a0 to a1 (radians). */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 16): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(a0 + ((a1 - a0) * i) / n), cy + r * Math.sin(a0 + ((a1 - a0) * i) / n)]);

/**
 * Each button: what it's for, and its icon — lines in a unit square on the button's upright face, across it left to
 * right and down it top to bottom.
 */
export const FLOOR_ACTIONS: { id: FloorAction; label: string; icon: Pt[][] }[] = [
  {
    id: "bench",
    label: "Bench",
    // Two players sat on a bench.
    icon: [
      ring(0.3, 0.24, 0.1),
      ring(0.7, 0.24, 0.1),
      arc(0.3, 0.6, 0.19, Math.PI, 2 * Math.PI),
      arc(0.7, 0.6, 0.19, Math.PI, 2 * Math.PI),
      [[0.04, 0.62], [0.96, 0.62]],
      [[0.14, 0.62], [0.14, 0.9]],
      [[0.86, 0.62], [0.86, 0.9]],
    ],
  },
  {
    id: "graph",
    label: "Score graph",
    // Two teams' points climbing over the week, each to where it's got to.
    icon: [
      [[0.08, 0.06], [0.08, 0.92], [0.94, 0.92]],
      [[0.18, 0.76], [0.38, 0.52], [0.56, 0.6], [0.8, 0.2]],
      [[0.18, 0.84], [0.42, 0.72], [0.6, 0.44], [0.8, 0.48]],
      ring(0.8, 0.2, 0.045, 12),
      ring(0.8, 0.48, 0.045, 12),
    ],
  },
  {
    id: "payouts",
    label: "Payouts",
    // A banknote.
    icon: [
      [[0.04, 0.24], [0.96, 0.24], [0.96, 0.76], [0.04, 0.76], [0.04, 0.24]],
      [[0.1, 0.3], [0.9, 0.3], [0.9, 0.7], [0.1, 0.7], [0.1, 0.3]],
      ring(0.5, 0.5, 0.13),
      ring(0.22, 0.5, 0.03, 10),
      ring(0.78, 0.5, 0.03, 10),
    ],
  },
  {
    id: "writeups",
    label: "Write-ups",
    // A page with its corner folded, written on, and the pencil writing it.
    icon: [
      [[0.14, 0.06], [0.54, 0.06], [0.72, 0.24], [0.72, 0.94], [0.14, 0.94], [0.14, 0.06]],
      [[0.54, 0.06], [0.54, 0.24], [0.72, 0.24]],
      [[0.26, 0.42], [0.6, 0.42]],
      [[0.26, 0.56], [0.6, 0.56]],
      [[0.26, 0.7], [0.44, 0.7]],
      [[0.6, 0.86], [0.88, 0.46], [0.96, 0.52], [0.68, 0.92], [0.58, 0.96], [0.6, 0.86]],
    ],
  },
  {
    id: "history",
    label: "League history",
    // A clock's face turned back.
    icon: [arc(0.5, 0.5, 0.4, -0.6 * Math.PI, 1.05 * Math.PI, 28), [[0.02, 0.36], [0.105, 0.47], [0.22, 0.38]], [[0.5, 0.28], [0.5, 0.52], [0.66, 0.62]]],
  },
  {
    id: "more",
    label: "More to come",
    // Kept for something else.
    icon: [ring(0.22, 0.5, 0.06, 14), ring(0.5, 0.5, 0.06, 14), ring(0.78, 0.5, 0.06, 14)],
  },
];

const SIN = Math.sin((FLOOR_TILT * Math.PI) / 180);
const COS = Math.cos((FLOOR_TILT * Math.PI) / 180);

/** Where on the screen the room's floor point (`across`, `d` back from the hinge) shows, `h` up off it — the hinge at screen y `hinge`. */
function standing(across: number, d: number, h: number, width: number, hinge: number): [number, number] {
  const toward = Math.min(d * SIN + h * COS, PERSPECTIVE_PX * 0.97);
  const s = PERSPECTIVE_PX / (PERSPECTIVE_PX - toward);
  return [width / 2 + across * s, hinge + (d * COS - h * SIN) * s];
}

/** A button's shape, for its width: how tall it stands, how thick it is, and the gap to the next. */
const BLOCK = { height: 0.78, thick: 0.42, gap: 0.16 };
/** The widest a button's face is drawn on the screen (px). */
const MOST_FACE_PX = 112;
/** How far in front of where its top would be level with the horizon a button stands (floor px): its top just shows. */
const CLEAR = 8;
/** How much of the buttons' reflection the floor shows under them, and the room left under that (px). */
const REFLECTION_SHOWN = 0.6;
const UNDER_PX = 8;
/** The horizon's lowest (a share of the screen's height), however short the buttons. */
const LOWEST_SHARE = 0.86;

/** The floor's buttons, standing in a row: how wide each is, how tall, how thick, the gap between, where their faces stand (floor px). */
export interface FloorButtonRow {
  /** Where the horizon is (a share of the screen's height) for the floor to show them, and no more. */
  share: number;
  width: number;
  height: number;
  thick: number;
  gap: number;
  depth: number;
}

/**
 * The floor's buttons as a row of six standing upright across it, as wide together as `span` (px, across the screen's
 * middle) allows: just in front of where their tops would rise past the horizon, so they never stand over what's above
 * it — and the horizon (`share`) just high enough over `bottom` (screen y) for the floor to show them and their
 * reflections: the room looked at as straight on as they allow.
 */
export function floorButtonRow(screenW: number, screenH: number, bottom: number, span: number): FloorButtonRow {
  const n = FLOOR_ACTIONS.length;
  const units = n + (n - 1) * BLOCK.gap;
  const wanted = Math.min(span, units * MOST_FACE_PX);
  const depthFor = (w: number) => (w * BLOCK.height * SIN) / COS + w * BLOCK.thick + CLEAR;
  const scaleAt = (d: number) => PERSPECTIVE_PX / (PERSPECTIVE_PX - Math.min(d * SIN, PERSPECTIVE_PX * 0.97));
  // As wide as fits: a wider button stands nearer, and so shows bigger still.
  let [lo, hi] = [2, 200];
  for (let i = 0; i < 40; i++) {
    const w = (lo + hi) / 2;
    if (depthFor(w) * SIN < PERSPECTIVE_PX * 0.9 && w * units * scaleAt(depthFor(w)) <= wanted) lo = w;
    else hi = w;
  }
  const width = lo;
  const height = width * BLOCK.height;
  const depth = depthFor(width);
  const front = standing(0, depth, 0, screenW, 0)[1];
  const reflected = standing(0, depth, -height, screenW, 0)[1];
  const below = front + (reflected - front) * REFLECTION_SHOWN + UNDER_PX;
  const share = Math.min(LOWEST_SHARE, Math.max(HORIZON_SHARE, (bottom - below) / screenH));
  return { share, width, height, thick: width * BLOCK.thick, gap: width * BLOCK.gap, depth };
}

const path = (pts: [number, number][], close = true) => pts.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + (close ? "Z" : "");

/** A button's faces, lit from above: its top palest, its sides between, its front darkest. */
const FACE = {
  front: "color-mix(in srgb, var(--ink-primary) 8%, var(--page))",
  frontLit: "color-mix(in srgb, var(--ink-primary) 15%, var(--page))",
  side: "color-mix(in srgb, var(--ink-primary) 13%, var(--page))",
  top: "color-mix(in srgb, var(--ink-primary) 22%, var(--page))",
};

/**
 * The League Room's buttons: six blocks standing upright on its floor in a row across it (see floorButtonRow), seen in
 * the room's perspective — each its icon on its face, the floor's own lines hidden behind it, and reflected in the
 * floor under it. Pressed in a little when pressed. Gone (`hidden`) while a panel's up over them.
 */
export function FloorButtons({
  width,
  height,
  row,
  hidden,
  onPick,
}: {
  width: number;
  height: number;
  row: FloorButtonRow;
  hidden: boolean;
  onPick: (action: FloorAction) => void;
}) {
  const hinge = height * row.share;
  const at = (across: number, d: number, h: number) => standing(across, d, h, width, hinge);
  const n = FLOOR_ACTIONS.length;
  const total = n * row.width + (n - 1) * row.gap;
  const [d1, d0] = [row.depth, row.depth - row.thick];
  const side = Math.min(row.width, row.height) * 0.62;
  const blocks = FLOOR_ACTIONS.map((action, i) => {
    const x0 = -total / 2 + i * (row.width + row.gap);
    const x1 = x0 + row.width;
    const cx = (x0 + x1) / 2;
    // Up (h > 0) as it stands, or down (h < 0) as it shows in the floor.
    const faces = (up: number) => {
      const h = row.height * up;
      const front = path([at(x0, d1, 0), at(x1, d1, 0), at(x1, d1, h), at(x0, d1, h)]);
      const top = path([at(x0, d1, h), at(x1, d1, h), at(x1, d0, h), at(x0, d0, h)]);
      // The sides that face the middle, where you stand.
      const sides = [x0 > 0 ? path([at(x0, d1, 0), at(x0, d0, 0), at(x0, d0, h), at(x0, d1, h)]) : null, x1 < 0 ? path([at(x1, d1, 0), at(x1, d0, 0), at(x1, d0, h), at(x1, d1, h)]) : null].filter(
        (f): f is string => f !== null
      );
      const icon = action.icon.map((line) => path(line.map(([u, v]) => at(cx + (u - 0.5) * side, d1, up * (row.height / 2 + (0.5 - v) * side))), false));
      return { front, top, sides, icon };
    };
    return { action, up: faces(1), down: faces(-1) };
  });
  const iconWidth = Math.max(1.25, Math.min(2, side * 0.05 * (at(0, d1, 0)[0] - at(-1, d1, 0)[0])));
  const reflectTop = at(0, d1, 0)[1];
  const reflectBottom = at(0, d1, -row.height)[1];
  const fade = "floor-buttons-fade";
  return (
    <svg
      className={`pointer-events-none fixed inset-0 z-[3] h-full w-full transition-opacity duration-300 ${hidden ? "opacity-0" : ""}`}
      aria-hidden={hidden || undefined}
    >
      <defs>
        <linearGradient id={`${fade}-g`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={reflectTop} y2={reflectBottom}>
          <stop offset="0" stopColor="white" stopOpacity="0.3" />
          <stop offset="0.75" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={fade} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect x="0" y={reflectTop} width={width} height={Math.max(0, reflectBottom - reflectTop)} fill={`url(#${fade}-g)`} />
        </mask>
      </defs>
      {/* Their reflections in the floor, upside down under them, fading out as they go. */}
      <g mask={`url(#${fade})`}>
        {blocks.map(({ action, down }) => (
          <g key={action.id}>
            {down.sides.map((d, j) => (
              <path key={j} d={d} fill={FACE.side} />
            ))}
            <path d={down.front} fill={FACE.front} stroke="var(--ink-primary)" strokeOpacity={0.5} strokeWidth={1} />
            <g fill="none" stroke="var(--ink-primary)" strokeWidth={iconWidth} strokeLinecap="round" strokeLinejoin="round">
              {down.icon.map((d, j) => (
                <path key={j} d={d} />
              ))}
            </g>
          </g>
        ))}
      </g>
      {blocks.map(({ action, up }) => (
        <g
          key={action.id}
          role="button"
          tabIndex={hidden ? -1 : 0}
          aria-label={action.label}
          className={`group cursor-pointer outline-none ${hidden ? "" : "pointer-events-auto"}`}
          onClick={() => onPick(action.id)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            onPick(action.id);
          }}
        >
          <title>{action.label}</title>
          {/* Pressed, it gives a little, down into the floor. */}
          <g className="transition-transform duration-75 group-active:translate-y-[2px]">
            {up.sides.map((d, j) => (
              <path key={j} d={d} fill={FACE.side} stroke="var(--ink-primary)" strokeOpacity={0.35} strokeWidth={1} strokeLinejoin="round" />
            ))}
            <path d={up.top} fill={FACE.top} stroke="var(--ink-primary)" strokeOpacity={0.45} strokeWidth={1} strokeLinejoin="round" />
            <path
              d={up.front}
              fill={FACE.front}
              stroke="var(--ink-primary)"
              strokeOpacity={0.7}
              strokeWidth={1.25}
              strokeLinejoin="round"
              className="transition-[fill] group-hover:[fill:var(--floor-button-lit)] group-focus-visible:[stroke-width:2.5]"
              style={{ ["--floor-button-lit" as string]: FACE.frontLit }}
            />
            <g fill="none" stroke="var(--ink-primary)" strokeWidth={iconWidth} strokeLinecap="round" strokeLinejoin="round" className="opacity-85 transition-opacity group-hover:opacity-100">
              {up.icon.map((d, j) => (
                <path key={j} d={d} />
              ))}
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}

/** A panel's ×, at the right of its title row. */
export function CloseButton({ onClose, label = "Close" }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      title={label}
      className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center border border-ink-primary text-base font-bold leading-none text-ink-primary transition-transform active:scale-90"
    >
      ×
    </button>
  );
}

/** A tile on the floor (see FloorTiles): what it says, what it's for, whether it's lit. */
export interface FloorTile {
  key: string;
  label: string;
  /** Read out for it, when its label's short. */
  title?: string;
  on?: boolean;
  disabled?: boolean;
  onPick: () => void;
}

/**
 * Buttons lying on the room's floor in its perspective, in rows (`rows`, nearest last) down from screen y `top` (no
 * further than `bottom`), each about a finger's height on the screen: each row's tiles side by side across what of
 * the floor shows (in from the screen's sides, and within `left`..`right`), each a quad of the floor with its label
 * upright on it — lit when it's on.
 */
export function FloorTiles({
  rows,
  room,
  top,
  bottom,
  left = 0,
  right,
  label,
}: {
  rows: FloorTile[][];
  room: { width: number; height: number };
  top: number;
  bottom: number;
  left?: number;
  right?: number;
  label: string;
}) {
  const { width: W, height: H } = room;
  const r = right ?? W;
  const rowsShown = rows.filter((row) => row.length > 0);
  if (rowsShown.length === 0 || bottom <= top) return null;
  // Rows from the top down, each about a finger's height on the screen (no taller than shares the room), a gap between.
  const ROW_GAP = 6;
  const rowH = Math.min(TILE_ROW_PX, (bottom - top - ROW_GAP * (rowsShown.length - 1)) / rowsShown.length);
  const GAP = 3;
  return (
    <svg className="pointer-events-none fixed inset-0 z-[7] h-full w-full" role="group" aria-label={label}>
      {rowsShown.map((row, ri) => {
        const y0 = top + ri * (rowH + ROW_GAP);
        const a = floorDepthAt(y0, H);
        const b = floorDepthAt(y0 + rowH, H);
        const mid = (a + b) / 2;
        // What of the floor shows across at the row's near edge (where it's widest): within the screen's sides and
        // left..right.
        const s = floorScale(b);
        const from = Math.max((left + SIDE_MARGIN - W / 2) / s, -(W / 2 - SIDE_MARGIN) / s);
        const to = Math.min((r - SIDE_MARGIN - W / 2) / s, (W / 2 - SIDE_MARGIN) / s);
        const each = (to - from) / row.length;
        return row.map((tile, i) => {
          const t0 = from + each * i + GAP;
          const t1 = from + each * (i + 1) - GAP;
          const corners = [floorPoint(t0, a, W, H), floorPoint(t1, a, W, H), floorPoint(t1, b, W, H), floorPoint(t0, b, W, H)];
          const d = corners.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + "Z";
          const [cx, cy] = floorPoint((t0 + t1) / 2, mid, W, H);
          const height = corners[2][1] - corners[0][1];
          const size = Math.max(10, Math.min(15, height * 0.42));
          return (
            <g
              key={tile.key}
              role="button"
              tabIndex={tile.disabled ? -1 : 0}
              aria-label={tile.title ?? tile.label}
              aria-pressed={tile.on}
              aria-disabled={tile.disabled || undefined}
              className={`group outline-none ${tile.disabled ? "opacity-35" : "pointer-events-auto cursor-pointer"}`}
              onClick={() => !tile.disabled && tile.onPick()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !tile.disabled) {
                  e.preventDefault();
                  tile.onPick();
                }
              }}
            >
              <title>{tile.title ?? tile.label}</title>
              <path
                d={d}
                fill={tile.on ? "var(--ink-primary)" : "var(--page)"}
                fillOpacity={tile.on ? 1 : 0.55}
                stroke="var(--ink-primary)"
                strokeOpacity={tile.on ? 1 : 0.6}
                strokeWidth={1.25}
                className="transition-[fill-opacity] group-hover:[fill-opacity:0.85] group-focus-visible:[stroke-width:2.5]"
              />
              <text
                x={cx}
                y={cy}
                dy="0.35em"
                textAnchor="middle"
                className={`font-bold uppercase tabular-nums ${tile.on ? "fill-[var(--page)]" : "fill-[var(--ink-primary)]"}`}
                style={{ fontSize: size, letterSpacing: "0.04em" }}
              >
                {tile.label}
              </text>
            </g>
          );
        });
      })}
    </svg>
  );
}

/** How far in from the screen's sides a floor tile's still drawn (px). */
const SIDE_MARGIN = 8;

/** How tall a row of floor tiles is on the screen, at most (px). */
const TILE_ROW_PX = 48;

/** How far back on the floor (floor px from the hinge) screen y `y` is. */
function floorDepthAt(y: number, height: number): number {
  return floorDepth(Math.max(y, height * HORIZON_SHARE + 1), height, HORIZON_SHARE);
}

/** How long a panel takes to come up out of the floor, or go back down into it (ms). */
const RISE_MS = 450;

/**
 * A panel up out of the front of the room's floor, as the home page's Red Zone comes up: cut off at the line it comes up
 * out of (`bottom`, screen y), rising from under it to `top`, with no backing of its own, its title across its top —
 * and (`back`, from laptop width up, where the header has no back button of its own) a way back to the floor's buttons.
 * Sinks back down when it's closed (`open` null), then leaves.
 */
export function FrontPanel({
  open,
  title,
  top,
  bottom,
  className = "",
  left,
  width,
  back,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  top: number;
  bottom: number;
  className?: string;
  /** Across the screen: its left edge and width (px) — else `className` places it. */
  left?: number;
  width?: number;
  back?: () => void;
  /** Its × in the top right. */
  onClose?: () => void;
  children: React.ReactNode;
}) {
  // Up (or on its way), and drawn at all: kept drawn while it sinks.
  const [up, setUp] = useState(false);
  const [drawn, setDrawn] = useState(open);
  useEffect(() => {
    if (open) {
      const show = requestAnimationFrame(() => {
        setDrawn(true);
        requestAnimationFrame(() => setUp(true));
      });
      return () => cancelAnimationFrame(show);
    }
    const sink = requestAnimationFrame(() => setUp(false));
    const gone = window.setTimeout(() => setDrawn(false), RISE_MS);
    return () => {
      cancelAnimationFrame(sink);
      window.clearTimeout(gone);
    };
  }, [open]);
  if (!drawn && !open) return null;
  return (
    <div data-floor-ui className={`fixed z-[6] overflow-hidden ${className}`} style={{ top, height: Math.max(0, bottom - top), left, width }}>
      <section
        aria-label={title}
        className="flex h-full flex-col gap-2 transition-transform ease-out"
        style={{ transform: up ? "translateY(0)" : "translateY(100%)", transitionDuration: `${RISE_MS}ms` }}
      >
        <h2 className="flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink-primary">
          {back ? (
            <button type="button" onClick={back} aria-label="Back" title="Back" className="-ml-1 flex h-6 w-6 items-center justify-center text-ink-secondary transition-colors hover:text-ink-primary">
              <ChevronLeftIcon width={16} height={16} />
            </button>
          ) : null}
          {title}
          {onClose ? <CloseButton onClose={onClose} label={`Close ${title}`} /> : null}
        </h2>
        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </div>
  );
}
