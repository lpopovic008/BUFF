"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RankedPlayer } from "@/lib/matchup-players";
import { layoutRosterWeb } from "@/lib/roster-web";
import { POSITION_COLOR_VAR } from "@/lib/position-colors";
import { abbreviateFirstName } from "@/lib/format";

/** A dot this big or bigger has room for its value inside it. */
const VALUE_INSIDE_R = 14;
/** The names' size, and about how wide each character of one runs, to keep names from colliding. */
const LABEL_PX = 10.5;
const LABEL_CHAR_PX = 5.6;

/**
 * A roster as a web (see lib/roster-web.ts): one dot per player in its
 * position's color, the most valuable biggest and in the middle, each joined
 * to its nearest few. Pointing at (or tapping) a player lights up their
 * lines and shows their value.
 */
export function RosterWeb({ players, label }: { players: RankedPlayer[]; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Taller than wide on a phone, wider than tall on a desktop.
  const height = width === 0 ? 0 : Math.round(width < 500 ? width * 1.3 : Math.max(420, width * 0.7));
  const maxR = width < 500 ? 16 : Math.min(30, Math.min(width, height) / 18);
  const layout = useMemo(
    () =>
      width === 0
        ? null
        : layoutRosterWeb(
            players.map((p) => p.ktcValue),
            width,
            height,
            { maxR, labelGap: 14, labelWidths: players.map((p) => abbreviateFirstName(p.name).length * LABEL_CHAR_PX) }
          ),
    [players, width, height, maxR]
  );
  const [focus, setFocus] = useState<number | null>(null);
  const linked = useMemo(() => {
    if (focus === null || !layout) return null;
    return new Set(layout.edges.flatMap(([a, b]) => (a === focus ? [b] : b === focus ? [a] : [])));
  }, [focus, layout]);

  return (
    <div ref={boxRef} className="w-full">
      {layout ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label}
          className="block select-none"
          onPointerLeave={() => setFocus(null)}
        >
          <g>
            {layout.edges.map(([a, b]) => {
              const lit = focus !== null && (a === focus || b === focus);
              return (
                <line
                  key={`${a}:${b}`}
                  x1={layout.nodes[a].x}
                  y1={layout.nodes[a].y}
                  x2={layout.nodes[b].x}
                  y2={layout.nodes[b].y}
                  stroke={lit ? "var(--ink-primary)" : "var(--ink-muted)"}
                  strokeOpacity={lit ? 0.9 : focus === null ? 0.45 : 0.15}
                  strokeWidth={lit ? 1.5 : 1}
                  className="transition-[stroke-opacity] duration-150"
                />
              );
            })}
          </g>
          {players.map((p, i) => {
            const node = layout.nodes[i];
            const color = POSITION_COLOR_VAR[p.position] ?? "var(--ink-muted)";
            const dim = focus !== null && focus !== i && !linked?.has(i);
            const big = node.r >= VALUE_INSIDE_R;
            const value = p.ktcValue != null ? String(p.ktcValue) : "—";
            return (
              <g
                key={p.playerId}
                transform={`translate(${node.x} ${node.y})`}
                tabIndex={0}
                role="button"
                aria-label={`${p.name}, ${p.position}, value ${value}`}
                onPointerEnter={() => setFocus(i)}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus(null)}
                onClick={() => setFocus((f) => (f === i ? null : i))}
                className="cursor-pointer outline-none transition-opacity duration-150"
                opacity={dim ? 0.3 : 1}
              >
                <title>{`${p.name} · ${p.position}${p.team ? ` · ${p.team}` : ""} · ${value}`}</title>
                <circle
                  r={node.r}
                  fill={`color-mix(in srgb, ${color} ${focus === i ? 45 : 22}%, var(--page))`}
                  stroke={color}
                  strokeWidth={focus === i ? 2 : 1.25}
                />
                {big ? (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-ink-primary font-bold tabular-nums"
                    style={{ fontSize: Math.min(13, node.r * 0.62) }}
                  >
                    {value}
                  </text>
                ) : null}
                <text
                  y={node.r + 10}
                  textAnchor="middle"
                  className={focus === i ? "fill-ink-primary font-bold" : "fill-ink-secondary"}
                  style={{ fontSize: LABEL_PX }}
                >
                  {focus === i && !big ? `${abbreviateFirstName(p.name)} · ${value}` : abbreviateFirstName(p.name)}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
