"use client";

import { createContext } from "react";
import { floorDepth, floorPoint, floorScale } from "@/lib/grid-room";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";

/** A team a player's been on, as his path round the league lays it out (see FloorPlayerPath). */
export interface PathStop {
  rosterId: number;
  /** When he got there (ms) — null for the team that first traded him away, whose start isn't known. */
  at: number | null;
  /** Traded there as a pick that became him: the pick ("2025 1st"). */
  asPick?: string | null;
}

/** A player's way round a league by trade, to lay out on the room's floor (see FloorPlayerPath). */
export interface PlayerPath {
  player: string;
  /** His Sleeper id, for his face where he is now — where it's known. */
  playerId?: string | null;
  /** Each team he's been on, in turn: the first the one that first traded him away. */
  stops: PathStop[];
  /** Every team in the league. */
  teams: { rosterId: number; name: string }[];
  /** Now (ms): how long he's been where he is runs to it. */
  now: number;
}

/**
 * Where trades searched for a player put his way round the league, for the room they're in to lay out on its floor
 * (see FloorPlayerPath) — none, where there's no floor for it.
 */
export const PlayerPathFloorContext = createContext<((path: PlayerPath | null) => void) | null>(null);

/** A team's dot (px, nearest you); his team's, and his face where he is now. */
const DOT_PX = 5;
const ON_PX = 11;
const FACE_PX = 30;
const DAY_MS = 86_400_000;

/**
 * How much room a stay of `days` takes across the floor, against the others: a little for any stay at all, and more
 * for each doubling of its length — so a stay of years shows longer than one of months without crowding out the rest.
 * One of unknown length (null), a little more than the least.
 */
function stayRoom(days: number | null): number {
  return days === null ? 2 : 1 + Math.log2(1 + Math.max(0, days) / 14);
}

const dateLabel = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const stayLabel = (days: number) =>
  days >= 365 ? `${(days / 365).toFixed(days >= 3650 ? 0 : 1)} yrs` : days >= 60 ? `${Math.round(days / 30.4)} mos` : `${Math.max(1, Math.round(days))} days`;

/**
 * A player's way round the league laid out on the room's floor: a column of every team in the league for each team
 * he's been on, left to right in turn — each team a dot, one behind the other — and a line through the team he was
 * on in each, from the one that first traded him away to where he is now (his face), and on from there to now. The
 * room between two columns is how long he was on the first of them (see stayRoom), so his longest stays read
 * longest; the date he got to each under its column, at the front. `room`: the screen it's on, its horizon `share`
 * of the way down, the floor's front edge at screen y `bottom`.
 */
