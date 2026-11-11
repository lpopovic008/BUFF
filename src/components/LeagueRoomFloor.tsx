"use client";

import { useEffect, useState } from "react";
import { FLOOR_TILT, floorDepth, floorPoint, floorScale, HORIZON_SHARE, PERSPECTIVE_PX } from "@/lib/grid-room";
import { ChevronLeftIcon } from "@/components/ui/Icon";

/** What the League Room's floor offers, each a button lying on a square of its grid. */
export type FloorAction = "bench" | "graph" | "payouts" | "writeups" | "history" | "more";

/**
 * A solid of a floor button's model, in the model's own room: `x` across its slot (0 its left, 1 its right), `f` back
 * from its front (in slot widths), `y` up off the floor (in slot widths). A closed solid (a prism: `faces` its top and
 * its sides, convex), or a flat panel, seen from either side; `tone` lighter (or, below 0, darker) than the rest;
 * `layer` drawn before (lower) or after (higher) the others whatever their depth; `decals`, lines drawn on it after it;
 * `smooth`, round (its sides one surface, no edges drawn between them).
 */
type V3 = [number, number, number];
interface Solid {
  faces: V3[][];
  closed: boolean;
  tone: number;
  layer: number;
  decals?: V3[][];
  smooth?: boolean;
}

/** A prism: `foot` (x, f) extruded from height y0 to y1. */
function prism(foot: [number, number][], y0: number, y1: number, tone = 0, layer = 0, decals?: V3[][]): Solid {
  const top = foot.map(([x, f]) => [x, f, y1] as V3);
  const sides = foot.map(([x, f], i) => {
    const [x2, f2] = foot[(i + 1) % foot.length];
    return [
      [x, f, y0],
      [x2, f2, y0],
      [x2, f2, y1],
      [x, f, y1],
    ] as V3[];
  });
  return { faces: [top, ...sides], closed: true, tone, layer, decals };
}
const box = (x0: number, x1: number, f0: number, f1: number, y0: number, y1: number, tone = 0, layer = 0, decals?: V3[][]) =>
  prism(
    [
      [x0, f0],
      [x1, f0],
      [x1, f1],
      [x0, f1],
    ],
    y0,
    y1,
    tone,
    layer,
    decals
  );
const cylinder = (cx: number, cf: number, r: number, y0: number, y1: number, tone = 0, n = 18): Solid => ({
  ...prism(
    Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cf + r * Math.sin((2 * Math.PI * i) / n)] as [number, number]),
    y0,
    y1,
    tone
  ),
  smooth: true,
});
const panel = (pts: V3[], tone = 0): Solid => ({ faces: [pts], closed: false, tone, layer: 0 });

/** A park bench: slats for a seat and a back, its legs, its arms. */
function benchModel(): Solid[] {
  const parts: Solid[] = [];
  // Back posts running up behind the seat, the back legs under them.
  for (const x of [0.12, 0.83]) parts.push(box(x, x + 0.05, 0.36, 0.42, 0, 0.74, -0.05));
  // The back's slats.
  for (const [y0, y1] of [
    [0.46, 0.53],
    [0.57, 0.64],
    [0.67, 0.73],
  ])
    parts.push(box(0.05, 0.95, 0.37, 0.41, y0, y1, 0.05));
  // Front legs.
  for (const x of [0.12, 0.83]) parts.push(box(x, x + 0.05, 0.1, 0.15, 0, 0.3, -0.05));
  // The seat's slats.
  for (const [f0, f1] of [
    [0.29, 0.36],
    [0.19, 0.27],
    [0.09, 0.17],
  ])
    parts.push(box(0.05, 0.95, f0, f1, 0.3, 0.34, 0.08));
  // Arms: a post at the front, a rail back to the back posts.
  for (const x of [0.08, 0.87]) {
    parts.push(box(x, x + 0.05, 0.1, 0.14, 0.34, 0.46, -0.05));
    parts.push(box(x - 0.01, x + 0.06, 0.08, 0.38, 0.46, 0.49, 0.08));
  }
  return parts;
}

