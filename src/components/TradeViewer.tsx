"use client";

import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TimelineColumn } from "@/lib/roster-timeline";
import { PICK, TimelinePlayer } from "@/lib/league-trades";
import { AnalyzedTrade } from "@/lib/trades";
import { timelineSpots, TradeRoster, tradeRosters } from "@/lib/trade-viewer";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { POSITION_COLOR_VAR, POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { shownGrade, valueGrade } from "@/lib/player-values";

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
// Each player's row in a roster, and the room between two rosters.
const ROW_PX = 26;
const LANE_GAP_PX = 12;
// How long the rosters hold as they were before the trade plays out.
const HOLD_MS = 450;

/** The orders a roster can be put in, each a label and how to compare two of its players. */
type Order = (a: string, b: string) => number;
const SORTS: { id: string; label: string; order: (people: Map<string, TimelinePlayer>) => Order }[] = [
  {
    id: "position",
    label: "Position",
    order: (people) => (a, b) => {
      const at = (id: string) => {
        const p = people.get(id);
        const i = p?.position === PICK ? POSITION_ORDER.length + 1 : POSITION_ORDER.indexOf(p?.position ?? "");
        return i < 0 ? POSITION_ORDER.length : i;
      };
      return at(a) - at(b) || (people.get(b)?.value ?? 0) - (people.get(a)?.value ?? 0) || a.localeCompare(b, undefined, { numeric: true });
    },
  },
  {
    id: "value",
    label: "Value",
    order: (people) => (a, b) => (people.get(b)?.value ?? -1) - (people.get(a)?.value ?? -1) || a.localeCompare(b, undefined, { numeric: true }),
  },
  {
    id: "name",
    label: "Name",
    order: (people) => (a, b) => (people.get(a)?.name ?? a).localeCompare(people.get(b)?.name ?? b),
  },
];

const dateLabel = (at: number, year = true) =>
  new Date(at).toLocaleDateString("en-US", year ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });

/**
 * The league's trades, one at a time: along the top, a timeline a year wide — each year's trades spaced by the time
 * between them (by its log: trades days apart get room, long lulls don't take over), its first and last at the ends, swiped (or scrolled) sideways from year to year; under it, the
 * trading teams' rosters as they stood, the pieces that changed hands sliding from one to the other; and beside
 * them, the trade's card. Picking a trade on the timeline, or stepping with the arrows, moves them all.
 */