export function FloorPlayerPath({ path, room }: { path: PlayerPath; room: { width: number; height: number; share: number; bottom: number } }) {
  const { width, height, share, bottom } = room;
  const { stops, now } = path;
  // The teams one behind the other — those he's been on in front, nearest you, in the order he went to them; the rest
  // behind them.
  const onPath = [...new Set(stops.map((s) => s.rosterId))];
  const teams = [...path.teams.filter((t) => !onPath.includes(t.rosterId)), ...onPath.flatMap((id) => path.teams.filter((t) => t.rosterId === id))];
  const rows = Math.max(1, teams.length);
  const rowOf = new Map(teams.map((t, i) => [t.rosterId, i]));
  const nameOf = (rosterId: number) => path.teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`;

  // The teams one behind the other, from a little in front of the horizon to most of the way to the front — the
  // dates in front of them, nearest you.
  const horizon = height * share;
  const floor = bottom - horizon;
  const back = floorDepth(horizon + floor * 0.12, height, share);
  const front = floorDepth(bottom - floor * 0.26, height, share);
  const rowDepth = (row: number) => (rows === 1 ? (back + front) / 2 : back + ((front - back) * row) / (rows - 1));
  const dateDepth = floorDepth(bottom - floor * 0.1, height, share);
  const span = (width * 0.8) / floorScale(front);

  // How long he was on each team: from getting there to being traded on (or to now, where he is) — the first's
  // unknown, given the least room.
  const days = stops.map((s, i) => {
    const end = stops[i + 1]?.at ?? now;
    return s.at === null ? null : (end - s.at) / DAY_MS;
  });
  // Each column across the floor, the room after it its stay there; the last's running on to now.
  const rooms = days.map(stayRoom);
  const total = rooms.reduce((a, b) => a + b, 0) || 1;
  const xOf: number[] = [];
  rooms.reduce((at, r, i) => ((xOf[i] = -span / 2 + (at / total) * span), at + r), 0);
  const nowX = span / 2;
  const point = (x: number, row: number) => floorPoint(x, rowDepth(row), width, height, share);
  const scaleAt = (row: number) => floorScale(rowDepth(row)) / floorScale(front);

  // His team in each column, and the line through them on to now.
  const his = stops.map((s, i) => {
    const row = rowOf.get(s.rosterId) ?? 0;
    const [x, y] = point(xOf[i], row);
    return { x, y, row, s: scaleAt(row) };
  });
  const last = his.at(-1);
  const end = last ? point(nowX, last.row) : null;
  const line = his.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const from = his[i - 1];
    // Straight on from the last for a little, then across to the next team, then straight on into it.
    const mid = (from.x + p.x) / 2;
    return `C${mid},${from.y} ${mid},${p.y} ${p.x},${p.y}`;
  });

  return (
    <div className="pointer-events-none fixed inset-0 animate-[fade-in_0.4s_ease-out]">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {/* Each column's teams, a dot each. */}
        {stops.map((_, i) =>
          teams.map((t, row) => {
            const [x, y] = point(xOf[i], row);
            return <circle key={`${i}-${t.rosterId}`} cx={x} cy={y} r={(DOT_PX / 2) * scaleAt(row)} fill="var(--ink-muted)" fillOpacity={0.55} />;
          })
        )}
        {his.length > 0 ? (
          <>
            <path d={line.join(" ")} fill="none" stroke="var(--ink-primary)" strokeWidth={2} strokeLinecap="round" />
            {end && last ? <line x1={last.x} y1={last.y} x2={end[0]} y2={end[1]} stroke="var(--ink-primary)" strokeWidth={2} strokeDasharray="4 4" strokeOpacity={0.6} /> : null}
            {his.slice(0, -1).map((p, i) => (
              <circle key={`on-${i}`} cx={p.x} cy={p.y} r={(ON_PX / 2) * p.s} fill="var(--page)" stroke="var(--ink-primary)" strokeWidth={2} />
            ))}
          </>
        ) : null}
        {end ? <circle cx={end[0]} cy={end[1]} r={3} fill="var(--ink-primary)" fillOpacity={0.6} /> : null}
      </svg>
      {/* Each team he was on, named over its dot; where he is now, his face. */}
      {his.map((p, i) => {
        const isLast = i === his.length - 1;
        return (
          <span
            key={`name-${i}`}
            className={`absolute max-w-[9rem] -translate-x-1/2 truncate whitespace-nowrap text-[0.625rem] font-extrabold uppercase tracking-wide ${
              isLast ? "bg-[var(--map-tag)] px-1 text-[var(--map-tag-ink)]" : "text-ink-primary"
            }`}
            style={{ left: p.x, top: p.y - (isLast ? FACE_PX / 2 + 16 : ON_PX / 2 + 15) * Math.max(0.7, p.s) }}
          >
            {nameOf(stops[i].rosterId)}
          </span>
        );
      })}
      {last ? (
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-ink-primary bg-page"
          style={{ left: last.x, top: last.y, width: FACE_PX * last.s, height: FACE_PX * last.s }}
          title={path.player}
        >
          {path.playerId ? <PlayerHeadshot playerId={path.playerId} size={Math.round(FACE_PX * last.s)} /> : null}
        </span>
      ) : null}
      {/* Under each column, at the front: when he got there (and as what pick), and how long he stayed. */}
      {stops.map((s, i) => {
        const [x, y] = floorPoint(xOf[i], dateDepth, width, height, share);
        const edge = x < width * 0.15 ? "" : x > width * 0.85 ? "-translate-x-full" : "-translate-x-1/2";
        return (
          <span key={`at-${i}`} className={`absolute flex flex-col whitespace-nowrap text-[0.625rem] font-bold uppercase leading-tight tracking-wide ${edge}`} style={{ left: x, top: y }}>
            <span className="tabular-nums text-ink-primary">{s.at === null ? "From" : dateLabel(s.at)}</span>
            <span className="text-ink-muted">
              {s.asPick ? `As ${s.asPick}` : null}
              {s.asPick && days[i] !== null ? " · " : null}
              {days[i] !== null ? stayLabel(days[i]!) : null}
            </span>
          </span>
        );
      })}
      {(() => {
        const [x, y] = floorPoint(nowX, dateDepth, width, height, share);
        return (
          <span className="absolute -translate-x-full whitespace-nowrap text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted" style={{ left: x, top: y }}>
            Now
          </span>
        );
      })()}
    </div>
  );
}
