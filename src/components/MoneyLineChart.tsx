"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CumulativeSeries, PayoutColumn } from "@/lib/payouts";

const PAD_TOP = 16;
const PAD_BOTTOM = 26;
const PAD_LEFT = 8;
/** The end-of-line labels: the dot, then "name $amount" in the app's monospaced font (each character half an em wide). */
const LABEL_FONT = 11;
const LABEL_CHAR = LABEL_FONT * 0.5;
const LABEL_LEAD = 13;
const AXIS_FONT = 10;
/** The season column sits a little apart from the weeks, past a gap this many weeks wide. */
const SEASON_GAP = 1.6;

// First three categorical slots validate all-pairs in both light and dark
// (see dataviz palette.md) — safe to use together even with many lines on
// screen. Everyone else rides in a single muted neutral so a 10-line chart
// never needs more distinct hues than the palette can safely give it; every
// line still gets its own end-of-line label, so identity never depends on
// telling two grays apart.
const ACCENT_VARS = ["--color-series-1", "--color-series-2", "--color-series-3"];
const MIN_LABEL_GAP = 15;

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/**
 * Pushes apart label y-positions that would otherwise overlap, preserving
 * relative order — and, if that runs them past `bottom`, lifts the stack
 * back up so the last one still fits.
 */
function resolveLabelPositions(desired: number[], bottom: number): number[] {
  const order = desired.map((y, i) => i).sort((a, b) => desired[a] - desired[b]);
  const resolved = [...desired];
  for (let k = 1; k < order.length; k++) {
    const i = order[k];
    const prev = order[k - 1];
    if (resolved[i] - resolved[prev] < MIN_LABEL_GAP) {
      resolved[i] = resolved[prev] + MIN_LABEL_GAP;
    }
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    const limit = k === order.length - 1 ? bottom : resolved[order[k + 1]] - MIN_LABEL_GAP;
    resolved[i] = Math.min(resolved[i], limit);
  }
  return resolved;
}

const columnLabel = (c: PayoutColumn) => (c === "season" ? "Season" : `Week ${c}`);

/**
 * Each manager's running earnings over the year: weeks 0 through the
 * season's last (`lastWeek`) along the bottom, then the season's end, where
 * its prizes land. Lines run solid through the weeks played, and step (dashed)
 * to the season's end once its prizes are paid. Drawn at the size it's shown,
 * so its text stays legible on a phone, with room at the right for every
 * name and amount in full.
 */