export function TradeViewer({
  timeline,
  people,
  teams,
  trades,
  renderTrade,
}: {
  timeline: TimelineColumn[];
  people: Map<string, TimelinePlayer>;
  teams: { rosterId: number; name: string }[];
  trades: AnalyzedTrade[];
  renderTrade: (trade: AnalyzedTrade) => ReactNode;
}) {
  // A column for each trade, oldest first — just after it, and the move it made.
  const columns = useMemo(() => timeline.filter((c) => c.kind === "trade" && c.move), [timeline]);
  const spots = useMemo(() => timelineSpots(columns.map((c) => c.at)), [columns]);
  const years = useMemo(() => [...new Set(spots.map((s) => s.year))], [spots]);
  const [picked, setPicked] = useState(columns.length - 1);
  const [sortId, setSortId] = useState(SORTS[0].id);
  // Bumped to play the picked trade over again.
  const [replays, setReplays] = useState(0);
  // The year on the timeline: the picked trade's, till another's swiped to.
  const [shownYear, setShownYear] = useState(() => spots[columns.length - 1]?.year);

  const column = columns[picked];
  const trade = column?.tradeId ? trades.find((t) => t.id === column.tradeId) : undefined;
  const teamName = (rosterId: number) => teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`;

  const yearAt = Math.max(0, years.indexOf(shownYear ?? years[years.length - 1]));
  const pick = (i: number) => {
    const next = Math.max(0, Math.min(columns.length - 1, i));
    setPicked(next);
    setShownYear(spots[next]?.year);
  };
  // The arrows, and the arrow keys while the viewer has focus, step through the trades.
  const step = (by: number) => pick(picked + by);
  const turnYear = (by: number) => setShownYear(years[Math.max(0, Math.min(years.length - 1, yearAt + by))]);
  // A swipe across the timeline, or a sideways scroll on it, turns to the next year or the last.
  const swipe = useRef<number | null>(null);
  const wheel = useRef({ sum: 0, at: 0 });

  if (!column) return null;
  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLSelectElement) return;
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
      }}
    >
      {/* The timeline: a year a page, swiped (or scrolled) sideways from one to the next. */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => step(-1)} disabled={picked === 0} aria-label="Earlier trade" className={STEP}>
          ‹
        </button>
        <div
          className="min-w-0 flex-1 touch-pan-y overflow-hidden"
          onPointerDown={(e) => (swipe.current = e.clientX)}
          onPointerUp={(e) => {
            const from = swipe.current;
            swipe.current = null;
            if (from != null && Math.abs(e.clientX - from) > 40) turnYear(e.clientX < from ? 1 : -1);
          }}
          onWheel={(e) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            const w = wheel.current;
            w.sum += e.deltaX;
            // One turn a flick: the rest of the same scroll ignored.
            if (Math.abs(w.sum) > 40 && e.timeStamp - w.at > 450) {
              turnYear(w.sum > 0 ? 1 : -1);
              w.at = e.timeStamp;
              w.sum = 0;
            }
          }}
        >
          <div className="flex transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${yearAt * 100}%)` }}>
            {years.map((y) => (
              <YearPage
                key={y}
                year={y}
                trades={columns.flatMap((c, i) => (spots[i].year === y ? [{ i, at: c.at, x: spots[i].x, rosters: tradeRosters(c).map((r) => r.rosterId) }] : []))}
                picked={picked}
                onPick={pick}
                teamName={teamName}
                onTurn={y === years[0] && y === years[years.length - 1] ? null : turnYear}
                hasEarlier={y !== years[0]}
                hasLater={y !== years[years.length - 1]}
              />
            ))}
          </div>
        </div>
        <button type="button" onClick={() => step(1)} disabled={picked === columns.length - 1} aria-label="Later trade" className={STEP}>
          ›
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 md:items-start">
        {/* The rosters, and the pieces moving between them. */}
        <div className="flex min-w-0 flex-col gap-2 border border-border p-2 sm:p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-secondary tabular-nums">
              {dateLabel(column.at)} · {picked + 1} of {columns.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReplays((n) => n + 1)}
                className="border border-border px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wide text-ink-secondary hover:border-ink-primary hover:text-ink-primary"
              >
                Replay
              </button>
              <label className="flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">
                Sort
                <select
                  value={sortId}
                  onChange={(e) => setSortId(e.target.value)}
                  className="border border-ink-primary bg-page px-1 py-px font-bold uppercase text-ink-primary"
                >
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <TradeMove
            // A fresh play each trade (and each replay): the rosters as they were, then the trade.
            key={`${column.tradeId}-${replays}`}
            rosters={tradeRosters(column)}
            moved={new Set(column.move!.adds.map(([id]) => id))}
            people={people}
            order={(SORTS.find((s) => s.id === sortId) ?? SORTS[0]).order(people)}
            teamName={teamName}
          />
        </div>
        {/* Its card. */}
        <div className="min-w-0">{trade ? <ol>{renderTrade(trade)}</ol> : null}</div>
      </div>
    </div>
  );
}

const STEP =
  "flex h-8 w-8 shrink-0 items-center justify-center border border-border text-lg font-bold text-ink-secondary transition-colors hover:border-ink-primary hover:text-ink-primary active:scale-90 disabled:opacity-30 disabled:hover:border-border disabled:hover:text-ink-secondary";

/**
 * One year's trades along a line the page's width, its first at the left end and its last at the right, each at
 * its place in time between; the picked one lit, with its date and teams over it.
 */
