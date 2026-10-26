// The values page's trade viewer: where each trade sits on its year's timeline, and the rosters it changed, as they
// stood just before it and just after. Pure — the drawing is TradeViewer.tsx.

import { TimelineColumn } from "./roster-timeline";

/** A trade's place on the timeline: its year, and how far across that year's trades it falls (0 to 1). */
export interface TimelineSpot {
  year: number;
  x: number;
}

/**
 * Each trade's spot, in the order given: within its calendar year, spaced by the time between that year's trades —
 * the year's first at 0 and its last at 1, a year's only trade in the middle.
 */
export function timelineSpots(ats: number[]): TimelineSpot[] {
  const yearOf = (at: number) => new Date(at).getFullYear();
  const span = new Map<number, { first: number; last: number }>();
  for (const at of ats) {
    const y = yearOf(at);
    const s = span.get(y);
    span.set(y, s ? { first: Math.min(s.first, at), last: Math.max(s.last, at) } : { first: at, last: at });
  }
  return ats.map((at) => {
    const year = yearOf(at);
    const { first, last } = span.get(year)!;
    return { year, x: last === first ? 0.5 : (at - first) / (last - first) };
  });
}

/** One team in a trade: who it had just before and just after. */
export interface TradeRoster {
  rosterId: number;
  before: string[];
  after: string[];
}

/** The rosters a trade changed, in the order its move names them — undone from just after it to just before. */
export function tradeRosters(column: TimelineColumn): TradeRoster[] {
  const move = column.move;
  if (!move) return [];
  const ids = [...new Set([...move.adds, ...move.drops].map(([, rosterId]) => rosterId))];
  return ids.map((rosterId) => {
    const after = column.rosters.get(rosterId) ?? [];
    const added = new Set(move.adds.filter(([, r]) => r === rosterId).map(([id]) => id));
    const dropped = move.drops.filter(([, r]) => r === rosterId).map(([id]) => id);
    return { rosterId, before: [...after.filter((id) => !added.has(id)), ...dropped.filter((id) => !after.includes(id))], after };
  });
}
