"use client";

import { createContext, useEffect, useState } from "react";
import { PICK, TimelinePlayer } from "@/lib/league-trades";
import { floorDepth, floorPoint, floorScale } from "@/lib/grid-room";
import type { TradeRoster } from "@/lib/trade-viewer";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { POSITION_COLOR_VAR } from "@/lib/position-colors";

/** A trade to play out on the room's floor (see FloorTradeMove): the rosters it changed, and what moved. */
export interface FloorMove {
  /** Fresh for each trade, and each replay: a new one plays from the start. */
  key: string;
  rosters: TradeRoster[];
  moved: Set<string>;
  people: Map<string, TimelinePlayer>;
  /** The order each roster's put in. */
  order: (a: string, b: string) => number;
  teamName: (rosterId: number) => string;
}

/**
 * Where a trade viewer puts the trade it shows, for the room it stands in to play out on its floor — none, where
 * there's no floor for it (and the viewer shows the rosters itself).
 */
export const TradeFloorContext = createContext<((move: FloorMove | null) => void) | null>(null);

/** How long the rosters hold as they were before the trade plays out (ms). */
const HOLD_MS = 450;
/** How many pieces a row of a lineup holds, across. */
const ACROSS = 5;
/** A piece that stays put: a dot this big (px, nearest you); one that moves, its face this big. */
const DOT_PX = 5;
const FACE_PX = 30;

/**
 * A trade played out on the room's floor: the trading teams' lineups laid side by side on it, each a block of rows
 * running back from you (its name at its back), each piece in it a dot — and those that change hands their faces
 * (a ring for a pick), named. As it plays, they go across to their new lineup, the rest closing ranks, a dashed ring
 * left where each stood and an arc from there to where it landed. `room`: the screen it's on, its horizon `share` of
 * the way down, the floor's front edge at screen y `bottom`.
 */
