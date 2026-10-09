"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RankedPlayer } from "@/lib/matchup-players";
import { layoutPillars } from "@/lib/roster-pillars";
import { POSITION_COLOR_VAR } from "@/lib/position-colors";
import { abbreviateFirstName } from "@/lib/format";

/** The app's font is monospaced: every character is half an em wide. */
const CHAR_EM = 0.5;
/** Text laid on a face runs along its edges, which climb (or fall) half a step for every step across. */
const ALONG = { x: 2 / Math.sqrt(5), y: 1 / Math.sqrt(5) };

/**
 * The longest version of a name that fits `room` px at a font size between
 * `maxFont` and `minFont`: "J. Allen", else just "Allen", else shortened.
 */
function fitName(name: string, room: number, maxFont: number, minFont: number): { text: string; font: number } {
  const short = abbreviateFirstName(name);
  const last = short.includes(" ") ? short.slice(short.indexOf(" ") + 1) : short;
  for (const text of [short, last]) {
    const font = Math.min(maxFont, room / (text.length * CHAR_EM));
    if (font >= minFont) return { text, font };
  }
  const chars = Math.max(1, Math.floor(room / (minFont * CHAR_EM)));
  return { text: last.length > chars ? `${last.slice(0, Math.max(1, chars - 1))}…` : last, font: minFont };
}

/**
 * A roster as isometric pillars (see lib/roster-pillars.ts): the most
 * valuable player alone at the back, then rows of 2, 3, … in front, each
 * pillar as tall as its player's value and in its position's color. The name
 * lies on the pillar's top; the value runs along the top of its right side.
 * Pointing at (or tapping) a pillar picks it out and reads it out in full.
 */
export function RosterPillars({ players, label }: { players: RankedPlayer[]; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(
    () => (width === 0 ? null : layoutPillars(players.map((p) => p.ktcValue), width)),
    [players, width]
  );
  const [focus, setFocus] = useState<number | null>(null);
  const focused = focus !== null ? players[focus] : null;

  return (
    <div ref={boxRef} className="w-full">
      {/* The picked pillar, in full — a line held open so the drawing doesn't jump. */}
      <p className="mb-1 h-4 truncate text-xs text-ink-secondary" aria-live="polite">
        {focused
          ? `${focused.name} · ${focused.position}${focused.team ? ` · ${focused.team}` : ""} · ${focused.ktcValue ?? "no value"}`
          : ""}
      </p>
      {layout ? (
        <svg
          width={width}
          height={layout.height}
          viewBox={`0 0 ${width} ${layout.height}`}
          role="img"
          aria-label={label}
          className="block select-none"
          onPointerLeave={() => setFocus(null)}
        >
          {layout.pillars.map((p) => {
            const player = players[p.index];
            const color = POSITION_COLOR_VAR[player.position] ?? "var(--ink-muted)";
            const h = layout.half;
            const q = h / 2;
            const { x, topY: y, height } = p;
            const top = `${x},${y - q} ${x + h},${y} ${x},${y + q} ${x - h},${y}`;
            const left = `${x - h},${y} ${x},${y + q} ${x},${y + q + height} ${x - h},${y + height}`;
            const right = `${x},${y + q} ${x + h},${y} ${x + h},${y + height} ${x},${y + q + height}`;
            // A face's edge, and how much text fits along it.
            const edge = Math.hypot(h, q);
            const name = fitName(player.name, edge * 0.86, 12, 7);
            const value = player.ktcValue != null ? String(player.ktcValue) : "—";
            const valueFont = Math.max(7, Math.min(11, (edge * 0.8) / (Math.max(4, value.length) * CHAR_EM)));
            const picked = focus === p.index;
            const dim = focus !== null && !picked;
            const shade = (pct: number) => `color-mix(in srgb, ${color} ${picked ? pct + 15 : pct}%, var(--page))`;
            return (
              <g
                key={player.playerId}
                tabIndex={0}
                role="button"
                aria-label={`${player.name}, ${player.position}, value ${value}`}
                onPointerEnter={() => setFocus(p.index)}
                onFocus={() => setFocus(p.index)}
                onBlur={() => setFocus(null)}
                onClick={() => setFocus((f) => (f === p.index ? null : p.index))}
                className="cursor-pointer outline-none transition-opacity duration-150"
                opacity={dim ? 0.35 : 1}
              >
                <title>{`${player.name} · ${player.position}${player.team ? ` · ${player.team}` : ""} · ${value}`}</title>
                <polygon points={left} fill={shade(45)} stroke={color} strokeWidth={1} strokeLinejoin="round" />
                <polygon points={right} fill={shade(65)} stroke={color} strokeWidth={1} strokeLinejoin="round" />
                <polygon points={top} fill={shade(22)} stroke={color} strokeWidth={picked ? 2 : 1} strokeLinejoin="round" />
                {/* The name, lying flat on the top: along its front-right edge, the letters' feet toward you. */}
                <text
                  transform={`matrix(${ALONG.x} ${-ALONG.y} ${ALONG.x} ${ALONG.y} ${x} ${y})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-ink-primary font-bold"
                  style={{ fontSize: name.font }}
                >
                  {name.text}
                </text>
                {/* The value, along the very top of the right side. */}
                <text
                  transform={`matrix(${ALONG.x} ${-ALONG.y} 0 1 ${x + h / 2} ${y + q / 2 + valueFont + 1})`}
                  textAnchor="middle"
                  className="fill-ink-primary font-bold tabular-nums"
                  style={{ fontSize: valueFont }}
                >
                  {value}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