/** Two teams' points, a row of bars each, rising — the back row the other team's — on a plinth. */
function graphModel(): Solid[] {
  const parts: Solid[] = [box(0.03, 0.97, 0.04, 0.56, 0, 0.035, -0.04, -1)];
  const columns = [0.08, 0.31, 0.54, 0.77];
  const back = [0.3, 0.42, 0.5, 0.72];
  const front = [0.16, 0.29, 0.24, 0.47];
  columns.forEach((x, i) => parts.push(box(x, x + 0.16, 0.34, 0.5, 0.035, 0.035 + back[i], -0.1)));
  columns.forEach((x, i) => parts.push(box(x, x + 0.16, 0.1, 0.26, 0.035, 0.035 + front[i], 0.12)));
  return parts;
}

/** Stacks of coins. */
function payoutsModel(): Solid[] {
  const parts: Solid[] = [];
  const coin = 0.042;
  const stacks: [number, number, number][] = [
    [0.5, 0.38, 10],
    [0.24, 0.26, 6],
    [0.77, 0.24, 8],
  ];
  for (const [x, f, count] of stacks) {
    // Each coin a shade apart from the next, and a hair off its size, so they show one by one up the stack.
    for (let i = 0; i < count; i++) parts.push(cylinder(x, f, i % 2 ? 0.125 : 0.119, i * coin, (i + 1) * coin, i % 2 ? 0.16 : -0.02, 20));
  }
  // A coin lying flat in front.
  parts.push(cylinder(0.5, 0.1, 0.09, 0, 0.03, 0.12, 20));
  return parts;
}

/** A stack of written pages, the top one written on, and an inkwell with its quill. */
function writeupsModel(): Solid[] {
  const sheet = 0.03;
  const offsets = [0.02, -0.03, 0.03, -0.01, 0.01, 0];
  const top = offsets.length * sheet + 0.001;
  const lines: V3[][] = [0.16, 0.23, 0.3, 0.37, 0.44].map((f, i) => [
    [0.12, f, top],
    [i === 0 ? 0.62 : i === 4 ? 0.42 : 0.58, f, top],
  ]);
  return [
    ...offsets.map((dx, i) =>
      box(0.06 + dx, 0.68 + dx, 0.08 + Math.abs(dx), 0.52 - Math.abs(dx), i * sheet, (i + 1) * sheet, i === offsets.length - 1 ? 0.2 : i % 2 ? 0.02 : 0.08, 0, i === offsets.length - 1 ? lines : undefined)
    ),
    cylinder(0.84, 0.3, 0.09, 0, 0.15, -0.14),
    cylinder(0.84, 0.3, 0.055, 0.15, 0.2, -0.08),
    // The quill standing in the well, its feather toward you.
    panel(
      [
        [0.84, 0.3, 0.2],
        [0.8, 0.3, 0.42],
        [0.85, 0.3, 0.76],
        [0.95, 0.3, 0.5],
        [0.88, 0.3, 0.3],
      ],
      0.22
    ),
  ];
}

/** A trophy on a stepped base. */
function historyModel(): Solid[] {
  return [
    box(0.26, 0.74, 0.12, 0.5, 0, 0.08, -0.06),
    box(0.33, 0.67, 0.18, 0.44, 0.08, 0.14, 0.02),
    cylinder(0.5, 0.31, 0.04, 0.14, 0.3, 0.05),
    cylinder(0.5, 0.31, 0.09, 0.3, 0.35, 0.1),
    cylinder(0.5, 0.31, 0.14, 0.35, 0.47, 0.14),
    cylinder(0.5, 0.31, 0.18, 0.47, 0.62, 0.18),
    // Its handles.
    box(0.27, 0.31, 0.29, 0.33, 0.44, 0.58, 0.1),
    box(0.69, 0.73, 0.29, 0.33, 0.44, 0.58, 0.1),
  ];
}

/** A wrapped present: a box, its lid, the ribbon round them and a bow on top. */
function moreModel(): Solid[] {
  return [
    box(0.2, 0.8, 0.1, 0.5, 0, 0.38, -0.02),
    box(0.46, 0.54, 0.085, 0.1, 0, 0.38, 0.22),
    box(0.17, 0.83, 0.07, 0.53, 0.38, 0.47, 0.08),
    box(0.46, 0.54, 0.06, 0.54, 0.47, 0.48, 0.24),
    box(0.36, 0.47, 0.24, 0.36, 0.48, 0.57, 0.24),
    box(0.53, 0.64, 0.24, 0.36, 0.48, 0.57, 0.24),
  ];
}

