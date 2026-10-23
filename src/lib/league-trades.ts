// A league's trades, all its seasons, loaded from Sleeper and weighed (see
// trades.ts) — for the values page's trade analyzer, and for scripts that
// study them.

import {
  getDraft,
  getDraftPicks,
  getLeagueDrafts,
  getLeagueHistoryChain,
  getLeagueRosters,
  getLeagueUsers,
  getTransactions,
  leagueQBFormat,
} from "./sleeper";
import { loadPlayerIdIndex, resolvePlayers } from "./players";
import { normalizeName } from "./name-match";
import { analyzeTrades, AnalyzedTrade, DraftResult, TradeSeason } from "./trades";
import { dayOf, ValueHistory, ValueSeries, valueOn } from "./value-history";
import { RosterEvent, rosterTimeline, TimelineColumn } from "./roster-timeline";
import { SleeperTransaction } from "./sleeper";

/** Sleeper keeps a season's transactions by week; the offseason's land in the first. */
const WEEKS = Array.from({ length: 19 }, (_, i) => i);

/**
 * Each season's finished drafts, newest first — a startup and a rookie draft can share a season, and an empty one
 * can sit beside the real one — and every pick made in them, as a move onto the roster that made it.
 */
async function loadDrafts(leagueIds: string[]): Promise<{ results: Map<string, DraftResult[]>; picks: RosterEvent[] }> {
  const drafts = (await Promise.all(leagueIds.map(getLeagueDrafts))).flat().filter((d) => d.status === "complete");
  const results = await Promise.all(
    drafts.map(async (d) => {
      const [full, picks] = await Promise.all([getDraft(d.draft_id), getDraftPicks(d.draft_id)]);
      const slotRoster = full?.slot_to_roster_id ?? d.slot_to_roster_id ?? {};
      const players = new Map<string, string>();
      const made: RosterEvent[] = [];
      for (const p of picks) {
        const original = slotRoster[String(p.draft_slot)];
        if (original != null && p.player_id) players.set(`${p.round}-${original}`, p.player_id);
        // In pick order, a millisecond apart from the draft's start.
        if (p.roster_id != null && p.player_id) made.push({ at: (d.start_time ?? 0) + p.pick_no, tradeId: null, adds: [[p.player_id, p.roster_id]], drops: [] });
      }
      return { season: d.season, result: { at: d.start_time ?? 0, players }, made };
    })
  );
  const out = new Map<string, DraftResult[]>();
  for (const { season, result } of results) out.set(season, [...(out.get(season) ?? []), result]);
  for (const list of out.values()) list.sort((a, b) => b.at - a.at);
  return { results: out, picks: results.flatMap((r) => r.made) };
}

/** A completed transaction as a roster move: who it added to and dropped from which roster, and the trade it is, if one. */
function moveOf(t: SleeperTransaction): RosterEvent {
  return {
    at: t.created,
    tradeId: t.type === "trade" ? t.transaction_id : null,
    adds: Object.entries(t.adds ?? {}),
    drops: Object.entries(t.drops ?? {}),
  };
}

/** Someone on a roster at some point, for the roster timeline: their name, position and KTC value now. */
export interface TimelinePlayer {
  name: string;
  position: string | null;
  value: number | null;
}

export interface LeagueTrades {
  trades: AnalyzedTrade[];
  /** Every team's players over time (see rosterTimeline), and who each of them is. */
  timeline: TimelineColumn[];
  people: Map<string, TimelinePlayer>;
  /** Every team slot (roster id), by its latest name — the current season's. */
  teams: { rosterId: number; name: string }[];
  /** Weighed in superflex values (else 1QB). */
  superflex: boolean;
}

/** Every trade in a league, across all its seasons, weighed in KTC dynasty value then and now — null if Sleeper doesn't know the league. */
export async function loadLeagueTrades(leagueId: string, myUserId: string | null, history: ValueHistory): Promise<LeagueTrades | null> {
  const chain = await getLeagueHistoryChain(leagueId);
  if (chain.length === 0) return null;
  const [seasons, { results: drafts, picks }, idIndex] = await Promise.all([
    Promise.all(
      chain.map(async (league): Promise<TradeSeason & { moves: RosterEvent[]; rosters: Map<number, string[]> }> => {
        const [rosters, users, weeks] = await Promise.all([
          getLeagueRosters(league.league_id),
          getLeagueUsers(league.league_id),
          Promise.all(WEEKS.map((w) => getTransactions(league.league_id, w).catch(() => []))),
        ]);
        const userById = new Map(users.map((u) => [u.user_id, u]));
        const teamNames = new Map(
          rosters.map((r) => {
            const user = r.owner_id ? userById.get(r.owner_id) : undefined;
            return [r.roster_id, user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`] as const;
          })
        );
        const mine = rosters.find((r) => myUserId && (r.owner_id === myUserId || r.co_owners?.includes(myUserId)));
        const done = weeks.flat().filter((t) => t.status === "complete");
        return {
          season: league.season,
          teamNames,
          myRosterId: mine?.roster_id ?? null,
          trades: weeks.flat().filter((t) => t.type === "trade"),
          moves: done.map(moveOf),
          rosters: new Map(rosters.map((r) => [r.roster_id, r.players ?? []])),
        };
      })
    ),
    loadDrafts(chain.map((l) => l.league_id)),
    loadPlayerIdIndex(),
  ]);
  // Every team's players over time, from today's rosters back.
  const timeline = rosterTimeline(seasons[0]?.rosters ?? new Map(), [...seasons.flatMap((s) => s.moves), ...picks], Date.now());
  // Sleeper's details for everyone traded, drafted with a traded pick, or on a roster at any point.
  const ids = new Set<string>();
  for (const s of seasons) for (const t of s.trades) for (const id of Object.keys(t.adds ?? {})) ids.add(id);
  for (const list of drafts.values()) for (const d of list) for (const id of d.players.values()) ids.add(id);
  for (const column of timeline) for (const players of column.rosters.values()) for (const id of players) ids.add(id);
  const resolved = await resolvePlayers([...ids]);
  const players = new Map(resolved.map((p) => [p.playerId, { name: p.name, position: p.position }]));
  // Each KTC player's series by Sleeper id, matched on position and name.
  const bySleeperId = new Map<string, ValueSeries>();
  for (const series of Object.values(history.players)) {
    const id = idIndex.get(`${series.p}-${normalizeName(series.n)}`);
    if (id) bySleeperId.set(id, series);
  }
  const superflex = leagueQBFormat(chain[0]) === "superflex";
  const today = dayOf(Date.now());
  const people = new Map<string, TimelinePlayer>(
    resolved.map((p) => {
      const series = bySleeperId.get(p.playerId);
      return [p.playerId, { name: p.name, position: p.position || null, value: series ? valueOn(history, series, superflex, today) : null }];
    })
  );
  const teams = [...(seasons[0]?.teamNames ?? new Map<number, string>())].map(([rosterId, name]) => ({ rosterId, name })).sort((a, b) => a.rosterId - b.rosterId);
  return { trades: analyzeTrades(seasons, drafts, history, bySleeperId, players, superflex), teams, superflex, timeline, people };
}
