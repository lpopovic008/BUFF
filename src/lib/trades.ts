// A league's trades, all time, weighed in KeepTradeCut dynasty value: what
// each side got, what it was worth when the trade was made and what it's
// worth now, and each side's haul week by week since — for the values page's
// trade analyzer. Pure: the fetching lives in hooks/useLeagueTrades.ts.

import { SleeperTransaction } from "./sleeper";
import { dayOf, gridDay, ValueHistory, ValueSeries, valueOn } from "./value-history";

/** One season's trades, with each team's name that season. */
export interface TradeSeason {
  season: string;
  teamNames: Map<number, string>;
  /** Your roster that season, if you were in the league. */
  myRosterId: number | null;
  trades: SleeperTransaction[];
}

/** One of a season's drafts: when it was, and the player each team's pick in each round became. */
export interface DraftResult {
  /** When it started (ms). */
  at: number;
  /** By `${round}-${original roster id}`. */
  players: Map<string, string>;
}

export interface TradeAsset {
  /** The player's name, or the pick's: "2027 1st". */
  label: string;
  position: string | null;
  /** A pick's original team, when it isn't the team trading it away. */
  pickOf?: string;
  /**
   * Who a pick became, once it's been drafted: their value when drafted (their first from the draft on) and
   * now — null where KTC doesn't list them.
   */
  became?: { name: string; position: string | null; drafted: number | null; now: number | null };
  /** A drafted pick's own value at its draft — what it was worth when it was used. */
  atDraft?: number | null;
  /** `atDraft` read off its round's trend. */
  atDraftEstimated?: boolean;
  /** Value when the trade was made — null with nothing to go by. */
  then: number | null;
  /**
   * `then` estimated: a pick KTC had no value for on the day, read off its round's trend (see pickTrends) — or,
   * with none, what it became, the drafted player's first value.
   */
  thenEstimated: boolean;
  now: number | null;
  /** `now` read off its round's trend — a pick KTC doesn't list. */
  nowEstimated: boolean;
}

/** A round's pick value against time: `a + b × years before the draft`. */
export interface PickTrend {
  a: number;
  b: number;
}

const YEAR_DAYS = 365.25;

/** The day a season's rookie draft is taken to be when it isn't known: May 1. */
function assumedDraftDay(season: string): number {
  return dayOf(Date.UTC(Number(season), 4, 1));
}

/**
 * Each round's trend — picks gain value steadily as their draft comes closer — fitted (least squares) through
 * every value KTC has given that round's mid pick, any season, against how long before the draft it was.
 */
export function pickTrends(history: ValueHistory, superflex: boolean): Map<number, PickTrend> {
  const points = new Map<number, [number, number][]>();
  for (const s of Object.values(history.players)) {
    const m = /^(\d{4}) Mid (\d+)/.exec(s.n);
    if (s.p !== "RDP" || !m) continue;
    const round = Number(m[2]);
    const draft = assumedDraftDay(m[1]);
    (superflex ? s.sf : s.q).forEach((v, i) => {
      const before = (draft - gridDay(history, i)) / YEAR_DAYS;
      if (v != null && before >= 0) points.set(round, [...(points.get(round) ?? []), [before, v]]);
    });
  }
  const out = new Map<number, PickTrend>();
  for (const [round, xy] of points) {
    if (xy.length < 2) continue;
    const n = xy.length;
    const mx = xy.reduce((t, [x]) => t + x, 0) / n;
    const my = xy.reduce((t, [, y]) => t + y, 0) / n;
    const sxx = xy.reduce((t, [x]) => t + (x - mx) ** 2, 0);
    const b = sxx > 0 ? xy.reduce((t, [x, y]) => t + (x - mx) * (y - my), 0) / sxx : 0;
    out.set(round, { a: my - b * mx, b });
  }
  return out;
}

export interface TradeSide {
  rosterId: number;
  team: string;
  /** Your team. */
  mine: boolean;
  got: TradeAsset[];
  /** FAAB dollars received. */
  faab: number;
  then: number;
  now: number;
  /** The haul's value at each week since the trade, its last point now. */
  path: { day: number; value: number }[];
}

export interface AnalyzedTrade {
  id: string;
  /** When it went through (ms). */
  at: number;
  season: string;
  sides: TradeSide[];
}

/** Sleeper's details for a player id: name and position. */
export type PlayerInfo = Map<string, { name: string; position: string | null }>;

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * Every trade, newest first, weighed in superflex or 1QB values. `bySleeperId` is each player's KTC series by
 * Sleeper id; picks are KTC's "{season} Mid {round}" until drafted — its draft order isn't known when most are
 * traded — then whoever they became.
 */
