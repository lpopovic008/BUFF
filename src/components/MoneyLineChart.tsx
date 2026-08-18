"use client";

import { useId, useMemo, useState } from "react";
import { CumulativeSeries } from "@/lib/payouts";

const WIDTH = 720;
const HEIGHT = 320;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PAD_LEFT = 8;
const LABEL_WIDTH = 96;
const PLOT_RIGHT = WIDTH - LABEL_WIDTH;

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

/** Pushes apart label y-positions that would otherwise overlap, preserving relative order. */
function resolveLabelPositions(desired: number[]): number[] {
  const order = desired.map((y, i) => i).sort((a, b) => desired[a] - desired[b]);
  const resolved = [...desired];
  for (let k = 1; k < order.length; k++) {
    const i = order[k];
    const prev = order[k - 1];
    if (resolved[i] - resolved[prev] < MIN_LABEL_GAP) {
      resolved[i] = resolved[prev] + MIN_LABEL_GAP;
    }
  }
  return resolved;
}

export function MoneyLineChart({ series }: { series: CumulativeSeries[] }) {
  const uid = useId();
  const [hoverWeek, setHoverWeek] = useState<number | null>(null);

  const weeks = series[0]?.points.map((p) => p.week) ?? [];
  const maxAmount = niceMax(Math.max(1, ...series.map((s) => s.finalAmount)));

  const plotWidth = PLOT_RIGHT - PAD_LEFT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xFor = (week: number) => {
    if (weeks.length <= 1) return PAD_LEFT + plotWidth / 2;
    const idx = weeks.indexOf(week);
    return PAD_LEFT + (idx / (weeks.length - 1)) * plotWidth;
  };
  const yFor = (amount: number) => PAD_TOP + plotHeight - (amount / maxAmount) * plotHeight;

  const colored = useMemo(
    () =>
      series.map((s, i) => ({
        ...s,
        color: i < ACCENT_VARS.length ? `var(${ACCENT_VARS[i]})` : "var(--color-ink-muted)",
        emphasize: i < ACCENT_VARS.length,
      })),
    [series]
  );

  const labelYs = resolveLabelPositions(colored.map((s) => yFor(s.finalAmount)));

  const gridSteps = 4;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => (maxAmount / gridSteps) * i);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const xPos = (e.clientX - rect.left) * scaleX;
    if (weeks.length === 0) return;
    let nearest = weeks[0];
    let best = Infinity;
    for (const w of weeks) {
      const d = Math.abs(xFor(w) - xPos);
      if (d < best) {
        best = d;
        nearest = w;
      }
    }
    setHoverWeek(nearest);
  }

  const hoverRows =
    hoverWeek != null
      ? colored
          .map((s) => ({
            name: s.name,
            color: s.color,
            amount: s.points.find((p) => p.week === hoverWeek)?.amount ?? 0,
          }))
          .sort((a, b) => b.amount - a.amount)
      : [];

  if (weeks.length === 0) {
    return <p className="text-sm text-ink-muted">No weeks played yet.</p>;
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        role="img"
        aria-label="Cumulative payout by week for each manager"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverWeek(null)}
      >
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              x2={PLOT_RIGHT}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="var(--color-grid)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT}
              y={yFor(g) - 4}
              fontSize={10}
              fill="var(--color-ink-muted)"
              className="tabular-nums"
            >
              ${g.toFixed(0)}
            </text>
          </g>
        ))}

        <line
          x1={PAD_LEFT}
          x2={PLOT_RIGHT}
          y1={PAD_TOP + plotHeight}
          y2={PAD_TOP + plotHeight}
          stroke="var(--color-baseline)"
          strokeWidth={1}
        />
        {weeks
          .filter((w) => w === 1 || w % 2 === 0 || w === weeks.length)
          .map((w) => (
            <text
              key={w}
              x={xFor(w)}
              y={HEIGHT - 8}
              fontSize={10}
              textAnchor="middle"
              fill="var(--color-ink-muted)"
              className="tabular-nums"
            >
              {w}
            </text>
          ))}

        {hoverWeek != null ? (
          <line
            x1={xFor(hoverWeek)}
            x2={xFor(hoverWeek)}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            stroke="var(--color-baseline)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        {colored.map((s) => {
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.week)},${yFor(p.amount)}`).join(" ");
          return (
            <path
              key={s.rosterId}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.emphasize ? 2 : 1.5}
              strokeOpacity={s.emphasize ? 1 : 0.45}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {hoverWeek != null
          ? colored.map((s) => {
              const point = s.points.find((p) => p.week === hoverWeek);
              if (!point) return null;
              return (
                <circle
                  key={s.rosterId}
                  cx={xFor(hoverWeek)}
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
            <circle cx={PLOT_RIGHT + 6} cy={labelYs[i]} r={3} fill={s.color} fillOpacity={s.emphasize ? 1 : 0.6} />
            {/* tspans flow one after another using the browser's own text metrics,
                so the $ amount is never guessed into overlapping the name. */}
            <text x={PLOT_RIGHT + 13} y={labelYs[i] + 3.5} fontSize={11}>
              <tspan fill="var(--color-ink-primary)" fontWeight={s.emphasize ? 600 : 400}>
                {s.name}
              </tspan>
              <tspan dx={6} className="tabular-nums" fill="var(--color-ink-secondary)">
                ${s.finalAmount}
              </tspan>
            </text>
          </g>
        ))}
      </svg>

      {hoverWeek != null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 border border-border bg-surface-raised px-3 py-2 text-xs shadow-md animate-[fade-in_0.1s_ease-out]"
          style={{
            left: `${(xFor(hoverWeek) / WIDTH) * 100}%`,
            transform: xFor(hoverWeek) > WIDTH * 0.6 ? "translateX(-105%)" : "translateX(10px)",
          }}
        >
          <div className="mb-1 font-semibold text-ink-primary">Week {hoverWeek}</div>
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