/** Each button: what it's for, and what stands on the floor for it (see Solid). */
export const FLOOR_ACTIONS: { id: FloorAction; label: string; model: () => Solid[] }[] = [
  { id: "bench", label: "Bench", model: benchModel },
  { id: "graph", label: "Score graph", model: graphModel },
  { id: "payouts", label: "Payouts", model: payoutsModel },
  { id: "writeups", label: "Write-ups", model: writeupsModel },
  { id: "history", label: "League history", model: historyModel },
  { id: "more", label: "More to come", model: moreModel },
];

const SIN = Math.sin((FLOOR_TILT * Math.PI) / 180);
const COS = Math.cos((FLOOR_TILT * Math.PI) / 180);

/** Where on the screen the room's floor point (`across`, `d` back from the hinge) shows, `h` up off it — the hinge at screen y `hinge`. */
function standing(across: number, d: number, h: number, width: number, hinge: number): [number, number] {
  const toward = Math.min(d * SIN + h * COS, PERSPECTIVE_PX * 0.97);
  const s = PERSPECTIVE_PX / (PERSPECTIVE_PX - toward);
  return [width / 2 + across * s, hinge + (d * COS - h * SIN) * s];
}

/** A button's room, for its width: how tall it stands at most, how far back it goes, and the gap to the next. */
const BLOCK = { height: 0.78, thick: 0.58, gap: 0.16 };
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

/** The light on the models: from above, a little from the front and the left (screen x right, y down, z toward you). */
const LIGHT = (() => {
  const [x, y, z] = [-0.35, -1, 0.55];
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n] as const;
})();

/**
 * A face's fill, in the page's ink over its own color: lit as it faces the light, `tone` lighter (or darker), and
 * `lit` (pointed at) lighter still.
 */
function shade(normal: readonly number[], tone: number, lit = 0): string {
  const facing = Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
  const pct = Math.min(60, Math.max(3, 7 + facing * 17 + tone * 30 + lit));
  return `color-mix(in srgb, var(--ink-primary) ${pct.toFixed(1)}%, var(--page))`;
}

type W3 = [number, number, number];
const sub = (a: W3, b: W3): W3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: W3, b: W3): W3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: W3, b: W3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mean = (pts: W3[]): W3 => {
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n, pts.reduce((s, p) => s + p[2], 0) / n];
};

/** A model's faces as they're drawn, back to front: each its outline on the screen and its fill, and lines on it. */
interface Drawn {
  faces: { d: string; fill: string; edge: boolean }[];
  decals: string[];
}

/**
 * Draws a model (see Solid) standing in its slot — `x0` its left edge across the floor (floor px from the screen's
 * middle), `front` how far back from the hinge its front is, `unit` floor px to the model's own unit — upright, or
 * (`mirrored`) as the floor reflects it. In the room's perspective: the room's 3D (x across, y down the screen from
 * the hinge, z toward you), you at z = PERSPECTIVE_PX. A closed solid's faces turned away from you are left out, and
 * the solids drawn farthest first.
 */
function drawModel(solids: Solid[], x0: number, front: number, unit: number, width: number, hinge: number, mirrored: boolean, lit: number): Drawn {
  const world = ([x, f, y]: V3): W3 => {
    const across = x0 + x * unit;
    const d = front - f * unit;
    const h = (mirrored ? -y : y) * unit;
    return [across, d * COS - h * SIN, d * SIN + h * COS];
  };
  const screen = ([X, Y, Z]: W3): [number, number] => {
    const s = PERSPECTIVE_PX / (PERSPECTIVE_PX - Math.min(Z, PERSPECTIVE_PX * 0.97));
    return [width / 2 + X * s, hinge + Y * s];
  };
  const eye: W3 = [0, 0, PERSPECTIVE_PX];
  const placed = solids.map((solid) => {
    const faces = solid.faces.map((face) => face.map(world));
    return { solid, faces, center: mean(faces.flat()) };
  });
  placed.sort((a, b) => a.solid.layer - b.solid.layer || a.center[2] - b.center[2] || a.center[1] - b.center[1]);
  const drawn: Drawn = { faces: [], decals: [] };
  for (const { solid, faces, center } of placed) {
    for (const face of faces) {
      const mid = mean(face);
      let normal = cross(sub(face[1], face[0]), sub(face[2], face[0]));
      const len = Math.hypot(...normal) || 1;
      normal = [normal[0] / len, normal[1] / len, normal[2] / len];
      if (solid.closed) {
        // Facing out of the solid, and toward you — else it's hidden behind the rest of it.
        if (dot(normal, sub(mid, center)) < 0) normal = [-normal[0], -normal[1], -normal[2]];
        if (dot(normal, sub(eye, mid)) <= 0) continue;
      } else if (dot(normal, sub(eye, mid)) < 0) normal = [-normal[0], -normal[1], -normal[2]];
      // A round solid's sides are one surface: no edges between them (its top's still outlined).
      drawn.faces.push({ d: path(face.map(screen)), fill: shade(normal, solid.tone, lit), edge: !solid.smooth || face === faces[0] });
    }
    for (const line of solid.decals ?? []) drawn.decals.push(path(line.map(world).map(screen), false));
  }
  return drawn;
}

