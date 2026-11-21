"use client";

import { useRef } from "react";
import { floorDepth, floorScale } from "@/lib/grid-room";

/** A tab on the floor (see FloorFolders): what it's for, and its name, written on it while it's picked. */
export interface FloorFolder {
  key: string;
  label: string;
  emoji?: string;
}

/** How far a finger goes before it's a drag, not a tap (px); and how far it goes for each next tab. */
const DRAG_PX = 6;
const STEP_PX = 22;
/** How much of the floor is left clear behind the tabs and in front of them (shares of its height). */
const BACK_SHARE = 0.22;
const FRONT_SHARE = 0.1;
/** The nearest tab's height (px), and how far in from the screen's edges it comes. */
const TAB_PX = 30;
const EDGE_PX = 16;
/** How far the picked tab jumps up off the floor, in its own heights. */
const JUMP = 0.9;

/**
 * A row of tabs standing up on the room's floor, facing you, one just behind the other like the dividers in a file
 * drawer — the first at the back, each next a little nearer, so only a sliver of each shows over the one in front of
 * it. The one picked jumps up off the floor, its name written on it, its shadow left where it stood. A finger dragged
 * down the floor brings each next tab up in turn (and up, each last one), the one before it dropping back into its
 * place; a tap brings up the one tapped. `room`: the screen it's on, its horizon `share` of the way down, the floor's
 * front edge at screen y `bottom`.
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
  /** What the tabs are, read out. */
  label: string;
}) {
  const { width, height, share, bottom } = room;
  const n = Math.max(1, folders.length);
  const horizon = height * share;
  const floor = Math.max(0, bottom - horizon);
  // Where each tab stands (its foot, down the screen), the first at the back; and how big it's drawn there.
  const backY = horizon + floor * BACK_SHARE;
  const frontY = bottom - floor * FRONT_SHARE;
  const nearest = floorScale(floorDepth(frontY, height, share));
  const tabs = folders.map((_, i) => {
    const y = n === 1 ? frontY : backY + ((frontY - backY) * i) / (n - 1);
    const s = floorScale(floorDepth(y, height, share)) / nearest;
    const w = (width - 2 * EDGE_PX) * s;
    const h = TAB_PX * s;
    return { y, s, w, h, x: (width - w) / 2 };
  });
  const jump = (i: number) => tabs[i].h * JUMP;

  // Dragged down the floor, the next tabs come up one by one as the finger goes; tapped, the one under it.
  const drag = useRef<{ id: number; y0: number; from: number; moved: boolean } | null>(null);
  const tappedAt = (y: number) => {
    // The nearest whose face (the picked one's where it's jumped to) the tap is on.
    for (let i = n - 1; i >= 0; i--) {
      const foot = tabs[i].y - (i === picked ? jump(i) : 0);
      if (y >= foot - tabs[i].h && y <= foot) return i;
    }
    return y < tabs[0].y ? 0 : n - 1;
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
          const next = Math.max(0, Math.min(n - 1, d.from + Math.round(dy / STEP_PX)));
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
      {folders.map((f, i) => {
        const t = tabs[i];
        const up = i === picked;
        return (
          <div key={f.key} aria-hidden>
            {/* Where the picked one stood: its shadow on the floor. */}
            {up ? (
              <span
                className="absolute rounded-[50%] bg-ink-primary/20 blur-[2px]"
                style={{ left: t.x + t.w * 0.05, top: t.y - 2, width: t.w * 0.9, height: Math.max(3, t.h * 0.18) }}
              />
            ) : null}
            {/* The tab, standing on the floor facing you — jumped up, the one picked, its name on it. */}
            <div
              className={`absolute flex items-center justify-center overflow-hidden border bg-page transition-transform duration-200 ease-out motion-reduce:transition-none ${
                up ? "border-ink-primary" : "border-border"
              }`}
              style={{ left: t.x, top: t.y - t.h, width: t.w, height: t.h, transform: `translateY(${up ? -jump(i) : 0}px)` }}
            >
              {up ? (
                <span
                  className="truncate whitespace-nowrap px-2 font-extrabold uppercase tracking-wide text-ink-primary"
                  style={{ fontSize: Math.max(9, Math.min(12, 12 * t.s)) }}
                >
                  {f.emoji ? `${f.emoji} ` : ""}
                  {f.label}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