export function analyzeTrades(
  seasons: TradeSeason[],
  /** Each season's drafts, newest first: a pick's is the newest that has it (a startup and a rookie draft can share a season; an empty one can sit beside the real one). */
  drafts: Map<string, DraftResult[]>,
  history: ValueHistory,
  bySleeperId: Map<string, ValueSeries>,
  players: PlayerInfo,
  superflex: boolean,
  now = Date.now()
): AnalyzedTrade[] {
  const today = dayOf(now);
  const trends = pickTrends(history, superflex);
  const pickSeries = new Map<string, ValueSeries>();
  for (const s of Object.values(history.players)) if (s.p === "RDP") pickSeries.set(s.n, s);
  const on = (series: ValueSeries | undefined, day: number) => (series ? valueOn(history, series, superflex, day) : null);
  // A series' first value, for a pick weighed at what it became.
  const first = (series: ValueSeries | undefined) => (series ? ((superflex ? series.sf : series.q).find((v) => v != null) ?? null) : null);
  // A series' first value on or after a day — a drafted player's value as a rookie.
  const firstFrom = (series: ValueSeries | undefined, day: number) => {
    if (!series) return null;
    const values = superflex ? series.sf : series.q;
    for (let i = Math.max(0, Math.ceil((day - history.from) / history.step)); i < values.length; i++) if (values[i] != null) return values[i];
    return null;
  };

  const out: AnalyzedTrade[] = [];
  for (const { season, teamNames, myRosterId, trades } of seasons) {
    for (const t of trades) {
      if (t.type !== "trade" || t.status !== "complete") continue;
      const day = dayOf(t.created);
      // Each asset: how it's shown, and its value on a day.
      const assets = new Map<number, { asset: TradeAsset; on: (d: number) => number | null }[]>();
      const add = (rosterId: number, asset: TradeAsset, valueOnDay: (d: number) => number | null) => {
        assets.set(rosterId, [...(assets.get(rosterId) ?? []), { asset, on: valueOnDay }]);
      };
      for (const [playerId, rosterId] of Object.entries(t.adds ?? {})) {
        const series = bySleeperId.get(playerId);
        const info = players.get(playerId);
        add(
          rosterId,
          { label: info?.name ?? series?.n ?? `Player ${playerId}`, position: info?.position ?? series?.p ?? null, then: on(series, day), thenEstimated: false, now: on(series, today), nowEstimated: false },
          (d) => on(series, d)
        );
      }
      for (const pick of t.draft_picks ?? []) {
        const series = pickSeries.get(`${pick.season} Mid ${ordinal(pick.round)}`);
        const key = `${pick.round}-${pick.roster_id}`;
        const seasonDrafts = drafts.get(pick.season) ?? [];
        const draft = seasonDrafts.find((d) => d.players.has(key)) ?? seasonDrafts[0];
        const drafted = draft?.players.get(key);
        const player = drafted ? bySleeperId.get(drafted) : undefined;
        const draftDay = draft ? dayOf(draft.at) : assumedDraftDay(pick.season);
        // Before its draft and with no value from KTC that day: its round's trend, that long before the draft.
        const trend = trends.get(pick.round);
        const estimate = (d: number) => (trend && d < draftDay ? Math.max(0, Math.round(trend.a + (trend.b * (draftDay - d)) / YEAR_DAYS)) : null);
        // A pick until its draft, then whoever it became.
        const known = (d: number) => (d >= draftDay ? (drafted ? on(player, d) : null) : on(series, d));
        const pickOn = (d: number) => known(d) ?? estimate(d);
        const thenValue = pickOn(day);
        // No trend for its round: what it became, held until it has a value of its own.
        const standIn = thenValue === null && player ? first(player) : null;
        const valueOnDay = (d: number) => pickOn(d) ?? (d < draftDay ? standIn : null);
        const info = drafted ? players.get(drafted) : undefined;
        add(
          pick.owner_id,
          {
            label: `${pick.season} ${ordinal(pick.round)}`,
            position: "PICK",
            pickOf: pick.roster_id !== pick.previous_owner_id ? teamNames.get(pick.roster_id) : undefined,
            became: drafted
              ? {
                  name: info?.name ?? player?.n ?? `Player ${drafted}`,
                  position: info?.position ?? player?.p ?? null,
                  drafted: firstFrom(player, draftDay),
                  now: on(player, today),
                }
              : undefined,
            atDraft: drafted ? pickOn(draftDay - 1) : undefined,
            atDraftEstimated: drafted ? known(draftDay - 1) === null : undefined,
            then: thenValue ?? standIn,
            thenEstimated: known(day) === null && (thenValue ?? standIn) !== null,
            now: pickOn(today),
            nowEstimated: known(today) === null && pickOn(today) !== null,
          },
          valueOnDay
        );
      }
      const faab = new Map<number, number>();
      for (const w of t.waiver_budget ?? []) faab.set(w.receiver, (faab.get(w.receiver) ?? 0) + w.amount);

      // Each week from the trade to now, the last point today.
      const days: number[] = [];
      for (let i = Math.max(0, Math.ceil((day - history.from) / history.step)); gridDay(history, i) < today; i++) days.push(gridDay(history, i));
      days.push(today);

      const sides: TradeSide[] = t.roster_ids.map((rosterId) => {
        const got = assets.get(rosterId) ?? [];
        const sum = (pick: (a: (typeof got)[number]) => number | null) => got.reduce((total, a) => total + (pick(a) ?? 0), 0);
        return {
          rosterId,
          team: teamNames.get(rosterId) ?? `Team ${rosterId}`,
          mine: rosterId === myRosterId,
          got: got.map((a) => a.asset).sort((a, b) => (b.now ?? 0) - (a.now ?? 0)),
          faab: faab.get(rosterId) ?? 0,
          then: sum((a) => a.asset.then),
          now: sum((a) => a.asset.now),
          path: days.map((d) => ({ day: d, value: sum((a) => a.on(d)) })),
        };
      });
      out.push({ id: t.transaction_id, at: t.created, season, sides });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}
