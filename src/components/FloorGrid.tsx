"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { floorDepth, floorY, gridColumns, gridRows, HOME_CAMERA, HORIZON_SHARE } from "@/lib/grid-room";
import type { FloorCameraStore } from "@/lib/floor-camera";

// How strongly the grid's lines show, and how they fade toward the horizon: from FAR_OPACITY of that at the
// hinge to all of it FULL_DEPTH_SHARE of the screen's height back on the floor.
export const LINE_OPACITY = 0.22;
// The horizon: as faint as the grid's far end, which runs up to it, fading out toward the screen's sides.
const HORIZON_OPACITY = LINE_OPACITY * 0.4;
const FAR_OPACITY = 0.4;
const FULL_DEPTH_SHARE = 0.6;
const FADE_STOPS = 8;

/**
 * A mask (`id`) fading what's on the floor back toward the horizon: whole from screen y `whole` down, as faint as the
 * grid's far end (FAR_OPACITY) at the horizon.
 */
export function FloorFade({ id, width, height, share, whole }: { id: string; width: number; height: number; share: number; whole: number }) {
  const horizon = height * share;
  return (
    <>
      <linearGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" x1="0" y1={horizon} x2="0" y2={whole}>
        <stop offset="0" stopColor="white" stopOpacity={FAR_OPACITY} />
        <stop offset="1" stopColor="white" stopOpacity="1" />
      </linearGradient>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
        <rect x="0" y={horizon} width={width} height={height - horizon} fill={`url(#${id}-fade)`} />
      </mask>
    </>
  );
}

/**
 * The room's floor grid, drawn flat on the screen where its lines fall (see grid-room.ts) rather than painted on
 * the laid-back floor — so every line is a wire one device pixel wide, near or far, whatever the browser's zoom.
 * The horizon, then across, a line every grid square back from it; running back, lines meeting at the horizon's
 * middle, the screen's middle down the middle of a column of boxes. Fading toward the horizon, its far end as faint
 * as it. Moved and zoomed with the floor (`camera`, see floor-camera.ts).
 */
export function FloorGrid({ share = HORIZON_SHARE, camera: store, hidden = false }: { share?: number; camera?: FloorCameraStore; hidden?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const camera = useFloorCamera(store).camera;
  const [view, setView] = useState<{ width: number; height: number; dpr: number } | null>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const measure = () => setView({ width: svg.clientWidth, height: svg.clientHeight, dpr: window.devicePixelRatio || 1 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    // A browser zoom changes the device pixels per CSS pixel.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const lines = view
    ? {
        rows: gridRows(view.height, share, camera).filter((y) => y > view.height * share + 0.5),
        columns: gridColumns(view.width, view.height, share, camera),
      }
    : null;
  // One device pixel, and a row snapped to the middle of one, so it's a crisp wire.
  const wire = view ? 1 / view.dpr : 1;
  const snap = (y: number) => (view ? (Math.floor(y * view.dpr) + 0.5) / view.dpr : y);
  const horizon = view ? view.height * share : 0;
  const fullDepth = view ? view.height * FULL_DEPTH_SHARE : 1;
  const bottomDepth = view ? floorDepth(view.height, view.height, share) : 0;
  // Every line one shape, stroked with the fade back to the horizon: nothing made anew, or masked, as the floor moves.
  const d = lines
    ? lines.rows.map((y) => `M0 ${snap(y).toFixed(2)}H${view!.width}`).join("") +
      lines.columns.map((l) => `M${l.x1.toFixed(1)} ${l.y1.toFixed(1)}L${l.x2.toFixed(1)} ${l.y2.toFixed(1)}`).join("")
    : "";
  return (
    <svg ref={ref} className="absolute inset-0 h-full w-full" aria-hidden>
      {view && lines ? (
        <>
          <defs>
            {/* The lines' fade, by how far back on the floor each point is (not how far up the screen). */}
            <linearGradient id="floor-grid-fade" gradientUnits="userSpaceOnUse" x1="0" y1={horizon} x2="0" y2={view.height}>
              {Array.from({ length: FADE_STOPS + 1 }, (_, i) => {
                const depth = (bottomDepth * i) / FADE_STOPS;
                const y = floorY(depth, view.height, share);
                const opacity = Math.min(1, FAR_OPACITY + (1 - FAR_OPACITY) * (depth / fullDepth));
                return <stop key={i} offset={(y - horizon) / (view.height - horizon)} stopColor="var(--ink-primary)" stopOpacity={LINE_OPACITY * opacity} />;
              })}
            </linearGradient>
            {/* In the screen's px: a straight line's own box has no height for a gradient to fill. */}
            <linearGradient id="floor-grid-horizon" gradientUnits="userSpaceOnUse" x1="0" x2={view.width} y1="0" y2="0">
              <stop offset="0" stopColor="var(--ink-primary)" stopOpacity="0" />
              <stop offset="0.2" stopColor="var(--ink-primary)" stopOpacity={HORIZON_OPACITY} />
              <stop offset="0.8" stopColor="var(--ink-primary)" stopOpacity={HORIZON_OPACITY} />
              <stop offset="1" stopColor="var(--ink-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={0} x2={view.width} y1={snap(horizon)} y2={snap(horizon)} stroke="url(#floor-grid-horizon)" strokeWidth={wire} />
          {/* Faded away while something else lines the floor (a play's field, see FloorPlay) — the horizon kept. */}
          <path
            d={d}
            stroke="url(#floor-grid-fade)"
            strokeWidth={wire}
            fill="none"
            className={`transition-opacity duration-300 ${hidden ? "opacity-0" : ""}`}
          />
        </>
      ) : null}
    </svg>
  );
}

const AT_HOME = { camera: HOME_CAMERA, following: true };
const still = () => () => {};

/** The floor's camera, from its store — at home without one. */
export function useFloorCamera(store?: FloorCameraStore) {
  return useSyncExternalStore(store?.subscribe ?? still, store?.get ?? (() => AT_HOME), () => AT_HOME);
}
