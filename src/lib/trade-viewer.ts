// The values page's trade viewer: where each trade sits on its year's timeline, and the rosters it changed, as they
// stood just before it and just after. Pure — the drawing is TradeViewer.tsx.

import { TimelineColumn } from "./roster-timeline";

/** A trade's place on the timeline: its year, and how far across that year's trades it falls (0 to 1). */
export interface TimelineSpot {
  year: number;
  x: number;
}

const DAY_MS = 86_400_000;
// The room between two trades, by the days between them: never less than GAP_MIN, and more the longer — but by the
// log of it, so trades days apart get room of their own and a long lull doesn't take the line over.
const GAP_MIN = 1.5;
const gapFor = (days: number) => GAP_MIN + Math.log2(1 + Math.max(0, days));

/**
 * Each trade's spot, in the order given: within its calendar year, spaced by the time between that year's trades
 * (see gapFor) — the year's first at 0 and its last at 1, a year's only trade in the middle.
 */
export function timelineSpots(ats: number[]): TimelineSpot[] {
  const yearOf = (at: number) => new Date(at).getFullYear();
  // Each year's trades in time order, and how far along its line each is.
  const byYear = new Map<number, number[]>();
  for (const at of ats) byYear.set(yearOf(at), [...(byYear.get(yearOf(at)) ?? []), at]);
  const along = new Map<number, Map<number, number>>();
  for (const [year, list] of byYear) {
    const sorted = [...new Set(list)].sort((a, b) => a - b);
    const cum = [0];
    for (let i = 1; i < sorted.length; i++) cum.push(cum[i - 1] + gapFor((sorted[i] - sorted[i - 1]) / DAY_MS));
    const total = cum[cum.length - 1];
    along.set(year, new Map(sorted.map((at, i) => [at, total > 0 ? cum[i] / total : 0.5])));
  }
  return ats.map((at) => ({ year: yearOf(at), x: along.get(yearOf(at))!.get(at)! }));
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

/**
 * How far along one continuous line, across every year, each trade sits (in time order, in pixels): the first at 0,
 * each after it `gap.min` on from the one before plus `gap.perDoubling` for every doubling of the days between —
 * so no two are ever closer than `gap.min`, trades days apart still get room, and a long lull doesn't run on.
 */
export function trackOffsets(ats: number[], gap: { min: number; perDoubling: number }): number[] {
  const out = [0];
  for (let i = 1; i < ats.length; i++) out.push(out[i - 1] + gap.min + gap.perDoubling * Math.log2(1 + Math.max(0, (ats[i] - ats[i - 1]) / DAY_MS)));
  return out;
}
