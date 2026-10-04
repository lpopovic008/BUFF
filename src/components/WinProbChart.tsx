"use client";

import { useRef, useState } from "react";
import { formatPoints } from "@/lib/format";
import { timeline, WinProbPoint } from "@/lib/win-probability";

// The line keeps clear of the label strip along the top, and a little air below.
const PAD_TOP = 22;
const PAD_BOTTOM = 6;
const yOf = (p: number) => PAD_TOP + (1 - p) * (100 - PAD_TOP - PAD_BOTTOM);

/** A win chance as a whole percent, never rounding a live chance to a sure 0% or 100%. */
function pct(p: number): string {
  if (p <= 0 || p >= 1) return `${Math.round(p * 100)}%`;
  return `${Math.min(99, Math.max(1, Math.round(p * 100)))}%`;
}

function when(point: WinProbPoint, first: boolean): string {
  if (point.synthetic && first) return "Pregame";
  return new Date(point.t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** The line as SVG path data, split into the stretches actually watched live (solid) and the rest (dashed: the pregame line up to the first reading). */
function paths(points: WinProbPoint[], xs: number[]): { solid: string; dashed: string; area: string } {
  const pt = (i: number) => `${(xs[i] * 100).toFixed(2)} ${yOf(points[i].p).toFixed(2)}`;
  let solid = "";
  let dashed = "";
  for (let i = 1; i < points.length; i++) {
    const seg = `M${pt(i - 1)} L${pt(i)} `;
    if (points[i - 1].synthetic || points[i].synthetic) dashed += seg;
    else solid += seg;
  }
  const mid = yOf(0.5).toFixed(2);
  const area = `M${(xs[0] * 100).toFixed(2)} ${mid} ${points.map((_, i) => `L${pt(i)}`).join(" ")} L${(xs[xs.length - 1] * 100).toFixed(2)} ${mid} Z`;
  return { solid, dashed, area };
}

/**
 * A matchup's live win-probability line, stock-ticker style: the left team's
 * chance over time (up = left team ahead), the 50% line through the middle,
 * each side's current chance at its end. Press and hold (or click and drag)
 * to scrub: a vertical line follows the finger and the chances, time and
 * scores at that moment take over the labels. Drawn in the current text
 * colour, so it sits on the highlighted matchup plate.
 */
export function WinProbChart({ points, live, pregame, final }: { points: WinProbPoint[]; live: boolean; pregame: boolean; final: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  if (points.length === 0) return null;

  // A single reading (pregame, or the first one) is a flat line across.
  const drawn = points.length === 1 ? [points[0], { ...points[0], t: points[0].t + 1 }] : points;
  const { xs, breaks } = timeline(drawn);
  const { solid, dashed, area } = paths(drawn, xs);
  const lastIndex = drawn.length - 1;
  const shown = selected ?? lastIndex;
  const point = drawn[shown];

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - f) < Math.abs(xs[best] - f)) best = i;
    setSelected(best);
  };
  const release = () => setSelected(null);

  const leftLead = point.p >= 0.5;
  const caption = pregame ? "Win chance · pregame" : live ? "Win chance · live" : final ? "Final" : "Win chance";

  return (
    <div className="flex items-center gap-2">
      <span className={`w-[3.5ch] shrink-0 text-right text-sm font-bold tabular-nums ${leftLead ? "" : "opacity-60"}`}>{pct(point.p)}</span>
      <div
        ref={box}
        className="relative h-14 min-w-0 flex-1 cursor-crosshair select-none touch-pan-y"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        role="img"
        aria-label={`Win chance ${pct(point.p)} to ${pct(1 - point.p)}`}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <line x1="0" x2="100" y1={yOf(0.5)} y2={yOf(0.5)} stroke="currentColor" strokeOpacity="0.3" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          {breaks.map((b) => (
            <line key={b} x1={b * 100} x2={b * 100} y1="0" y2="100" stroke="currentColor" strokeOpacity="0.15" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="currentColor" fillOpacity="0.12" />
          <path d={dashed} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <path d={solid} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* The line's live end, pulsing while games are on. */}
        <span
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current transition-[top] duration-700"
          style={{ left: `${xs[lastIndex] * 100}%`, top: `${yOf(drawn[lastIndex].p)}%` }}
        >
          {live ? <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" /> : null}
        </span>

        {selected != null ? (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px bg-current opacity-70" style={{ left: `${xs[shown] * 100}%` }} />
            <span
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-current bg-[var(--map-tag)]"
              style={{ left: `${xs[shown] * 100}%`, top: `${yOf(point.p)}%` }}
            />
            <span
              className="pointer-events-none absolute top-0 whitespace-nowrap bg-[var(--map-tag)] px-1 text-[0.625rem] font-semibold leading-tight tabular-nums"
              style={{ left: `${xs[shown] * 100}%`, transform: `translateX(-${xs[shown] * 100}%)` }}
            >
              {when(point, shown === 0)}
              {point.synthetic && shown === 0 ? null : ` · ${formatPoints(point.a)}–${formatPoints(point.b)}`}
            </span>
          </>
        ) : (
          <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[0.5625rem] font-semibold uppercase tracking-wider opacity-60">
            {caption}
          </span>
        )}
      </div>
      <span className={`w-[3.5ch] shrink-0 text-sm font-bold tabular-nums ${leftLead ? "opacity-60" : ""}`}>{pct(1 - point.p)}</span>
    </div>
  );
}
