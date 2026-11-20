"use client";

import { createContext, useEffect, useState } from "react";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { floorDepth, floorPoint, floorScale } from "@/lib/grid-room";
import { shownGrade, valueGrade } from "@/lib/player-values";
import { POSITION_COLOR_VAR } from "@/lib/position-colors";

/** A piece in the trade calculator, as the floor stands it up: a player (his face), or a pick. */
export interface CalcPiece {
  id: string;
  label: string;
  /** A player's position, or "PICK". */
  position: string;
  value: number | null;
}

/** What the trade calculator has in it (see TradeCalculator): what you'd give, and what you'd get. */
export interface CalcFloor {
  give: CalcPiece[];
  get: CalcPiece[];
}

/**
 * Where the trade calculator puts what's in it, for the room it stands in to stand on its floor (see FloorTradeCalc)
 * — none, where there's no floor for it.
 */
export const TradeCalcFloorContext = createContext<((calc: CalcFloor | null) => void) | null>(null);

/** How long a piece takes to rise up out of the floor (ms). */
const RISE_MS = 600;
/** The biggest a piece's face is, nearest you (px). */
const MOST_FACE_PX = 64;

/** Something standing up off the floor, its foot on it, risen up out of it as it comes. */
function Rising({ children }: { children: React.ReactNode }) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUp(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="overflow-hidden">
      <div
        className="transition-transform motion-reduce:transition-none"
        style={{ transform: up ? "translateY(0)" : "translateY(105%)", transitionDuration: `${RISE_MS}ms`, transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The trade calculator's two sides standing up off the room's floor, each piece risen up out of it as it's added: what
 * you'd give on the left half, what you'd get on the right — each side its most valuable piece nearest you, by the
 * middle, and each next one beside the one before and a step further back, out toward the side, so the two fan out
 * from the front of the floor. Each a face (a disc, for a pick) over its name (a player's last) and value; each side
 * named at its front.
 * `room`: the screen it's on, its horizon `share` of the way down, the floor's front edge at screen y `bottom`.
 */
export function FloorTradeCalc({ calc, room }: { calc: CalcFloor; room: { width: number; height: number; share: number; bottom: number } }) {
  const { width, height, share, bottom } = room;
  const horizon = height * share;
  const floor = bottom - horizon;
  // Its front (the nearest pieces' feet) and how far back a side's pieces may go.
  const front = floorDepth(bottom - floor * 0.16, height, share);
  const back = floorDepth(horizon + floor * 0.12, height, share);
  const nearest = floorScale(front);
  // Across the floor (floor px): as wide as the screen lets the front be, a little in from its edges.
  const span = (width * 0.9) / nearest;
  const face = Math.min(span * 0.1, MOST_FACE_PX / nearest);
  const sides = [
    { key: "give", title: "You give", pieces: calc.give, toward: -1 },
    { key: "get", title: "You get", pieces: calc.get, toward: 1 },
  ];
  // How many a side has, at most: how far apart they stand, back and across.
  const most = Math.max(1, ...sides.map((s) => s.pieces.length));
  const stepBack = Math.min(face * 1.6, (front - back) / Math.max(1, most - 1));
  const middleGap = face * 0.95;
  const stepAcross = Math.min(face * 1.5, (span / 2 - middleGap - face / 2) / Math.max(1, most - 1));
  const placed = sides.flatMap((side) =>
    [...side.pieces]
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
      .map((piece, k) => {
        const d = front - k * stepBack;
        const [x, y] = floorPoint(side.toward * (middleGap + k * stepAcross), d, width, height, share);
        return { piece, x, y, d, s: floorScale(d) / nearest };
      })
  );
  // Each side's name, just in front of its nearest piece.
  const titles = sides.map((side) => {
    const [x, y] = floorPoint(side.toward * middleGap, front, width, height, share);
    return { ...side, x, y };
  });

  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden>
      {titles.map((t) =>
        t.pieces.length > 0 ? (
          <span
            key={t.key}
            className="absolute top-0 whitespace-nowrap text-[0.6875rem] font-extrabold uppercase tracking-wide text-ink-secondary"
            style={{ left: t.x, top: t.y + 8, transform: "translateX(-50%)" }}
          >
            {t.title}
          </span>
        ) : null
      )}
      {placed
        // The furthest drawn first: nearer ones stand in front of them.
        .sort((a, b) => a.d - b.d)
        .map(({ piece, x, y, s }) => {
          const size = face * nearest * s;
          const pick = piece.position === "PICK";
          const ring = pick ? "var(--ink-muted)" : (POSITION_COLOR_VAR[piece.position] ?? "var(--ink-muted)");
          return (
            <div
              key={piece.id}
              className="absolute left-0 top-0 transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {/* Standing on the floor: its foot at the point, everything above it. */}
              <div className="absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center">
                <Rising>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="block overflow-hidden rounded-full border-2 bg-page" style={{ width: size, height: size, borderColor: ring }}>
                      {pick ? (
                        <span className="flex h-full w-full items-center justify-center font-bold text-ink-secondary" style={{ fontSize: Math.max(8, size * 0.28) }}>
                          PICK
                        </span>
                      ) : (
                        <PlayerHeadshot playerId={piece.id} size={Math.round(size)} />
                      )}
                    </span>
                    <span
                      className="whitespace-nowrap bg-[var(--map-tag)] px-1 font-bold leading-[1.35] text-[var(--map-tag-ink)]"
                      style={{ fontSize: `${Math.max(0.5, 0.625 * Math.max(0.8, s))}rem` }}
                    >
                      {pick ? piece.label : piece.label.split(" ").slice(1).join(" ") || piece.label}
                      {piece.value != null ? <span className="ml-1 tabular-nums opacity-70">{shownGrade(valueGrade(piece.value))}</span> : null}
                    </span>
                  </div>
                </Rising>
                {/* A soft shadow at its foot. */}
                <span className="absolute -bottom-1 left-1/2 h-2 -translate-x-1/2 rounded-[50%] bg-ink-primary/10 blur-[2px]" style={{ width: size * 1.1 }} />
              </div>
            </div>
          );
        })}
    </div>
  );
}