export function FloorTradeMove({ move, room }: { move: FloorMove; room: { width: number; height: number; share: number; bottom: number } }) {
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), HOLD_MS);
    return () => clearTimeout(timer);
  }, []);
  const { width, height, share, bottom } = room;
  const { rosters, moved, people, order, teamName } = move;
  const n = Math.max(1, rosters.length);
  const before = rosters.map((r) => [...r.before].sort(order));
  const after = rosters.map((r) => [...r.after].sort(order));
  const rows = Math.max(1, Math.ceil(Math.max(1, ...before.map((l) => l.length), ...after.map((l) => l.length)) / ACROSS));

  // The floor the lineups lie on: from a little in front of the horizon to a little short of the front edge, and as
  // wide across as the screen lets their nearest row be.
  const horizon = height * share;
  const floor = bottom - horizon;
  const back = floorDepth(horizon + floor * 0.12, height, share);
  const front = floorDepth(bottom - floor * 0.16, height, share);
  const span = (width * 0.82) / floorScale(front);
  const laneGap = span * 0.07;
  const laneW = (span - laneGap * (n - 1)) / n;
  const cell = laneW / ACROSS;
  // A row's depth (the first nearest you), and a piece's place on the floor.
  const rowDepth = (row: number) => front - ((front - back) * row) / Math.max(1, rows - 1);
  const laneLeft = (lane: number) => -span / 2 + lane * (laneW + laneGap);
  const place = (lane: number, index: number) => {
    const d = rowDepth(Math.floor(index / ACROSS));
    const [x, y] = floorPoint(laneLeft(lane) + ((index % ACROSS) + 0.5) * cell, d, width, height, share);
    return { x, y, s: floorScale(d) / floorScale(front) };
  };
  const spots = new Map<string, ReturnType<typeof place>>();
  (played ? after : before).forEach((list, lane) => list.forEach((id, i) => spots.set(id, place(lane, i))));
  const ids = [...new Set([...before.flat(), ...after.flat()])];
  const colorOf = (id: string) => (people.get(id)?.position === PICK ? "var(--ink-muted)" : (POSITION_COLOR_VAR[people.get(id)?.position ?? ""] ?? "var(--ink-muted)"));
  // Each lineup's patch of floor, outlined faintly; its name in front of it.
  const lanes = rosters.map((r, lane) => {
    const pad = cell * 0.15;
    const [l, rgt] = [laneLeft(lane) - pad, laneLeft(lane) + laneW + pad];
    const extra = (front - back) / Math.max(1, rows) / 2;
    const [dFront, dBack] = [front + extra, back - extra];
    const corners = [
      floorPoint(l, dFront, width, height, share),
      floorPoint(rgt, dFront, width, height, share),
      floorPoint(rgt, dBack, width, height, share),
      floorPoint(l, dBack, width, height, share),
    ];
    const label = floorPoint(laneLeft(lane) + laneW / 2, dBack, width, height, share);
    return { rosterId: r.rosterId, corners, label };
  });

  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {lanes.map((lane) => (
          <path
            key={lane.rosterId}
            d={`M${lane.corners.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`}
            fill="var(--ink-primary)"
            fillOpacity={0.03}
            stroke="var(--ink-primary)"
            strokeOpacity={0.25}
            strokeWidth={1}
          />
        ))}
        {/* Where each piece that went stood, and the arc to where it landed. */}
        {played
          ? before.flatMap((list, lane) =>
              list.map((id, i) => {
                const to = spots.get(id);
                if (!moved.has(id) || !to) return null;
                const from = place(lane, i);
                const lift = Math.hypot(to.x - from.x, to.y - from.y) * 0.35;
                const [mx, my] = [(from.x + to.x) / 2, Math.min(from.y, to.y) - lift];
                return (
                  <g key={`arc-${id}`} className="animate-[fade-in_0.6s_ease-out_0.5s_backwards]">
                    <circle cx={from.x} cy={from.y} r={(FACE_PX / 2) * from.s} fill="none" stroke="var(--ink-muted)" strokeWidth={1.25} strokeDasharray="3 3" />
                    <path d={`M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`} fill="none" stroke={colorOf(id)} strokeWidth={1.5} strokeOpacity={0.85} />
                  </g>
                );
              })
            )
          : null}
      </svg>
      {lanes.map((lane) => (
        <span
          key={lane.rosterId}
          className="absolute max-w-[45vw] -translate-x-1/2 -translate-y-full truncate whitespace-nowrap text-[0.6875rem] font-extrabold uppercase tracking-wide text-ink-primary"
          style={{ left: lane.label[0], top: lane.label[1] - 4 }}
        >
          {teamName(lane.rosterId)}
        </span>
      ))}
      {ids.map((id) => {
        const at = spots.get(id);
        if (!at) return null;
        const going = moved.has(id);
        const person = people.get(id);
        const size = (going ? FACE_PX : DOT_PX) * at.s;
        return (
          <div
            key={id}
            className={`absolute left-0 top-0 transition-transform duration-700 ease-[cubic-bezier(.6,.05,.25,1)] motion-reduce:transition-none ${going ? "z-10" : ""}`}
            style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
            title={person?.name ?? id}
          >
            {going ? (
              <div className="flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                <span className="block overflow-hidden rounded-full border-2 bg-page" style={{ width: size, height: size, borderColor: colorOf(id) }}>
                  {person?.position === PICK ? (
                    <span className="flex h-full w-full items-center justify-center text-[0.5rem] font-bold text-ink-secondary">PK</span>
                  ) : (
                    <PlayerHeadshot playerId={id} size={Math.round(size)} />
                  )}
                </span>
                <span
                  className="mt-0.5 max-w-[7rem] truncate whitespace-nowrap bg-[var(--map-tag)] px-1 text-[0.5625rem] font-bold leading-[1.35] text-[var(--map-tag-ink)]"
                  style={{ transform: `scale(${Math.max(0.75, at.s)})`, transformOrigin: "top center" }}
                >
                  {person?.name ?? id}
                </span>
              </div>
            ) : (
              <span className="block -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-primary opacity-60" style={{ width: size, height: size }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