/**
 * The League Room's buttons: a row of models standing on its floor (see floorButtonRow), each what it's for — a park
 * bench, two teams' bars of points, stacks of coins, written pages and a quill, a trophy, a present — in the room's
 * perspective, lit from above, and reflected in the floor under them. Pointed at, lit up; pressed, they give a
 * little. Gone (`hidden`) while a panel's up over them.
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
  const [lit, setLit] = useState<FloorAction | null>(null);
  const hinge = height * row.share;
  const n = FLOOR_ACTIONS.length;
  const total = n * row.width + (n - 1) * row.gap;
  const slots = FLOOR_ACTIONS.map((action, i) => {
    const x0 = -total / 2 + i * (row.width + row.gap);
    const solids = action.model();
    const glow = lit === action.id ? 8 : 0;
    const up = drawModel(solids, x0, row.depth, row.width, width, hinge, false, glow);
    const down = drawModel(solids, x0, row.depth, row.width, width, hinge, true, 0);
    // What's tapped: the slot's whole box, as it stands.
    const corners = ([0, 1] as const).flatMap((x) =>
      ([0, BLOCK.thick] as const).flatMap((f) =>
        ([0, BLOCK.height] as const).map((y) => standing(x0 + x * row.width, row.depth - f * row.width, y * row.width, width, hinge))
      )
    );
    const [xs, ys] = [corners.map((c) => c[0]), corners.map((c) => c[1])];
    const hit = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    return { action, up, down, hit };
  });
  const reflectTop = standing(0, row.depth, 0, width, hinge)[1];
  const reflectBottom = standing(0, row.depth, -row.height, width, hinge)[1];
  const fade = "floor-buttons-fade";
  const edge = { stroke: "var(--ink-primary)", strokeOpacity: 0.4, strokeWidth: 0.75, strokeLinejoin: "round" as const };
  // No edge: its own color round it, so no seam shows between it and the next.
  const seamless = (fill: string) => ({ stroke: fill, strokeWidth: 0.75, strokeLinejoin: "round" as const });
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
        {slots.map(({ action, down }) => (
          <g key={action.id}>
            {down.faces.map((f, j) => (
              <path key={j} d={f.d} fill={f.fill} {...(f.edge ? edge : seamless(f.fill))} />
            ))}
          </g>
        ))}
      </g>
      {slots.map(({ action, up, hit }) => (
        <g
          key={action.id}
          role="button"
          tabIndex={hidden ? -1 : 0}
          aria-label={action.label}
          className={`group cursor-pointer outline-none ${hidden ? "" : "pointer-events-auto"}`}
          onClick={() => onPick(action.id)}
          onPointerEnter={() => setLit(action.id)}
          onPointerLeave={() => setLit((was) => (was === action.id ? null : was))}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            onPick(action.id);
          }}
        >
          <title>{action.label}</title>
          {/* Its whole slot, to tap — outlined when it has the keyboard's focus. */}
          <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" stroke="var(--ink-primary)" strokeOpacity={0} className="group-focus-visible:[stroke-opacity:0.6]" />
          {/* Pressed, it gives a little, down into the floor. */}
          <g className="transition-transform duration-75 group-active:translate-y-[2px]">
            {up.faces.map((f, j) => (
              <path key={j} d={f.d} fill={f.fill} {...(f.edge ? edge : seamless(f.fill))} />
            ))}
            <g fill="none" stroke="var(--ink-primary)" strokeOpacity={0.55} strokeWidth={1} strokeLinecap="round">
              {up.decals.map((d, j) => (
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
