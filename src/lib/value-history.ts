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

/** Values for picks KTC no longer lists, read by hand: by pick name ("2026 Mid 1st"), a value by date ("2026-02-01"). */
export type ArchivedPickValues = Record<string, Record<string, number>>;

/**
 * The history with picks it hasn't got added from values read by hand (src/data/archived-pick-values.json, superflex
 * only): a series for each, the value at each grid point drawn straight between the two dates around it — from the
 * first date to the pick's draft (May 1 of its year, or the last date if later), nothing either side.
 */
export function withArchivedPicks(history: ValueHistory, superflex: ArchivedPickValues): ValueHistory {
  const have = new Set(Object.values(history.players).map((s) => s.n));
  const length = Math.max(0, ...Object.values(history.players).map((s) => s.sf.length));
  const players = { ...history.players };
  for (const [name, byDate] of Object.entries(superflex)) {
    if (have.has(name)) continue;
    const points = Object.entries(byDate)
      .map(([date, value]): [number, number] => [dayOf(Date.parse(`${date}T00:00:00Z`)), value])
      .sort((a, b) => a[0] - b[0]);
    if (points.length === 0) continue;
    const end = Math.max(dayOf(Date.UTC(Number(name.slice(0, 4)), 4, 1)), points[points.length - 1][0]);
    const at = (day: number): number | null => {
      if (day < points[0][0] || day > end) return null;
      const next = points.findIndex(([d]) => d >= day);
      if (next === -1) return points[points.length - 1][1];
      if (points[next][0] === day || next === 0) return points[next][1];
      const [[d0, v0], [d1, v1]] = [points[next - 1], points[next]];
      return Math.round(v0 + ((v1 - v0) * (day - d0)) / (d1 - d0));
    };
    const sf = Array.from({ length }, (_, i) => at(gridDay(history, i)));
    players[`archived:${name}`] = { n: name, p: "RDP", t: null, sf, q: sf.map(() => null) };
  }
  return { ...history, players };
}
