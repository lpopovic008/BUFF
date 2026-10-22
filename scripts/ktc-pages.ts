// Reading KTC's player pages, for scripts/fetch-value-history.ts.

import { dayOf } from "../src/lib/value-history";

/** "240831" — KTC's date — as days since 1970. */
export function ktcDay(d: string): number {
  return dayOf(Date.UTC(2000 + Number(d.slice(0, 2)), Number(d.slice(2, 4)) - 1, Number(d.slice(4, 6))));
}

/** A player page's value a day in one format, as [day, value], oldest first — from its `#pd-…` data block. */
export function pageHistory(page: string, id: "pd-superflex" | "pd-oneqb"): [number, number][] {
  const m = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`).exec(page);
  if (!m) return [];
  const data = JSON.parse(m[1]) as { overallValue?: { d: string; v: number }[] };
  return (data.overallValue ?? []).map((p): [number, number] => [ktcDay(p.d), p.v]).sort((a, b) => a[0] - b[0]);
}

/** A day-by-day history put on a grid of `count` points `step` days apart from `from`: at each point, the latest value at or before it — null before the first. */
export function onGrid(points: [number, number][], from: number, count: number, step: number): (number | null)[] {
  const out: (number | null)[] = [];
  let j = -1;
  for (let i = 0; i < count; i++) {
    const day = from + i * step;
    while (j + 1 < points.length && points[j + 1][0] <= day) j++;
    out.push(j >= 0 ? points[j][1] : null);
  }
  return out;
}
