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
  /** What it got, added up, when traded and now — before any added value. */
  then: number;
  now: number;
  /** The value it was due on top of its plain total when traded (see addedValues), held from then on — 0 for the other side. */
  added: number;
  /** The haul's value, added value and all, at each week since the trade, its last point now. */
  path: { day: number; value: number }[];
}

/*
 * How a trade's two sides compare — KeepTradeCut's trade calculator's "Value Adjustment", as its code works it
 * out: each piece counts for processed(v) = v × (0.1·(v ÷ 10,099)^1.4 + 0.7·(v ÷ (1.05 × top))^1.25 + 0.2),
 * where top is the trade's best piece, so the best pieces count for far more than the rest. The side whose
 * processed pieces add up to more is ahead by the value of a player whose processed value is the difference
 * (evenValue), and the added value goes to whichever side needs it for the plain totals to say the same.
 */
const KTC_TOP = 10099;

/** A piece's value as KTC weighs it in a trade whose best piece is `top`. */
export function processedValue(v: number, top: number): number {
  return (0.1 * Math.pow(v / KTC_TOP, 1.4) + 0.7 * Math.pow(v / (1.05 * top), 1.25) + 0.2) * v;
}

/** The value of a player whose processed value is `diff` — what one side is ahead by (KTC's solveForX, by Newton). */
export function evenValue(diff: number, top: number): number {
  let x = 5 * diff;
  for (let i = 0; i < 20; i++) {
    const slope = (0.24 * Math.pow(x, 1.4)) / Math.pow(KTC_TOP, 1.4) + (1.575 * Math.pow(x, 1.25)) / (Math.pow(1.05, 1.25) * Math.pow(top, 1.25)) + 0.2;
    const next = x - (processedValue(x, top) - diff) / slope;
    if (Math.abs(next - x) < 1e-8) return Math.round(next);
    x = next;
  }
  return Math.round(x);
}

/**
 * The value each side is due on top of its plain total, as KTC's trade calculator gives it — one side's, the
 * other's 0. None for one piece for one, or when it's under 3.3% of the two totals together (KTC doesn't show it).
 */
export function addedValues(a: number[], b: number[]): [number, number] {
  const top = Math.max(0, ...a, ...b);
  if (a.length + b.length <= 2 || top <= 0) return [0, 0];
  const sum = (vs: number[], f: (v: number) => number) => vs.reduce((t, v) => t + f(v), 0);
  const [ra, rb] = [sum(a, (v) => processedValue(v, top)), sum(b, (v) => processedValue(v, top))];
  const [ta, tb] = [sum(a, (v) => v), sum(b, (v) => v)];
  // The side ahead by processed value is ahead by `even` once added value's in: lead is what it needs on top.
  const even = evenValue(Math.abs(ra - rb), top);
  const lead = ra >= rb ? even - (ta - tb) : -(even - (tb - ta));
  if (!Number.isFinite(lead) || Math.abs(lead) < 0.033 * (ta + tb)) return [0, 0];
  return lead > 0 ? [lead, 0] : [0, -lead];
}

export interface AnalyzedTrade {
  id: string;
  /** When it went through (ms). */
  at: number;
  season: string;
  sides: TradeSide[];
  /** How far apart the sides are now (see tradeGap). */
  gap: TradeGap;
  /** The farthest apart they've been, any week since the trade or now, and on what day. */
  widest: TradeGap & { day: number };
}

/** How far apart a trade's sides are: the best haul less the worst, added value and all, and whose is the best. */
export interface TradeGap {
  gap: number;
  /** The roster ahead — null when they're level. */
  ahead: number | null;
}

/** The gap between a trade's sides at their paths' `i`th point (see TradeSide.path). */
export function tradeGap(sides: TradeSide[], i: number): TradeGap {
  const values = sides.map((s) => s.path[i]?.value ?? 0);
  const top = Math.max(...values);
  const gap = top - Math.min(...values);
  return { gap, ahead: gap > 0 ? sides[values.indexOf(top)].rosterId : null };
}

/** A trade's gap now (its paths' last point) and its widest, earliest first on a tie. */
export function tradeGaps(sides: TradeSide[]): { gap: TradeGap; widest: TradeGap & { day: number } } {
  const points = sides[0]?.path.length ?? 0;
  let widest = { gap: 0, ahead: null as number | null, day: sides[0]?.path[0]?.day ?? 0 };
  for (let i = 0; i < points; i++) {
    const g = tradeGap(sides, i);
    if (g.gap > widest.gap) widest = { ...g, day: sides[0].path[i].day };
  }
  return { gap: tradeGap(sides, points - 1), widest };
}

