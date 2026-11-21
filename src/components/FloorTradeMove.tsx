"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { PICK, TimelinePlayer } from "@/lib/league-trades";
import { floorDepth, floorPoint, floorScale } from "@/lib/grid-room";
import type { TradeRoster } from "@/lib/trade-viewer";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { POSITION_COLOR_VAR } from "@/lib/position-colors";
import { shownGrade, valueGrade } from "@/lib/player-values";

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
  /** Each piece's value as the trade was made — what it's placed by (else its value now). */
  valueOf?: (id: string) => number | null;
  /** Each team's color, by roster id: its name, and the arcs of what it got. */
  colors?: Map<number, string>;
  /** Every trade on a line across the floor's back, by when (`offset`, as the timeline spaces them), to pick from. */
  timeline?: {
    /** The season shown — one at a time — named at the line's left end. */
    season: string;
    trades: { at: number; offset: number }[];
    /** The one shown, among them (-1, none of them). */
    picked: number;
    onPick: (i: number) => void;
    /** A swipe across the floor: the next trade (1) or the last (-1) — on into the next season or the last, where it goes. */
    onStep: (by: 1 | -1) => void;
  };
}

/**
 * Where a trade viewer puts the trade it shows, for the room it stands in to play out on its floor — none, where
 * there's no floor for it (and the viewer shows the rosters itself).
 */
export const TradeFloorContext = createContext<((move: FloorMove | null) => void) | null>(null);

