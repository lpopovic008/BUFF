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
  /** Every trade on a line across the floor's back, by when (`offset`, as the timeline spaces them), to pick from. */
  timeline?: { trades: { at: number; offset: number }[]; picked: number; onPick: (i: number) => void };
}

/**
 * Where a trade viewer puts the trade it shows, for the room it stands in to play out on its floor — none, where
 * there's no floor for it (and the viewer shows the rosters itself).
 */
export const TradeFloorContext = createContext<((move: FloorMove | null) => void) | null>(null);

/** How long the rosters hold as they were before the trade plays out (ms). */
const HOLD_MS = 450;
/** A piece that stays put: a dot this big (px, nearest you); one that moves, its face this big. */
const DOT_PX = 6;
const FACE_PX = 30;

/**
 * A trade played out on the room's floor: each of the trading teams' lineups a row across the floor from left to
 * right, most valuable first as they're sorted (its name at its left end), the teams one behind the other, each piece
 * a dot in its position's color — and
 * those that change hands their faces (a ring for a pick), named. Each row has a place for everything the team
 * had before the trade or after it, in order, so nothing else moves as it plays: those that change hands go across
 * from their place in one row to the one kept open for them in the other — a dashed ring marking each open place
 * (where it'll land, then where it left) and an arc from where it stood to where it landed. Behind them,
 * at the floor's back, the league's trades on a line across it by when (see FloorTimeline), the one shown marked, any
 * picked from there. `room`: the screen it's on, its horizon `share` of the way down, the floor's front edge at screen
 * y `bottom`.
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
  // Each row's places: everything the team had before or after, in order — a piece's place in its row the same
  // before as after, so only what changes hands moves. As many places across as the fullest row needs, the same in
  // every row, so they line up.
  const places = rosters.map((r) => [...new Set([...r.before, ...r.after])].sort(order));
  const placeOf = (lane: number, id: string) => places[lane].indexOf(id);
  const slots = Math.max(1, ...places.map((l) => l.length));

  // The floor the lineups lie on: in front of the timeline at its back to a little short of its front edge, each
  // team's row a band of it, the first at the back; and as wide across as the screen lets the nearest row be.
  const horizon = height * share;
  const floor = bottom - horizon;
  const timelineDepth = floorDepth(horizon + floor * 0.09, height, share);
  const back = floorDepth(horizon + floor * 0.22, height, share);
  const front = floorDepth(bottom - floor * 0.14, height, share);
  const band = (front - back) / n;
  const rowDepth = (lane: number) => back + band * (lane + 0.5);
  const nearest = rowDepth(n - 1);
  const span = (width * 0.84) / floorScale(nearest);
  const cell = span / slots;
  const place = (lane: number, index: number) => {
    const d = rowDepth(lane);
    const [x, y] = floorPoint(-span / 2 + (index + 0.5) * cell, d, width, height, share);
    return { x, y, s: floorScale(d) / floorScale(nearest) };
  };
  const spots = new Map<string, ReturnType<typeof place>>();
  (played ? after : before).forEach((list, lane) => list.forEach((id) => spots.set(id, place(lane, placeOf(lane, id)))));
  const ids = [...new Set([...before.flat(), ...after.flat()])];
  const colorOf = (id: string) => (people.get(id)?.position === PICK ? "var(--ink-muted)" : (POSITION_COLOR_VAR[people.get(id)?.position ?? ""] ?? "var(--ink-muted)"));
  // Each lineup's name, at its left end.
  const lanes = rosters.map((r, lane) => ({ rosterId: r.rosterId, label: floorPoint(-span / 2 - cell * 0.2, rowDepth(lane) - band * 0.3, width, height, share) }));

  return (
    <div className="pointer-events-none fixed inset-0">
      {move.timeline ? <FloorTimeline timeline={move.timeline} depth={timelineDepth} span={span} room={room} /> : null}
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {/* The places kept open for what changes hands: where each will land, then where each left — and, once it's
            gone, the arc from where it stood to where it landed. */}
        {before.flatMap((list, lane) =>
          list.map((id) => {
            if (!moved.has(id)) return null;
            const from = place(lane, placeOf(lane, id));
            const toLane = after.findIndex((l) => l.includes(id));
            const to = toLane >= 0 ? place(toLane, placeOf(toLane, id)) : null;
            const open = played ? from : to;
            const lift = to ? Math.hypot(to.x - from.x, to.y - from.y) * 0.35 : 0;
            return (
              <g key={`open-${id}`}>
                {open ? (
                  <circle cx={open.x} cy={open.y} r={(FACE_PX / 2) * open.s} fill="none" stroke="var(--ink-muted)" strokeWidth={1.25} strokeDasharray="3 3" />
                ) : null}
                {played && to ? (
                  <path
                    className="animate-[fade-in_0.6s_ease-out_0.5s_backwards]"
                    d={`M${from.x},${from.y} Q${(from.x + to.x) / 2},${Math.min(from.y, to.y) - lift} ${to.x},${to.y}`}
                    fill="none"
                    stroke={colorOf(id)}
                    strokeWidth={1.5}
                    strokeOpacity={0.85}
                  />
                ) : null}
              </g>
            );
          })
        )}
      </svg>
      {lanes.map((lane) => (
        <span
          key={lane.rosterId}
          className="absolute max-w-[45vw] -translate-y-full truncate whitespace-nowrap text-[0.6875rem] font-extrabold uppercase tracking-wide text-ink-primary"
          style={{ left: lane.label[0], top: lane.label[1] - 3 }}
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
              <span className="block -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: size, height: size, background: colorOf(id) }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const dateLabel = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * The league's trades on a line across the back of the floor, `span` floor px wide `depth` px back: each a mark,
 * spaced by when (as the timeline spaces them, see trackOffsets), the one shown filled in and its date over it, each
 * year's start under the line — and each picked by a tap.
 */
function FloorTimeline({
  timeline,
  depth,
  span,
  room,
}: {
  timeline: NonNullable<FloorMove["timeline"]>;
  depth: number;
  span: number;
  room: { width: number; height: number; share: number };
}) {
  const { width, height, share } = room;
  const { trades, picked, onPick } = timeline;
  const last = trades.at(-1)?.offset ?? 0;
  const at = (offset: number) => floorPoint(last > 0 ? -span / 2 + (offset / last) * span : 0, depth, width, height, share);
  const [l, r] = [floorPoint(-span / 2, depth, width, height, share), floorPoint(span / 2, depth, width, height, share)];
  // Where each year starts along it.
  const years = trades.flatMap((t, i) => {
    const year = new Date(t.at).getFullYear();
    return i === 0 || new Date(trades[i - 1].at).getFullYear() !== year ? [{ year, x: at(t.offset)[0] }] : [];
  });
  return (
    <>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line x1={l[0]} y1={l[1]} x2={r[0]} y2={r[1]} stroke="var(--ink-primary)" strokeOpacity={0.3} strokeWidth={1} />
      </svg>
      {years.map((y) => (
        <span key={y.year} className="absolute -translate-x-1/2 text-[0.5625rem] font-bold tabular-nums text-ink-muted" style={{ left: y.x, top: l[1] + 6 }}>
          {y.year}
        </span>
      ))}
      {trades.map((t, i) => {
        const [x, y] = at(t.offset);
        const shown = i === picked;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            aria-label={`Trade of ${dateLabel(t.at)}`}
            title={dateLabel(t.at)}
            className="pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center"
            style={{ left: x, top: y }}
          >
            <span className={shown ? "h-2.5 w-2.5 bg-ink-primary" : "h-1.5 w-1.5 border border-ink-primary bg-page"} />
          </button>
        );
      })}
      {trades[picked] ? (
        <span
          className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap bg-[var(--map-tag)] px-1 text-[0.5625rem] font-bold uppercase leading-[1.35] text-[var(--map-tag-ink)]"
          style={{ left: at(trades[picked].offset)[0], top: at(trades[picked].offset)[1] - 8 }}
        >
          {dateLabel(trades[picked].at)}
        </span>
      ) : null}
    </>
  );
}