function YearPage({
  year,
  trades,
  picked,
  onPick,
  teamName,
  onTurn,
  hasEarlier,
  hasLater,
}: {
  year: number;
  trades: { i: number; at: number; x: number; rosters: number[] }[];
  picked: number;
  onPick: (i: number) => void;
  teamName: (rosterId: number) => string;
  /** Turns the timeline to the year before (-1) or after (1) — null with only one year. */
  onTurn: ((by: number) => void) | null;
  hasEarlier: boolean;
  hasLater: boolean;
}) {
  const lit = trades.find((t) => t.i === picked);
  // Kept off the ends a little, so the end dots and the lit one's label fit.
  const left = (x: number) => `calc(1.25rem + ${x} * (100% - 2.5rem))`;
  return (
    <div data-year={year} className="relative h-[5.25rem] w-full shrink-0 snap-start">
      {/* The year, between buttons to the years either side. */}
      <span className="absolute left-5 top-0 flex items-center gap-1 text-xs font-extrabold tabular-nums text-ink-primary">
        {onTurn ? (
          <button type="button" onClick={() => onTurn(-1)} disabled={!hasEarlier} aria-label="Year before" className="px-1 text-ink-muted hover:text-ink-primary disabled:opacity-30">
            «
          </button>
        ) : null}
        {year}
        {onTurn ? (
          <button type="button" onClick={() => onTurn(1)} disabled={!hasLater} aria-label="Year after" className="px-1 text-ink-muted hover:text-ink-primary disabled:opacity-30">
            »
          </button>
        ) : null}
      </span>
      <span className="absolute right-5 top-0 text-[0.625rem] font-semibold uppercase text-ink-muted">
        {trades.length} trade{trades.length === 1 ? "" : "s"}
      </span>
      <span className="absolute inset-x-5 top-[3.25rem] h-px bg-border" />
      {/* The first and last trades' dates, under the ends. */}
      {trades.length > 1 ? (
        <>
          <span className="absolute left-5 top-[3.875rem] text-[0.625rem] tabular-nums text-ink-muted">{dateLabel(trades[0].at, false)}</span>
          <span className="absolute right-5 top-[3.875rem] text-[0.625rem] tabular-nums text-ink-muted">{dateLabel(trades[trades.length - 1].at, false)}</span>
        </>
      ) : null}
      {trades.map((t) => {
        const on = t.i === picked;
        return (
          <button
            key={t.i}
            type="button"
            onClick={() => onPick(t.i)}
            aria-label={`${dateLabel(t.at)}: ${t.rosters.map(teamName).join(" and ")}`}
            aria-current={on || undefined}
            title={`${dateLabel(t.at)} · ${t.rosters.map(teamName).join(" ⇄ ")}`}
            className="absolute top-[3.25rem] flex h-7 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: left(t.x) }}
          >
            <span className={`block border-2 border-ink-primary transition-transform ${on ? "h-3.5 w-3.5 bg-ink-primary" : "h-2.5 w-2.5 bg-surface-raised hover:scale-125"}`} />
          </button>
        );
      })}
      {/* The lit trade, over its dot: when, and who. Kept inside the page at either end. */}
      {lit ? (
        <span
          className="pointer-events-none absolute top-[1.125rem] max-w-[min(18rem,70%)] truncate bg-[var(--map-tag)] px-1.5 py-px text-[0.6875rem] font-bold uppercase text-[var(--map-tag-ink)]"
          style={{
            left: left(lit.x),
            transform: `translateX(${lit.x < 0.2 ? "-0.625rem" : lit.x > 0.8 ? "calc(-100% + 0.625rem)" : "-50%"})`,
          }}
        >
          {dateLabel(lit.at, false)} · {lit.rosters.map(teamName).join(" ⇄ ")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The trading teams' rosters side by side, each player a row — first as they stood before the trade, the pieces
 * about to go outlined; then the trade plays: those pieces slide across to their new roster, a dashed gap left
 * where each stood and a line from it to where it landed, everyone else closing ranks.
 */
function TradeMove({
  rosters,
  moved,
  people,
  order,
  teamName,
}: {
  rosters: TradeRoster[];
  moved: Set<string>;
  people: Map<string, TimelinePlayer>;
  order: Order;
  teamName: (rosterId: number) => string;
}) {
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), HOLD_MS);
    return () => clearTimeout(timer);
  }, []);
  // The lanes' width, for the lines between them.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = rosters.length;
  const before = rosters.map((r) => [...r.before].sort(order));
  const after = rosters.map((r) => [...r.after].sort(order));
  const rows = Math.max(1, ...before.map((l) => l.length), ...after.map((l) => l.length));
  // Where everyone is: before the trade, or after it.
  const spot = new Map<string, { lane: number; row: number }>();
  (played ? after : before).forEach((list, lane) => list.forEach((id, row) => spot.set(id, { lane, row })));
  const laneWidth = (width - (n - 1) * LANE_GAP_PX) / n;
  const laneX = (lane: number) => lane * (laneWidth + LANE_GAP_PX);
  const ids = [...new Set([...before.flat(), ...after.flat()])];

  return (
    <div className="flex flex-col gap-1">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {rosters.map((r) => (
          <span key={r.rosterId} className="truncate border-b border-ink-primary pb-0.5 text-xs font-extrabold uppercase tracking-wide text-ink-primary">
            {teamName(r.rosterId)}
          </span>
        ))}
      </div>
      <div ref={box} className="relative" style={{ height: rows * ROW_PX }}>
        {/* Where each piece that went stood, and the line to where it landed. */}
        {played && width > 0 ? (
          <>
            {before.map((list, lane) =>
              list.map((id, row) =>
                moved.has(id) ? (
                  <span
                    key={`gap-${id}`}
                    className="absolute border border-dashed border-ink-muted"
                    style={{ left: laneX(lane), top: row * ROW_PX + 1, width: laneWidth, height: ROW_PX - 2 }}
                  />
                ) : null
              )
            )}
            <svg className="pointer-events-none absolute inset-0 z-10 overflow-visible" width={width} height={rows * ROW_PX} aria-hidden>
              {before.map((list, lane) =>
                list.map((id, row) => {
                  const to = spot.get(id);
                  if (!moved.has(id) || !to) return null;
                  const color = people.get(id)?.position === PICK ? "var(--ink-muted)" : (POSITION_COLOR_VAR[people.get(id)?.position ?? ""] ?? "var(--ink-muted)");
                  // From the side of the gap facing its new roster, to the side of its new spot facing the old one.
                  const rightward = to.lane > lane;
                  const x1 = laneX(lane) + (rightward ? laneWidth : 0);
                  const x2 = laneX(to.lane) + (rightward ? 0 : laneWidth);
                  const [y1, y2] = [row * ROW_PX + ROW_PX / 2, to.row * ROW_PX + ROW_PX / 2];
                  const mid = (x1 + x2) / 2;
                  return (
                    <g key={`line-${id}`} className="animate-[fade-in_0.6s_ease-out_0.5s_backwards]">
                      <path d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={1.5} />
                      <circle cx={x2} cy={y2} r={2.5} fill={color} />
                    </g>
                  );
                })
              )}
            </svg>
          </>
        ) : null}
        {ids.map((id) => {
          const at = spot.get(id);
          if (!at) return null;
          return (
            <Piece
              key={id}
              id={id}
              person={people.get(id)}
              going={moved.has(id)}
              style={{
                width: `calc((100% - ${(n - 1) * LANE_GAP_PX}px) / ${n})`,
                transform: `translate(calc(${at.lane} * (100% + ${LANE_GAP_PX}px)), ${at.row * ROW_PX}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** One player or pick in a roster: photo (or a ring for a pick), position, name and KTC value now. */
function Piece({ id, person, going, style }: { id: string; person: TimelinePlayer | undefined; going: boolean; style: CSSProperties }) {
  const pick = person?.position === PICK;
  return (
    <div
      className={`absolute left-0 top-0 flex items-center gap-1.5 px-1 transition-transform duration-700 ease-[cubic-bezier(.6,.05,.25,1)] motion-reduce:transition-none ${
        going ? "z-20 border border-ink-primary bg-surface-raised shadow-md" : ""
      }`}
      style={{ ...style, height: ROW_PX - 2, marginTop: 1 }}
      title={person?.name ?? id}
    >
      {pick ? (
        <span className="h-[1.125rem] w-[1.125rem] shrink-0 rounded-full border-2 border-ink-muted" aria-hidden />
      ) : (
        <PlayerHeadshot playerId={id} size={18} />
      )}
      {person?.position && !pick ? (
        <span className={`w-[1.5rem] shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[person.position] ?? "text-ink-muted"}`}>{person.position}</span>
      ) : null}
      <span className={`min-w-0 flex-1 truncate text-xs ${going ? "font-extrabold text-ink-primary" : "text-ink-secondary"}`}>{person?.name ?? id}</span>
      <span className="shrink-0 text-[0.6875rem] tabular-nums text-ink-muted">{person?.value != null ? shownGrade(valueGrade(person.value)) : ""}</span>
    </div>
  );
}
