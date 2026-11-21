"use client";

import { useRef } from "react";
import { floorDepth, floorPoint, floorScale } from "@/lib/grid-room";

/** A folder on the floor (see FloorFolders): what it's for, and its name written on it. */
export interface FloorFolder {
  key: string;
  label: string;
  emoji?: string;
}

/** How far a finger goes before it's a drag, not a tap (px). */
const DRAG_PX = 6;
/** How much of the floor is left clear behind the folders and in front of them (shares of its height). */
const BACK_SHARE = 0.07;
const FRONT_SHARE = 0.05;
/** How deep a folder is, in the room between two folders' back edges: each overlaps those in front of it. */
const DEPTH_STEPS = 2.2;
/** How far the folder that's up floats over the rest, in the room between two folders' back edges. */
const LIFT_STEPS = 0.85;
/** How much of a folder's strip its name needs, from its back edge (px). */
const LABEL_ROOM_PX = 17;
/** How far in from the screen's edges the nearest folder comes (px). */
const EDGE_PX = 12;

/**
 * A stack of folders lying on the room's floor, one behind the other like a filing cabinet's, each its name written
 * along its back edge — the one picked floating up out of the rest, those behind it stepping back as far as keeps their
 * names in sight. A finger dragged down the floor brings each next
 * folder up in turn (and up, each last one), the one before it settling back into its place; a tap brings up the one
 * tapped. `room`: the screen it's on, its horizon `share` of the way down, the floor's front edge at screen y `bottom`.
 */
export function FloorFolders({
  folders,
  picked,
  onPick,
  room,
  label,
}: {
  folders: FloorFolder[];
  picked: number;
  onPick: (i: number) => void;
  room: { width: number; height: number; share: number; bottom: number };
  /** What the folders are, read out. */
  label: string;
}) {
  const { width, height, share, bottom } = room;
  const n = Math.max(1, folders.length);
  const horizon = height * share;
  const floor = Math.max(0, bottom - horizon);
  const backY = horizon + floor * BACK_SHARE;
  const frontY = bottom - floor * FRONT_SHARE;
  // The room between two folders' back edges, down the screen: the last folder's front at the stack's front.
  const step = (frontY - backY) / (n - 1 + DEPTH_STEPS);
  const lift = step * LIFT_STEPS;
  // The folders behind the one that's up step back by as much as keeps the name on the one just behind it clear of it.
  const behind = Math.max(0, lift - (step - LABEL_ROOM_PX));
  // As wide across the floor as lets the nearest folder come within EDGE_PX of the screen's edges.
  const half = (width / 2 - EDGE_PX) / floorScale(floorDepth(frontY, height, share));
  const shape = (i: number) => {
    const [d0, d1] = [floorDepth(backY + i * step, height, share), floorDepth(backY + (i + DEPTH_STEPS) * step, height, share)];
    const corners = [floorPoint(-half, d0, width, height, share), floorPoint(half, d0, width, height, share), floorPoint(half, d1, width, height, share), floorPoint(-half, d1, width, height, share)];
    return { corners, scale: floorScale(d0) / floorScale(floorDepth(frontY, height, share)) };
  };

  // Dragged down the floor, the next folders come up one by one as the finger passes each; tapped, the one under it.
  const drag = useRef<{ id: number; y0: number; from: number; moved: boolean } | null>(null);
  const tappedAt = (y: number) => {
    // The folder whose strip it's in — the one up, and those behind it, reaching higher by as far as they've moved.
    for (let i = n - 1; i >= 0; i--) if (y >= backY + i * step - (i === picked ? lift : i < picked ? behind : 0)) return i;
    return 0;
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[6]">
      <div
        role="listbox"
        aria-label={label}
        aria-activedescendant={folders[picked] ? `folder-${folders[picked].key}` : undefined}
        tabIndex={0}
        className="pointer-events-auto absolute inset-x-0 touch-none select-none outline-none"
        style={{ top: horizon, height: floor }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowRight") onPick(Math.min(n - 1, picked + 1));
          if (e.key === "ArrowUp" || e.key === "ArrowLeft") onPick(Math.max(0, picked - 1));
        }}
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId, y0: e.clientY, from: picked, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dy = e.clientY - d.y0;
          if (!d.moved && Math.abs(dy) < DRAG_PX) return;
          d.moved = true;
          const next = Math.max(0, Math.min(n - 1, d.from + Math.round(dy / step)));
          if (next !== picked) onPick(next);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && d.id === e.pointerId && !d.moved) onPick(tappedAt(e.clientY));
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        {folders.map((f, i) => (
          <span key={f.key} id={`folder-${f.key}`} role="option" aria-selected={i === picked} className="sr-only">
            {f.label}
          </span>
        ))}
      </div>
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {folders.map((f, i) => {
          const { corners, scale } = shape(i);
          const up = i === picked;
          const points = corners.map(([x, y]) => `${x},${y}`).join(" ");
          const [[bx, by]] = corners;
          const size = Math.max(9, Math.min(12, 12 * Math.max(0.75, scale)));
          return (
            <g key={f.key}>
              {/* Where the one that's up lies when it's down: its shadow on the floor. */}
              {up ? <polygon points={points} fill="var(--ink-primary)" fillOpacity={0.12} /> : null}
              <g className="transition-transform duration-200 ease-out motion-reduce:transition-none" style={{ transform: `translateY(${up ? -lift : i < picked ? -behind : 0}px)` }}>
                <polygon
                  points={points}
                  fill="var(--page)"
                  stroke={up ? "var(--ink-primary)" : "var(--border)"}
                  strokeWidth={up ? 1.5 : 1}
                  strokeLinejoin="round"
                />
                {/* Its name along its back edge — on the one up, lit like a map tag. */}
                {up ? (
                  <rect x={bx + 4} y={by + 2} width={Math.max(0, (corners[1][0] - bx) - 8)} height={size + 5} fill="var(--map-tag)" />
                ) : null}
                <text
                  x={bx + 8}
                  y={by + 2 + size}
                  fontSize={size}
                  fontWeight={up ? 800 : 700}
                  fill={up ? "var(--map-tag-ink)" : "var(--ink-secondary)"}
                  style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
                >
                  {f.emoji ? `${f.emoji} ` : ""}
                  {f.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
