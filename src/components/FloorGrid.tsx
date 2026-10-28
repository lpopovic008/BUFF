"use client";

import { useEffect, useRef, useState } from "react";
import { floorDepth, floorY, gridColumns, gridRows, HORIZON_SHARE } from "@/lib/grid-room";

// How strongly the grid's lines show, and how they fade toward the horizon: from FAR_OPACITY of that at the
// hinge to all of it FULL_DEPTH_SHARE of the screen's height back on the floor.
const LINE_OPACITY = 0.22;
// The horizon: as faint as the grid's far end, which runs up to it, fading out toward the screen's sides.
const HORIZON_OPACITY = LINE_OPACITY * 0.4;
const FAR_OPACITY = 0.4;
const FULL_DEPTH_SHARE = 0.6;
const FADE_STOPS = 8;

/**
 * The room's floor grid, drawn flat on the screen where its lines fall (see grid-room.ts) rather than painted on
 * the laid-back floor — so every line is a wire one device pixel wide, near or far, whatever the browser's zoom.
 * The horizon, then across, a line every grid square back from it; running back, lines meeting at the horizon's
 * middle, the screen's middle down the middle of a column of boxes. Fading toward the horizon, its far end as faint
 * as it.
 */
export function FloorGrid({ share = HORIZON_SHARE }: { share?: number }) {
  const ref = useRef<SVGSVGElement>(null);
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

  const lines = view ? { rows: gridRows(view.height, share).slice(1), columns: gridColumns(view.width, view.height, share) } : null;
  // One device pixel, and a row snapped to the middle of one, so it's a crisp wire.
  const wire = view ? 1 / view.dpr : 1;
  const snap = (y: number) => (view ? (Math.floor(y * view.dpr) + 0.5) / view.dpr : y);
  const horizon = view ? view.height * share : 0;
  const fullDepth = view ? view.height * FULL_DEPTH_SHARE : 1;
  const bottomDepth = view ? floorDepth(view.height, view.height, share) : 0;
  return (
    <svg ref={ref} className="absolute inset-0 h-full w-full" aria-hidden>
      {view && lines ? (
        <>
          <defs>
            {/* The fade, by how far back on the floor each point is (not how far up the screen). */}
            <linearGradient id="floor-grid-fade" gradientUnits="userSpaceOnUse" x1="0" y1={horizon} x2="0" y2={view.height}>
              {Array.from({ length: FADE_STOPS + 1 }, (_, i) => {
                const depth = (bottomDepth * i) / FADE_STOPS;
                const y = floorY(depth, view.height, share);
                const opacity = Math.min(1, FAR_OPACITY + (1 - FAR_OPACITY) * (depth / fullDepth));
                return <stop key={i} offset={(y - horizon) / (view.height - horizon)} stopColor="white" stopOpacity={opacity} />;
              })}
            </linearGradient>
            {/* In the screen's px: a straight line's own box has no height for a gradient to fill. */}
            <linearGradient id="floor-grid-horizon" gradientUnits="userSpaceOnUse" x1="0" x2={view.width} y1="0" y2="0">
              <stop offset="0" stopColor="var(--ink-primary)" stopOpacity="0" />
              <stop offset="0.2" stopColor="var(--ink-primary)" stopOpacity={HORIZON_OPACITY} />
              <stop offset="0.8" stopColor="var(--ink-primary)" stopOpacity={HORIZON_OPACITY} />
              <stop offset="1" stopColor="var(--ink-primary)" stopOpacity="0" />
            </linearGradient>
            <mask id="floor-grid-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={view.width} height={view.height}>
              <rect x="0" y={horizon} width={view.width} height={view.height - horizon} fill="url(#floor-grid-fade)" />
            </mask>
          </defs>
          <line x1={0} x2={view.width} y1={snap(horizon)} y2={snap(horizon)} stroke="url(#floor-grid-horizon)" strokeWidth={wire} />
          <g mask="url(#floor-grid-mask)" stroke="var(--ink-primary)" strokeOpacity={LINE_OPACITY} strokeWidth={wire} fill="none">
            {lines.rows.map((y) => (
              <line key={y} x1={0} x2={view.width} y1={snap(y)} y2={snap(y)} />
            ))}
            {lines.columns.map((l) => (
              <line key={l.x1} {...l} />
            ))}
          </g>
        </>
      ) : null}
    </svg>
  );
}
