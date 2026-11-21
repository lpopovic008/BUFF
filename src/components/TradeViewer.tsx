"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { TradeFloorContext } from "@/components/FloorTradeMove";
import { TimelineColumn } from "@/lib/roster-timeline";
import { TimelinePlayer } from "@/lib/league-trades";
import { AnalyzedTrade, TRADE_SIDE_COLORS } from "@/lib/trades";
import { trackOffsets, tradeRosters } from "@/lib/trade-viewer";

// The room between two trades on the floor's timeline: never less than a dot and a bit, more by the log of the days
// between (see trackOffsets).
const TRACK_GAP_PX = { min: 22, perDoubling: 8 };

/** Most valuable first, then by id: the order each roster's pieces are put in on the floor. */
const byValue = (people: Map<string, TimelinePlayer>) => (a: string, b: string) =>
  (people.get(b)?.value ?? -1) - (people.get(a)?.value ?? -1) || a.localeCompare(b, undefined, { numeric: true });

/**
 * The league's trades, one at a time, on the room's floor (see TradeFloorContext, FloorTradeMove): the trade shown
 * (`shownId`, picked elsewhere — the card read in its column — else the latest) played out between the trading teams'
 * rosters, and a season's trades on a line in front of them to pick from — each picked there told to `onShow`. Nothing
 * of it on the page itself.
 */
export function TradeViewer({
  timeline,
  people,
  teams,
  trades,
  shownId = null,
  onShow,
  valueAt,
  season = null,
}: {
  timeline: TimelineColumn[];
  people: Map<string, TimelinePlayer>;
  teams: { rosterId: number; name: string }[];
  trades: AnalyzedTrade[];
  /** The trade shown, picked from elsewhere (the cards scrolled through): told when one's picked on the floor. */
  shownId?: string | null;
  onShow?: (tradeId: string) => void;
  /** A player's or pick's value on a day — on the floor, each piece's as the trade was made. */
  valueAt?: (id: string, at: number) => number | null;
  /** The season the trades are filtered to: the floor's timeline shows it alone (else the shown trade's). */
  season?: string | null;
}) {
  // A column for each trade, oldest first — just after it, and the move it made.
  const columns = useMemo(() => timeline.filter((c) => c.kind === "trade" && c.move), [timeline]);
  const [ownPick, setOwnPick] = useState(columns.length - 1);
  // The trade shown from elsewhere, where it's on the timeline; else the one picked here.
  const shownAt = shownId != null ? columns.findIndex((c) => c.tradeId === shownId) : -1;
  const picked = shownAt >= 0 ? shownAt : ownPick;
  const column = columns[picked];
  const trade = column?.tradeId ? trades.find((t) => t.id === column.tradeId) : undefined;

  const pick = (i: number) => {
    const next = Math.max(0, Math.min(columns.length - 1, i));
    setOwnPick(next);
    const id = columns[next]?.tradeId;
    if (id) onShow?.(id);
  };

  // The floor's timeline: one season's trades — the one filtered to, else the shown trade's — spaced among themselves;
  // a swipe steps through them, on into the next season or the last where none's filtered to.
  const seasonOf = (c: TimelineColumn) => trades.find((t) => t.id === c.tradeId)?.season ?? String(new Date(c.at).getFullYear());
  const floorSeason = () => {
    const shown = season ?? (column ? seasonOf(column) : "");
    const inSeason = columns.flatMap((c, i) => (seasonOf(c) === shown ? [{ c, i }] : []));
    const spaced = trackOffsets(inSeason.map(({ c }) => c.at), TRACK_GAP_PX);
    const at = inSeason.findIndex(({ i }) => i === picked);
    return {
      season: shown,
      trades: inSeason.map(({ c }, k) => ({ at: c.at, offset: spaced[k] })),
      picked: at,
      onPick: (k: number) => pick(inSeason[k].i),
      onStep: (by: 1 | -1) => {
        if (season === null) return pick(picked + by);
        const next = at < 0 ? (by > 0 ? 0 : inSeason.length - 1) : at + by;
        if (next >= 0 && next < inSeason.length) pick(inSeason[next].i);
      },
    };
  };
  // On the room's floor: the trade shown, played afresh each trade.
  const toFloor = useContext(TradeFloorContext);
  const tradeKey = column?.tradeId ?? null;
  useEffect(() => {
    if (!toFloor || !column || !tradeKey) return;
    toFloor({
      key: tradeKey,
      rosters: tradeRosters(column),
      moved: new Set(column.move!.adds.map(([id]) => id)),
      people,
      order: byValue(people),
      teamName: (rosterId) => teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`,
      // Each piece's value as the trade was made; each team's color, as the trade's card has it.
      valueOf: (id) => (valueAt ? valueAt(id, column.at) : (people.get(id)?.value ?? null)),
      colors: new Map((trade?.sides ?? []).map((side, i) => [side.rosterId, TRADE_SIDE_COLORS[i % TRADE_SIDE_COLORS.length]])),
      timeline: floorSeason(),
    });
    // (The column's the trade's: its key says when it's another.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toFloor, tradeKey, people, teams, season]);
  useEffect(() => (toFloor ? () => toFloor(null) : undefined), [toFloor]);

  return null;
}
