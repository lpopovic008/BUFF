// KeepTradeCut's dynasty values over time — every player and future draft
// pick on KTC's dynasty rankings, a value a week in both formats — for the
// values page's trade analyzer: what each piece of a trade was worth when it
// was made, and since. Fetched server-side by scripts/fetch-value-history.ts
// (KTC's player pages carry each one's whole history) and published as a
// static file, loaded only when a league's trades are looked at.

export interface ValueSeries {
  /** KTC's name for it: "Ja'Marr Chase", "2027 Early 1st". */
  n: string;
  /** Position — RDP for a draft pick. */
  p: string;
  /** NFL team, as KTC writes it ("KCC"), null for a pick or free agent. */
  t: string | null;
  /** Superflex value at each point of the grid (see ValueHistory), null before KTC listed them. */
  sf: (number | null)[];
  /** 1QB value at each point. */
  q: (number | null)[];
}

export interface ValueHistory {
  updatedAt: string | null;
  /** The grid's first point, in days since 1970-01-01 (UTC). */
  from: number;
  /** Days between points. */
  step: number;
  /** By KTC's player id. */
  players: Record<string, ValueSeries>;
}

import { PlayerValuesSnapshot } from "./player-values";

export const DAY_MS = 86_400_000;

/** A time as whole days since 1970-01-01 (UTC). */
export function dayOf(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** A series' value on a day — the latest grid point at or before it — or null if KTC didn't list it yet. */
export function valueOn(history: ValueHistory, series: ValueSeries, superflex: boolean, day: number): number | null {
  const values = superflex ? series.sf : series.q;
  const i = Math.min(values.length - 1, Math.floor((day - history.from) / history.step));
  return i < 0 ? null : (values[i] ?? null);
}

/** The day of a grid point. */
export function gridDay(history: ValueHistory, i: number): number {
  return history.from + i * history.step;
}

/**
 * The history brought up to today with the values page's own current values (player-values.json, fetched more
 * often than the history's weekly points), so a trade's "now" reads what the values list does: every series
 * carried on to today's grid point, which takes the current value wherever the snapshot has it (matched by name
 * and position — both from KTC).
 */
export function withCurrentValues(history: ValueHistory, snapshot: PlayerValuesSnapshot, today: number): ValueHistory {
  const at = Math.floor((today - history.from) / history.step);
  if (at < 0) return history;
  const current = new Map(snapshot.dynasty.map((p) => [`${p.name}|${p.position}`, p.values]));
  const bring = (values: (number | null)[], value: number | undefined) => {
    const out = values.slice(0, at + 1);
    while (out.length <= at) out.push(out.length > 0 ? out[out.length - 1] : null);
    if (value) out[at] = value;
    return out;
  };
  const players: Record<string, ValueSeries> = {};
  for (const [id, series] of Object.entries(history.players)) {
    const now = current.get(`${series.n}|${series.p}`);
    players[id] = { ...series, sf: bring(series.sf, now?.superflexStandard), q: bring(series.q, now?.oneQBStandard) };
  }
  return { ...history, players };
}