/** The ways the trade analyzer's trades can be ordered. */
export const TRADE_SORTS = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "gap", label: "Biggest gap now" },
  { id: "widest", label: "Biggest gap ever" },
  { id: "closest", label: "Closest now" },
  { id: "size", label: "Biggest trade" },
  { id: "pieces", label: "Most pieces" },
] as const;
export type TradeSort = (typeof TRADE_SORTS)[number]["id"];

/** The team filter's choice for your own trades. */
export const MY_TRADES = "\u0000mine";

export interface TradeFilter {
  /** Words that must each turn up somewhere in the trade: a player, a pick ("2026 1st"), who a pick became, a team. */
  query: string;
  /** A season, or null for all. */
  season: string | null;
  /** A team's name, MY_TRADES for yours, or null for every team's. */
  team: string | null;
  sort: TradeSort;
}

/** Lower case, accents and punctuation gone, so "Ja'Marr" finds "jamarr". */
function plain(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
}

/** The trades that match a filter, in its order. */
export function filterTrades(trades: AnalyzedTrade[], filter: TradeFilter): AnalyzedTrade[] {
  const words = plain(filter.query).split(" ").filter(Boolean);
  const haystack = (t: AnalyzedTrade) =>
    plain(t.sides.flatMap((s) => [s.team, ...s.got.flatMap((a) => [a.label, a.pickOf ?? "", a.became?.name ?? ""])]).join(" "));
  const size = (t: AnalyzedTrade) => t.sides.reduce((total, s) => total + s.then + s.added, 0);
  const pieces = (t: AnalyzedTrade) => t.sides.reduce((total, s) => total + s.got.length, 0);
  const key: Record<TradeSort, (t: AnalyzedTrade) => number> = {
    newest: (t) => t.at,
    oldest: (t) => -t.at,
    gap: (t) => t.gap.gap,
    widest: (t) => t.widest.gap,
    closest: (t) => -t.gap.gap,
    size,
    pieces,
  };
  return trades
    .filter((t) => filter.season === null || t.season === filter.season)
    .filter((t) => filter.team === null || t.sides.some((s) => (filter.team === MY_TRADES ? s.mine : s.team === filter.team)))
    .filter((t) => {
      if (words.length === 0) return true;
      const text = haystack(t);
      return words.every((w) => text.includes(w));
    })
    // Best first; newest first among equals.
    .sort((a, b) => key[filter.sort](b) - key[filter.sort](a) || b.at - a.at);
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

      // Each side's pieces' values.
      const piecesOf = (rosterId: number, value: (a: { asset: TradeAsset; on: (d: number) => number | null }) => number | null) =>
        (assets.get(rosterId) ?? []).map((a) => value(a) ?? 0);
      // A two-team trade's added value for one side as it was traded (see addedValues), held from then on so the
      // trade's lopsidedness since shows; none in a trade among three or more.
      const added = (rosterId: number) => {
        if (t.roster_ids.length !== 2) return 0;
        const other = t.roster_ids.find((r) => r !== rosterId)!;
        return addedValues(piecesOf(rosterId, (a) => a.asset.then), piecesOf(other, (a) => a.asset.then))[0];
      };
      const sides: TradeSide[] = t.roster_ids.map((rosterId) => {
        const got = assets.get(rosterId) ?? [];
        const extra = added(rosterId);
        const sum = (pick: (a: (typeof got)[number]) => number | null) => got.reduce((total, a) => total + (pick(a) ?? 0), 0);
        return {
          rosterId,
          team: teamNames.get(rosterId) ?? `Team ${rosterId}`,
          mine: rosterId === myRosterId,
          got: got.map((a) => a.asset).sort((a, b) => (b.now ?? 0) - (a.now ?? 0)),
          faab: faab.get(rosterId) ?? 0,
          then: sum((a) => a.asset.then),
          now: sum((a) => a.asset.now),
          added: extra,
          path: days.map((d) => ({ day: d, value: sum((a) => a.on(d)) + extra })),
        };
      });
      out.push({ id: t.transaction_id, at: t.created, season, sides, ...tradeGaps(sides) });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}
