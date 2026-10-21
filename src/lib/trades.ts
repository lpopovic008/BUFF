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

/** A season's rookie draft: when it was, and the player each team's pick in each round became. */
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
  /** Who a pick became, once it's been drafted. */
  became?: { name: string; position: string | null };
  /** Value when the trade was made — null with nothing to go by. */
  then: number | null;
  /**
   * `then` stood in for: a pick KTC no longer lists (its draft's done) weighed at what it became, the
   * drafted player's first value.
   */
  thenStandIn: boolean;
  now: number | null;
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
  drafts: Map<string, DraftResult>,
  history: ValueHistory,
  bySleeperId: Map<string, ValueSeries>,
  players: PlayerInfo,
  superflex: boolean,
  now = Date.now()
): AnalyzedTrade[] {
  const today = dayOf(now);
  const pickSeries = new Map<string, ValueSeries>();
  for (const s of Object.values(history.players)) if (s.p === "RDP") pickSeries.set(s.n, s);
  const on = (series: ValueSeries | undefined, day: number) => (series ? valueOn(history, series, superflex, day) : null);
  // A series' first value, for a pick weighed at what it became.
  const first = (series: ValueSeries | undefined) => (series ? ((superflex ? series.sf : series.q).find((v) => v != null) ?? null) : null);

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
          { label: info?.name ?? series?.n ?? `Player ${playerId}`, position: info?.position ?? series?.p ?? null, then: on(series, day), thenStandIn: false, now: on(series, today) },
          (d) => on(series, d)
        );
      }
      for (const pick of t.draft_picks ?? []) {
        const series = pickSeries.get(`${pick.season} Mid ${ordinal(pick.round)}`);
        const draft = drafts.get(pick.season);
        const drafted = draft?.players.get(`${pick.round}-${pick.roster_id}`);
        const player = drafted ? bySleeperId.get(drafted) : undefined;
        const draftDay = draft ? dayOf(draft.at) : null;
        // A pick until its draft, then whoever it became.
        const pickOn = (d: number) => (draftDay !== null && d >= draftDay && drafted ? on(player, d) : on(series, d));
        const thenValue = pickOn(day);
        const standIn = thenValue === null && player ? first(player) : null;
        // With no value for the pick itself, its stand-in held until what it became has one.
        const valueOnDay = (d: number) => pickOn(d) ?? (draftDay === null || d < draftDay ? standIn : null);
        const info = drafted ? players.get(drafted) : undefined;
        add(
          pick.owner_id,
          {
            label: `${pick.season} ${ordinal(pick.round)}`,
            position: "PICK",
            pickOf: pick.roster_id !== pick.previous_owner_id ? teamNames.get(pick.roster_id) : undefined,
            became: drafted ? { name: info?.name ?? player?.n ?? `Player ${drafted}`, position: info?.position ?? player?.p ?? null } : undefined,
            then: thenValue ?? standIn,
            thenStandIn: thenValue === null && standIn !== null,
            now: pickOn(today),
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