export function MoneyLineChart({ series, lastWeek }: { series: CumulativeSeries[]; lastWeek: number }) {
  const uid = useId();
  const [hover, setHover] = useState<PayoutColumn | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const height = width < 500 ? 260 : 320;

  const colored = useMemo(
    () =>
      series.map((s, i) => ({
        ...s,
        color: i < ACCENT_VARS.length ? `var(${ACCENT_VARS[i]})` : "var(--color-ink-muted)",
        emphasize: i < ACCENT_VARS.length,
      })),
    [series]
  );

  // The label column: as wide as the longest "name $amount", up to 40% of the
  // chart — past that a name is shortened with an ellipsis rather than cut off.
  const amountChars = Math.max(0, ...series.map((s) => `$${s.finalAmount}`.length));
  const nameRoom = Math.max(4, Math.floor((width * 0.4 - LABEL_LEAD - (amountChars + 1) * LABEL_CHAR) / LABEL_CHAR));
  const labelName = (name: string) => (name.length > nameRoom ? `${name.slice(0, nameRoom - 1)}…` : name);
  const longestLabel = Math.max(0, ...series.map((s) => labelName(s.name).length + 1 + `$${s.finalAmount}`.length));
  const plotRight = width - (LABEL_LEAD + longestLabel * LABEL_CHAR + 4);

  const span = lastWeek + SEASON_GAP;
  const plotWidth = Math.max(1, plotRight - PAD_LEFT - 6);
  const xFor = (c: PayoutColumn) => PAD_LEFT + ((c === "season" ? span : c) / span) * plotWidth;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const maxAmount = niceMax(Math.max(1, ...series.map((s) => s.finalAmount)));
  const yFor = (amount: number) => PAD_TOP + plotHeight - (amount / maxAmount) * plotHeight;

  const labelYs = resolveLabelPositions(
    colored.map((s) => yFor(s.finalAmount)),
    height - 8
  );
  const gridSteps = 4;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => (maxAmount / gridSteps) * i);

  // The weeks along the bottom: every one when there's room, else every other —
  // never so close to the season label that they run together.
  const perWeek = plotWidth / span;
  const every = perWeek >= 16 ? 1 : 2;
  const weekTicks = Array.from({ length: lastWeek + 1 }, (_, w) => w).filter(
    (w) => w % every === 0 && xFor("season") - xFor(w) > 26
  );
  // What can be hovered: every column with a point on it.
  const hoverable = series[0]?.points.map((p) => p.week) ?? [];

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let nearest: PayoutColumn | null = null;
    let best = Infinity;
    for (const c of hoverable) {
      const d = Math.abs(xFor(c) - x);
      if (d < best) {
        best = d;
        nearest = c;
      }
    }
    setHover(nearest);
  }

  const hoverRows =
    hover != null
      ? colored
          .map((s) => ({ name: s.name, color: s.color, amount: s.points.find((p) => p.week === hover)?.amount ?? 0 }))
          .sort((a, b) => b.amount - a.amount)
      : [];

  if (hoverable.length <= 1) {
    return <p className="text-sm text-ink-muted">No weeks played yet.</p>;
  }

  return (
    <div ref={boxRef} className="relative w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block touch-none"
          role="img"
          aria-label="Running payouts through the season for each manager, week by week and at the season's end"
          onPointerMove={handleMove}
          onPointerDown={handleMove}
          onPointerLeave={() => setHover(null)}
        >
          {gridLines.map((g, i) => (
            <g key={i}>
              <line x1={PAD_LEFT} x2={plotRight} y1={yFor(g)} y2={yFor(g)} stroke="var(--color-grid)" strokeWidth={1} />
              <text x={PAD_LEFT} y={yFor(g) - 4} fontSize={AXIS_FONT} fill="var(--color-ink-muted)" className="tabular-nums">
                ${g.toFixed(0)}
              </text>
            </g>
          ))}

          <line
            x1={PAD_LEFT}
            x2={plotRight}
            y1={PAD_TOP + plotHeight}
            y2={PAD_TOP + plotHeight}
            stroke="var(--color-baseline)"
            strokeWidth={1}
          />
          {/* The season's end, set apart from the weeks. */}
          <line
            x1={(xFor(lastWeek) + xFor("season")) / 2}
            x2={(xFor(lastWeek) + xFor("season")) / 2}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            stroke="var(--color-grid)"
            strokeWidth={1}
          />
          {weekTicks.map((w) => (
            <text
              key={w}
              x={xFor(w)}
              y={height - 8}
              fontSize={AXIS_FONT}
              textAnchor="middle"
              fill="var(--color-ink-muted)"
              className="tabular-nums"
            >
              {w}
            </text>
          ))}
          <text x={xFor("season")} y={height - 8} fontSize={AXIS_FONT} textAnchor="middle" fill="var(--color-ink-muted)">
            Season
          </text>

          {hover != null ? (
            <line
              x1={xFor(hover)}
              x2={xFor(hover)}
              y1={PAD_TOP}
              y2={PAD_TOP + plotHeight}
              stroke="var(--color-baseline)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          {colored.map((s) => {
            const weekly = s.points.filter((p) => p.week !== "season");
            const season = s.points.find((p) => p.week === "season");
            const last = weekly.at(-1);
            const d = weekly.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.week)},${yFor(p.amount)}`).join(" ");
            const style = {
              stroke: s.color,
              strokeWidth: s.emphasize ? 2 : 1.5,
              strokeOpacity: s.emphasize ? 1 : 0.45,
              strokeLinecap: "round" as const,
              strokeLinejoin: "round" as const,
            };
            return (
              <g key={s.rosterId}>
                <path d={d} fill="none" {...style} />
                {season && last ? (
                  <path
                    d={`M${xFor(last.week)},${yFor(last.amount)} L${xFor("season")},${yFor(season.amount)}`}
                    fill="none"
                    strokeDasharray="4 4"
                    {...style}
                  />
                ) : null}
              </g>
            );
          })}

          {hover != null
            ? colored.map((s) => {
                const point = s.points.find((p) => p.week === hover);
                if (!point) return null;
                return (
                  <circle
                    key={s.rosterId}
                    cx={xFor(hover)}
                    cy={yFor(point.amount)}
                    r={s.emphasize ? 3.5 : 2.5}
                    fill={s.color}
                    fillOpacity={s.emphasize ? 1 : 0.6}
                    stroke="var(--color-surface-raised)"
                    strokeWidth={1.5}
                  />
                );
              })
            : null}

          {colored.map((s, i) => (
            <g key={`${s.rosterId}-label`}>
              <title>{`${s.name} $${s.finalAmount}`}</title>
              <circle cx={plotRight + 6} cy={labelYs[i]} r={3} fill={s.color} fillOpacity={s.emphasize ? 1 : 0.6} />
              {/* tspans flow one after another using the browser's own text metrics,
                  so the $ amount is never guessed into overlapping the name. */}
              <text x={plotRight + LABEL_LEAD} y={labelYs[i] + 3.5} fontSize={LABEL_FONT}>
                <tspan fill="var(--color-ink-primary)" fontWeight={s.emphasize ? 600 : 400}>
                  {labelName(s.name)}
                </tspan>
                <tspan dx={LABEL_CHAR} className="tabular-nums" fill="var(--color-ink-secondary)">
                  ${s.finalAmount}
                </tspan>
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {hover != null && width > 0 ? (
        <div
          className="pointer-events-none absolute top-2 z-10 border border-border bg-surface-raised px-3 py-2 text-xs shadow-md animate-[fade-in_0.1s_ease-out]"
          style={{
            left: xFor(hover),
            transform: xFor(hover) > width * 0.5 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
          }}
        >
          <div className="mb-1 font-semibold text-ink-primary">{columnLabel(hover)}</div>
          {hoverRows.map((r) => (
            <div key={`${uid}-${r.name}`} className="flex items-center gap-1.5 whitespace-nowrap text-ink-secondary">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
              <span>{r.name}</span>
              <span className="ml-auto pl-2 font-medium tabular-nums text-ink-primary">${r.amount}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
