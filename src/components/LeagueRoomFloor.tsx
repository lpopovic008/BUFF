"use client";

import { useEffect, useState } from "react";
import { floorDepth, floorPoint, floorScale, floorY, GRID_PX, HORIZON_SHARE } from "@/lib/grid-room";
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
 * Each button: what it's for, and its icon — lines in a unit square, across it left to right and back to front (0 the
 * far side, as it lies on the floor), drawn lying on its square.
 */
export const FLOOR_ACTIONS: { id: FloorAction; label: string; icon: Pt[][] }[] = [
  {
    id: "bench",
    label: "Bench",
    // Two players on a bench.
    icon: [ring(0.32, 0.3, 0.11), ring(0.68, 0.3, 0.11), arc(0.32, 0.72, 0.2, Math.PI, 2 * Math.PI), arc(0.68, 0.72, 0.2, Math.PI, 2 * Math.PI), [[0.06, 0.86], [0.94, 0.86]]],
  },
  {
    id: "graph",
    label: "Score graph",
    // Two teams' points climbing over the week.
    icon: [
      [[0.1, 0.08], [0.1, 0.9], [0.92, 0.9]],
      [[0.16, 0.78], [0.38, 0.52], [0.58, 0.62], [0.88, 0.18]],
      [[0.16, 0.84], [0.42, 0.7], [0.62, 0.44], [0.88, 0.4]],
    ],
  },
  {
    id: "payouts",
    label: "Payouts",
    // A coin with a dollar sign.
    icon: [
      ring(0.5, 0.5, 0.42),
      [[0.66, 0.33], [0.6, 0.27], [0.5, 0.25], [0.4, 0.27], [0.35, 0.34], [0.38, 0.43], [0.5, 0.48], [0.62, 0.53], [0.66, 0.62], [0.62, 0.71], [0.5, 0.75], [0.4, 0.73], [0.34, 0.67]],
      [[0.5, 0.17], [0.5, 0.83]],
    ],
  },
  {
    id: "writeups",
    label: "Write-ups",
    // A page with its corner folded, written on.
    icon: [
      [[0.22, 0.08], [0.62, 0.08], [0.8, 0.26], [0.8, 0.92], [0.22, 0.92], [0.22, 0.08]],
      [[0.62, 0.08], [0.62, 0.26], [0.8, 0.26]],
      [[0.34, 0.44], [0.68, 0.44]],
      [[0.34, 0.58], [0.68, 0.58]],
      [[0.34, 0.72], [0.58, 0.72]],
    ],
  },
  {
    id: "history",
    label: "League history",
    // A clock.
    icon: [ring(0.5, 0.5, 0.42), [[0.5, 0.22], [0.5, 0.5], [0.7, 0.62]]],
  },
  {
    id: "more",
    label: "More to come",
    // Kept for something else.
    icon: [
      [[0.5, 0.24], [0.5, 0.76]],
      [[0.24, 0.5], [0.76, 0.5]],
    ],
  },
];

/** How much of its square an icon takes. */
const ICON_SHARE = 0.6;
/** How far in from the screen's sides a square's still counted (px). */
const SIDE_MARGIN = 8;

/**
 * The League Room's buttons lying on its floor: two rows of three squares of the floor's grid — the middle column and
 * those either side of it, in the last two rows before `bottom` (screen y: a phone's tab bar, or the columns' foot) —
 * each an icon drawn flat on its square, as the floor's own lines are, foreshortened toward the horizon. A square
 * partly off the screen keeps its icon on the part that shows. Gone (`hidden`) while a panel's up over them.
 */
export function FloorButtons({
  width,
  height,
  bottom,
  hidden,
  onPick,
}: {
  width: number;
  height: number;
  bottom: number;
  hidden: boolean;
  onPick: (action: FloorAction) => void;
}) {
  // The last grid line above the bottom, and the two rows before it.
  let last = 0;
  while (floorY((last + 1) * GRID_PX, height, HORIZON_SHARE) <= bottom && last < 40) last++;
  if (last < 2) return null;
  const at = (across: number, depth: number) => floorPoint(across, depth, width, height, HORIZON_SHARE);
  const cells = FLOOR_ACTIONS.map((action, i) => {
    const row = i < 3 ? last - 2 : last - 1;
    const column = (i % 3) - 1;
    const [d0, d1] = [row * GRID_PX, (row + 1) * GRID_PX];
    // The part of the square that shows, across, at its middle depth.
    const seen = (width / 2 - SIDE_MARGIN) / floorScale((d0 + d1) / 2);
    const a0 = Math.max(column * GRID_PX - GRID_PX / 2, -seen);
    const a1 = Math.min(column * GRID_PX + GRID_PX / 2, seen);
    if (a1 - a0 < 8) return null;
    const side = Math.min(a1 - a0, GRID_PX) * ICON_SHARE;
    const [ca, cd] = [(a0 + a1) / 2, (d0 + d1) / 2];
    const lines = action.icon.map((line) =>
      line.map(([u, v], j) => {
        const [x, y] = at(ca + (u - 0.5) * side, cd + (v - 0.5) * side);
        return `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join("")
    );
    const corners = [at(a0, d0), at(a1, d0), at(a1, d1), at(a0, d1)];
    const hit = corners.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + "Z";
    return { action, lines, hit };
  });
  return (
    <svg
      className={`pointer-events-none fixed inset-0 z-[3] h-full w-full transition-opacity duration-300 ${hidden ? "opacity-0" : ""}`}
      aria-hidden={hidden || undefined}
    >
      {cells.map((cell) =>
        cell ? (
          <g
            key={cell.action.id}
            role="button"
            tabIndex={hidden ? -1 : 0}
            aria-label={cell.action.label}
            className={`group cursor-pointer outline-none ${hidden ? "" : "pointer-events-auto"}`}
            onClick={() => onPick(cell.action.id)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onPick(cell.action.id);
            }}
          >
            <title>{cell.action.label}</title>
            {/* The square itself, to tap — lit faintly under a pointer or focus. */}
            <path
              d={cell.hit}
              fill="var(--ink-primary)"
              fillOpacity={0}
              stroke="none"
              className="transition-[fill-opacity] group-hover:[fill-opacity:0.06] group-focus-visible:[fill-opacity:0.1] group-active:[fill-opacity:0.12]"
            />
            <g fill="none" stroke="var(--ink-primary)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-80 transition-opacity group-hover:opacity-100">
              {cell.lines.map((d, j) => (
                <path key={j} d={d} />
              ))}
            </g>
          </g>
        ) : null
      )}
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
  back,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  top: number;
  bottom: number;
  className?: string;
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
    <div data-floor-ui className={`fixed z-[6] overflow-hidden ${className}`} style={{ top, height: Math.max(0, bottom - top) }}>
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