/** How long the rosters hold as they were before the trade plays out (ms). */
const HOLD_MS = 450;
/** A piece that stays put: a dot this big (px, nearest you); one that moves, a dot this big, its card this wide over it. */
const DOT_PX = 6;
const MOVED_DOT_PX = 8;
const CARD_PX = 30;
/** How far apart across a column two cards standing too close are moved, each to its side (cards' widths): their names clear. */
const NUDGE_CARDS = 1.7;
/** How long a moving piece's card takes to rise up out of the floor (ms). */
const RISE_MS = 600;
/** A card's reflection in the floor: strongest at its foot, gone a little way down. */
const REFLECTION_FADE = "linear-gradient(to top, rgba(0, 0, 0, 0.35), transparent 75%)";

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
 * A trade played out on the room's floor: each of the trading teams' lineups a column running from the front of the
 * floor to the back, side by side across it (its name at its front end), each piece a dot in its position's color
 * placed down its column by its value as the trade was made — the most valuable nearest you, the room between any two
 * as deep as the difference in their values. Each that changes hands has its card standing up out of the floor over
 * its dot (a pick's, a ring), named with what it was worth then, reflected in the floor under it. Nothing else moves
 * as it plays: those that change hands go straight across, at the same depth, to their place in the other column,
 * kept open — a dashed ring marking each open place (where it'll land, then where it left) and a line along the floor,
 * in the color of the team that got it, from where it stood to where it landed. In front of them, nearest you, the
 * league's trades on a line across the floor by when (see FloorTimeline), the one shown marked, any picked from there.
 * `room`: the screen it's on, its horizon `share` of the way down, the floor's front edge at screen y `bottom`.
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
  // Each piece's place down its column: by its value, the most valuable nearest you, the room between any two as deep
  // as the difference in their values (on one scale for every column, so a piece that changes hands goes straight
  // across from its place in one to its place in the other); those with none at the back.
  const all = [...new Set(rosters.flatMap((r) => [...r.before, ...r.after]))];
  const valueOf = move.valueOf ?? ((id: string) => people.get(id)?.value ?? null);
  const values = new Map(all.map((id) => [id, valueOf(id)]));
  const valued = [...values.values()].filter((v): v is number => v !== null);
  const [lowest, highest] = [Math.min(...valued), Math.max(...valued)];
  const teamColor = (rosterId: number) => move.colors?.get(rosterId) ?? "var(--ink-primary)";
  const along = (id: string) => {
    const v = values.get(id) ?? null;
    if (v === null || !(highest > lowest)) return v === null ? 1 : 0.5;
    return (highest - v) / (highest - lowest);
  };

  // The floor the columns lie on: from a little in front of the horizon to the timeline nearest you, the most
  // valuable at the front; and across it, each team's column as far apart as the screen lets the nearest pieces be.
  const horizon = height * share;
  const floor = bottom - horizon;
  const back = floorDepth(horizon + floor * 0.1, height, share);
  const front = floorDepth(bottom - floor * 0.3, height, share);
  // The timeline in front of them, nearest you.
  const timelineDepth = floorDepth(bottom - floor * 0.1, height, share);
  const nearest = floorScale(front);
  const span = (width * 0.62) / nearest;
  const laneX = (lane: number) => (-0.5 + (lane + 0.5) / n) * span;
  const depthOf = (id: string) => front - along(id) * (front - back);
  const place = (lane: number, id: string) => {
    const d = depthOf(id);
    const [x, y] = floorPoint(laneX(lane), d, width, height, share);
    return { x, y, d, s: floorScale(d) / nearest };
  };
  const spots = new Map<string, ReturnType<typeof place>>();
  (played ? after : before).forEach((list, lane) => list.forEach((id) => spots.set(id, place(lane, id))));
  const ids = [...new Set([...before.flat(), ...after.flat()])];
  const colorOf = (id: string) => (people.get(id)?.position === PICK ? "var(--ink-muted)" : (POSITION_COLOR_VAR[people.get(id)?.position ?? ""] ?? "var(--ink-muted)"));
  // Each column's ends: its line along the floor, and its name at its front end.
  const lanes = rosters.map((r, lane) => ({
    rosterId: r.rosterId,
    from: floorPoint(laneX(lane), back, width, height, share),
    to: floorPoint(laneX(lane), front, width, height, share),
  }));
  // Nearer pieces in front of farther ones.
  const drawOrder = [...ids].sort((a, b) => (spots.get(a)?.d ?? 0) - (spots.get(b)?.d ?? 0));
  // Cards standing so close in one column that one would all but hide the other (pieces worth about the same) are
  // moved a little apart across it, one to each side, each still over its own dot.
  const nudge = new Map<string, number>();
  (played ? after : before).forEach((list) => {
    const cards = list.filter((id) => moved.has(id) && spots.has(id)).sort((a, b) => spots.get(a)!.y - spots.get(b)!.y);
    // Each card's side: 0 where it stands clear of the one before it, else the other side from it (the one before
    // moved to the right, if it was standing straight).
    const sides: number[] = [];
    cards.forEach((id, i) => {
      const at = spots.get(id)!;
      const close = i > 0 && at.y - spots.get(cards[i - 1])!.y < CARD_PX * 1.25 * at.s * 0.5;
      if (close && sides[i - 1] === 0) sides[i - 1] = 1;
      sides.push(close ? -sides[i - 1] : 0);
    });
    cards.forEach((id, i) => {
      if (sides[i]) nudge.set(id, sides[i] * CARD_PX * spots.get(id)!.s * NUDGE_CARDS);
    });
  });

  return (
    <div className="pointer-events-none fixed inset-0">
      {move.timeline ? <FloorTimeline timeline={move.timeline} depth={timelineDepth} room={room} /> : null}
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {/* Each team's column, a faint line along the floor in its color. */}
        {lanes.map((lane) => (
          <line key={`lane-${lane.rosterId}`} x1={lane.from[0]} y1={lane.from[1]} x2={lane.to[0]} y2={lane.to[1]} stroke={teamColor(lane.rosterId)} strokeOpacity={0.35} strokeWidth={1} />
        ))}
        {/* The places kept open for what changes hands: where each will land, then where each left — and, once it's
            gone, the line along the floor from where it stood to where it landed. */}
        {before.flatMap((list, lane) =>
          list.map((id) => {
            if (!moved.has(id)) return null;
            const from = place(lane, id);
            const toLane = after.findIndex((l) => l.includes(id));
            const to = toLane >= 0 ? place(toLane, id) : null;
            // In the color of the team that got it.
            const lineColor = toLane >= 0 ? teamColor(rosters[toLane].rosterId) : colorOf(id);
            const open = played ? from : to;
            return (
              <g key={`open-${id}`}>
                {open ? (
                  <ellipse cx={open.x} cy={open.y} rx={(MOVED_DOT_PX + 4) * open.s} ry={(MOVED_DOT_PX + 4) * open.s * 0.45} fill="none" stroke="var(--ink-muted)" strokeWidth={1.25} strokeDasharray="3 3" />
                ) : null}
                {played && to ? (
                  <line
                    className="animate-[fade-in_0.6s_ease-out_0.5s_backwards]"
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={lineColor}
                    strokeWidth={1.5}
                    strokeOpacity={0.9}
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
          className="absolute max-w-[40vw] -translate-x-1/2 truncate whitespace-nowrap text-[0.6875rem] font-extrabold uppercase tracking-wide"
          style={{ left: lane.to[0], top: lane.to[1] + 8, color: teamColor(lane.rosterId) }}
        >
          {teamName(lane.rosterId)}
        </span>
      ))}
      {drawOrder.map((id) => {
        const at = spots.get(id);
        if (!at) return null;
        const going = moved.has(id);
        const person = people.get(id);
        const dot = (going ? MOVED_DOT_PX : DOT_PX) * at.s;
        return (
          <div
            key={id}
            className="absolute left-0 top-0 transition-transform duration-700 ease-[cubic-bezier(.6,.05,.25,1)] motion-reduce:transition-none"
            style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
            title={`${person?.name ?? id}${values.get(id) != null ? ` · ${shownGrade(valueGrade(values.get(id)!))} then` : ""}`}
          >
            {/* Its dot on its column's line, flattened as the floor is. */}
            <span className="absolute block -translate-x-1/2 -translate-y-1/2 rounded-[50%]" style={{ width: dot, height: dot * 0.55, background: colorOf(id) }} />
            {going ? (
              <div className="absolute left-0 top-0 transition-transform duration-300" style={{ transform: `translateX(${nudge.get(id) ?? 0}px)` }}>
                <PieceCard id={id} person={person} value={values.get(id) ?? null} color={colorOf(id)} scale={at.s} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A piece that changes hands, standing up out of the floor over its dot like its player card: his face (a pick's,
 * its ring) framed in his position's color, his name and what he was worth then on the theme's tag over it — risen up
 * out of the floor as it comes, and reflected in the floor under it, faint and fading away from its foot.
 */
function PieceCard({ id, person, value, color, scale }: { id: string; person: TimelinePlayer | undefined; value: number | null; color: string; scale: number }) {
  const w = CARD_PX * scale;
  const pick = person?.position === PICK;
  const card = (reflected: boolean) => (
    <div className="flex flex-col items-center gap-0.5" aria-hidden={reflected || undefined}>
      <span
        className="max-w-[7rem] truncate whitespace-nowrap bg-[var(--map-tag)] px-1 text-[0.5625rem] font-bold leading-[1.35] text-[var(--map-tag-ink)]"
        style={{ scale: Math.max(0.75, scale), transformOrigin: "bottom center" }}
      >
        {person?.name ?? id}
        {value != null ? <span className="ml-1 tabular-nums opacity-70">{shownGrade(valueGrade(value))}</span> : null}
      </span>
      <span className="block overflow-hidden border-2 bg-surface-raised" style={{ width: w, height: w * 1.25, borderColor: color }}>
        {pick ? (
          <span className="flex h-full w-full items-center justify-center font-bold text-ink-secondary" style={{ fontSize: Math.max(7, w * 0.3) }}>
            PK
          </span>
        ) : (
          <span className="flex h-full w-full items-end justify-center">
            <PlayerHeadshot playerId={id} size={Math.round(w)} />
          </span>
        )}
      </span>
    </div>
  );
  return (
    <>
      {/* Standing on the floor: its foot at its dot, everything above it. */}
      <div className="absolute bottom-0 left-0 -translate-x-1/2">
        <Rising>{card(false)}</Rising>
      </div>
      {/* Its reflection: the same turned over about its foot, fading away from it. */}
      <div className="absolute bottom-0 left-0" style={{ transform: "translateX(-50%) scaleY(-1)", transformOrigin: "bottom center" }}>
        <div style={{ maskImage: REFLECTION_FADE, WebkitMaskImage: REFLECTION_FADE }}>
          <Rising>{card(true)}</Rising>
        </div>
      </div>
    </>
  );
}

const dateLabel = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** How far a finger goes sideways across the floor before it's a swipe to the next trade, or the last (px). */
const SWIPE_PX = 40;

/**
 * A season's trades — one at a time — on a line across the front of the floor, nearest you, `depth` px back, as wide
 * as the screen: each a mark, spaced by when (as the timeline spaces them, see trackOffsets), the one shown filled in
 * and its date over it, the season named under the line's left end — each picked by a tap, and the next or the last
 * by a swipe across the floor.
 */
function FloorTimeline({
  timeline,
  depth,
  room,
}: {
  timeline: NonNullable<FloorMove["timeline"]>;
  depth: number;
  room: { width: number; height: number; share: number; bottom: number };
}) {
  const { width, height, share, bottom } = room;
  const { trades, picked, onPick, onStep, season } = timeline;
  const span = (width * 0.94) / floorScale(depth);
  const horizon = height * share;
  // A swipe across the floor: left for the next trade, right for the last.
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const last = trades.at(-1)?.offset ?? 0;
  const at = (offset: number) => floorPoint(last > 0 ? -span / 2 + (offset / last) * span : 0, depth, width, height, share);
  const [l, r] = [floorPoint(-span / 2, depth, width, height, share), floorPoint(span / 2, depth, width, height, share)];
  return (
    <>
      <div
        className="pointer-events-auto absolute inset-x-0 touch-none"
        style={{ top: horizon, height: Math.max(0, bottom - horizon) }}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          // Its end heard here wherever the finger's lifted, off the floor and all.
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const from = swipe.current;
          swipe.current = null;
          if (!from || from.id !== e.pointerId) return;
          const [dx, dy] = [e.clientX - from.x, e.clientY - from.y];
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
          onStep(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => (swipe.current = null)}
      />
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line x1={l[0]} y1={l[1]} x2={r[0]} y2={r[1]} stroke="var(--ink-primary)" strokeOpacity={0.3} strokeWidth={1} />
      </svg>
      {/* The season, under the line's left end. */}
      <span className="absolute text-[0.625rem] font-bold uppercase tracking-wide tabular-nums text-ink-muted" style={{ left: l[0], top: l[1] + 6 }}>
        {season} season
      </span>
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
          // Hung off the mark's side toward the middle near the ends, so it's never cut off by the screen's edge.
          className={`absolute -translate-y-full whitespace-nowrap bg-[var(--map-tag)] px-1 text-[0.5625rem] font-bold uppercase leading-[1.35] text-[var(--map-tag-ink)] ${
            at(trades[picked].offset)[0] > width * 0.8 ? "-translate-x-full" : at(trades[picked].offset)[0] < width * 0.2 ? "" : "-translate-x-1/2"
          }`}
          style={{ left: at(trades[picked].offset)[0], top: at(trades[picked].offset)[1] - 8 }}
        >
          {dateLabel(trades[picked].at)}
        </span>
      ) : null}
    </>
  );
}
