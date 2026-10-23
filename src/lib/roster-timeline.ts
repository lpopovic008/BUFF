// Every team's players over time, for the values page's roster timeline: a column after each trade (and one before
// the first, one for now), each team's players in it as they stood then. Built backward from today's rosters by
// undoing every move the league made — trades, waiver and free-agent pickups and drops, and draft picks — so a
// column is the league as it really was, not just today's rosters shuffled by the trades. Pure: the fetching lives
// in league-trades.ts.

/** A move that changed rosters: players added to a roster and dropped from one (a draft pick adds and drops none). */
export interface RosterEvent {
  at: number;
  /** A trade's Sleeper transaction id — the timeline gets a column after each — or null for any other move. */
  tradeId: string | null;
  adds: [playerId: string, rosterId: number][];
  drops: [playerId: string, rosterId: number][];
}

/** One moment: every roster's players then, and the trade that made it (null before the first and for now). */
export interface TimelineColumn {
  at: number;
  tradeId: string | null;
  kind: "start" | "trade" | "now";
  rosters: Map<number, string[]>;
}

const snapshot = (state: Map<number, Set<string>>) => new Map([...state].map(([rosterId, players]) => [rosterId, [...players]]));
const same = (a: Map<number, string[]>, b: Map<number, string[]>) =>
  a.size === b.size && [...a].every(([id, players]) => b.get(id)?.length === players.length && players.every((p) => b.get(id)!.includes(p)));

/**
 * The league's columns, oldest first: before its first trade, after each trade, and now (when anything's changed
 * since the last trade). `current` is each roster's players today; `events` every move, any order.
 */
export function rosterTimeline(current: Map<number, string[]>, events: RosterEvent[], now: number): TimelineColumn[] {
  const state = new Map([...current].map(([rosterId, players]) => [rosterId, new Set(players)]));
  const columns: TimelineColumn[] = [{ at: now, tradeId: null, kind: "now", rosters: snapshot(state) }];
  const newestFirst = [...events].sort((a, b) => b.at - a.at);
  let tradesLeft = newestFirst.filter((e) => e.tradeId).length;
  for (const event of newestFirst) {
    if (tradesLeft === 0) break;
    // Just after a trade, the rosters are as they stand now that every later move is undone.
    if (event.tradeId) columns.push({ at: event.at, tradeId: event.tradeId, kind: "trade", rosters: snapshot(state) });
    for (const [player, rosterId] of event.adds) state.get(rosterId)?.delete(player);
    for (const [player, rosterId] of event.drops) {
      if (!state.has(rosterId)) state.set(rosterId, new Set());
      state.get(rosterId)!.add(player);
    }
    // And just before the first.
    if (event.tradeId && --tradesLeft === 0) columns.push({ at: event.at - 1, tradeId: null, kind: "start", rosters: snapshot(state) });
  }
  columns.reverse();
  // Now only when it differs from just after the last trade.
  const [last, beforeLast] = [columns[columns.length - 1], columns[columns.length - 2]];
  if (beforeLast?.kind === "trade" && same(last.rosters, beforeLast.rosters)) columns.pop();
  return columns;
}

/** A draft pick's id among the players: its draft's season, its round, and the team it first belonged to. */
export const pickId = (season: string | number, round: number, originalRosterId: number) => `pick:${season}-${round}-${originalRosterId}`;
export const isPick = (id: string) => id.startsWith("pick:");

/**
 * Plays every move forward to settle who holds each draft pick: a pick leaves whoever really holds it — each drop
 * of a pick is pointed there, or left out when no one does — and the holdings at the end are today's.
 */
export function settlePicks(events: RosterEvent[]): { events: RosterEvent[]; held: Map<number, string[]> } {
  const holder = new Map<string, number>();
  const settled = [...events]
    .sort((a, b) => a.at - b.at)
    .map((event) => {
      const drops = event.drops.flatMap(([id, rosterId]): [string, number][] => {
        if (!isPick(id)) return [[id, rosterId]];
        const from = holder.get(id);
        holder.delete(id);
        return from == null ? [] : [[id, from]];
      });
      for (const [id, rosterId] of event.adds) if (isPick(id)) holder.set(id, rosterId);
      return { ...event, drops };
    });
  const held = new Map<number, string[]>();
  for (const [id, rosterId] of holder) held.set(rosterId, [...(held.get(rosterId) ?? []), id]);
  return { events: settled, held };
}
