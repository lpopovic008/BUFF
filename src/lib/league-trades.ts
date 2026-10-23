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
import { isPick, pickId, RosterEvent, rosterTimeline, settlePicks, TimelineColumn } from "./roster-timeline";
import { SleeperTransaction } from "./sleeper";
import { ordinal } from "./format";

/** Sleeper keeps a season's transactions by week; the offseason's land in the first. */
const WEEKS = Array.from({ length: 19 }, (_, i) => i);

/**
 * Each season's finished drafts, newest first — a startup and a rookie draft can share a season, and an empty one
 * can sit beside the real one — and every pick made in them, as a move onto the roster that made it. In a rookie
 * draft (no more rounds than `rookieRounds`), the move uses up the draft pick too, and `becomes` says who each
 * pick turned into; `rounds` is each season's rookie draft's rounds.
 */
async function loadDrafts(
  leagueIds: string[],
  rookieRounds: number
): Promise<{ results: Map<string, DraftResult[]>; picks: RosterEvent[]; becomes: Map<string, string>; rounds: Map<string, number> }> {
  const drafts = (await Promise.all(leagueIds.map(getLeagueDrafts))).flat().filter((d) => d.status === "complete");
  const results = await Promise.all(
    drafts.map(async (d) => {
      const [full, picks] = await Promise.all([getDraft(d.draft_id), getDraftPicks(d.draft_id)]);
      const slotRoster = full?.slot_to_roster_id ?? d.slot_to_roster_id ?? {};
      const rookie = picks.length > 0 && (full?.settings?.rounds ?? d.settings?.rounds ?? Infinity) <= rookieRounds;
      const players = new Map<string, string>();
      const made: RosterEvent[] = [];
      const becomes: [string, string][] = [];
      for (const p of picks) {
        const original = slotRoster[String(p.draft_slot)];
        if (original != null && p.player_id) players.set(`${p.round}-${original}`, p.player_id);
        if (p.roster_id == null) continue;
        const pick = rookie && original != null ? pickId(d.season, p.round, original) : null;
        if (pick && p.player_id) becomes.push([pick, p.player_id]);
        // In pick order, a millisecond apart from the draft's start.
        made.push({ at: (d.start_time ?? 0) + p.pick_no, tradeId: null, adds: p.player_id ? [[p.player_id, p.roster_id]] : [], drops: pick ? [[pick, p.roster_id]] : [] });
      }
      const rounds = rookie ? Math.max(...picks.map((p) => p.round)) : 0;
      return { season: d.season, result: { at: d.start_time ?? 0, players }, made, becomes, rounds };
    })
  );
  const out = new Map<string, DraftResult[]>();
  for (const { season, result } of results) out.set(season, [...(out.get(season) ?? []), result]);
  for (const list of out.values()) list.sort((a, b) => b.at - a.at);
  const rounds = new Map<string, number>();
  for (const r of results) if (r.rounds > 0) rounds.set(r.season, Math.max(r.rounds, rounds.get(r.season) ?? 0));
  return { results: out, picks: results.flatMap((r) => r.made), becomes: new Map(results.flatMap((r) => r.becomes)), rounds };
}

/** A completed transaction as a roster move: who — and which draft picks — it added to and dropped from which roster, and the trade it is, if one. */
function moveOf(t: SleeperTransaction): RosterEvent {
  const picks = (t.draft_picks ?? []).map((p) => [pickId(p.season, p.round, p.roster_id), p] as const);
  return {
    at: t.created,
    tradeId: t.type === "trade" ? t.transaction_id : null,
    adds: [...Object.entries(t.adds ?? {}), ...picks.map(([id, p]): [string, number] => [id, p.owner_id])],
    drops: [...Object.entries(t.drops ?? {}), ...picks.map(([id, p]): [string, number] => [id, p.previous_owner_id])],
  };
}

/** A draft pick's stand-in position, and the most rounds a rookie draft has — a draft with more is a startup. */
export const PICK = "PICK";
const MAX_ROOKIE_ROUNDS = 7;
const DEFAULT_ROOKIE_ROUNDS = 4;

/** How many seasons past a league's own its teams hold draft picks for, unless its trades show more. */
const PICK_SEASONS_AHEAD = 2;

/**
 * Every draft pick's life as roster moves: each team gets its picks for a season (`rounds` of them) when the league
 * that first trades them begins — `ahead` seasons before the draft — and a pick goes when it's used, or wherever
 * its trades take it. Picks only for drafts that were held (a rookie draft) or are still to come.
 */
function withPicks(
  seasons: { season: string; moves: RosterEvent[]; rosters: Map<number, string[]> }[],
  draftMoves: RosterEvent[],
  drafts: Map<string, DraftResult[]>,
  rounds: Map<string, number>,
  rookieRounds: number
): RosterEvent[] {
  const current = Number(seasons[0].season);
  const ahead = Math.max(
    PICK_SEASONS_AHEAD,
    ...seasons.flatMap((s) => s.moves.flatMap((m) => m.adds.filter(([id]) => isPick(id)).map(([id]) => Number(id.slice(5, 9)) - Number(s.season))))
  );
  const next = drafts.has(String(current)) ? current + 1 : current;
  const pickSeasons = new Set([...rounds.keys()].map(Number));
  for (let season = next; season <= current + ahead; season++) pickSeasons.add(season);
  const kept = ([id]: [string, number]) => !isPick(id) || pickSeasons.has(Number(id.slice(5, 9)));
  const moves = [...seasons.flatMap((s) => s.moves), ...draftMoves].map((m) => ({ ...m, adds: m.adds.filter(kept), drops: m.drops.filter(kept) }));
  // When each league began: just before its first move (its draft's among them), else after everything so far.
  const latest = Math.max(0, ...moves.map((m) => m.at));
  const began = new Map(
    seasons.map((s) => {
      const times = [...s.moves.map((m) => m.at), ...(drafts.get(s.season) ?? []).map((d) => d.at)];
      return [Number(s.season), times.length ? Math.min(...times) - 1 : latest + 1];
    })
  );
  const oldest = Number(seasons[seasons.length - 1].season);
  const teams = [...seasons[0].rosters.keys()];
  const made: RosterEvent[] = [...pickSeasons].map((season) => ({
    at: began.get(Math.max(oldest, season - ahead)) ?? latest + 1,
    tradeId: null,
    adds: teams.flatMap((rosterId) =>
      Array.from({ length: rounds.get(String(season)) ?? rookieRounds }, (_, r): [string, number] => [pickId(season, r + 1, rosterId), rosterId])
    ),
    drops: [],
  }));
  return [...moves, ...made];
}

/** Someone on a roster at some point, for the roster timeline: their name, position and KTC value now — or a draft pick, and who it became. */
export interface TimelinePlayer {
  name: string;
  position: string | null;
  value: number | null;
  becomes?: string;
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
  const setRounds = Number(chain[0].settings.draft_rounds) || 0;
  const rookieRounds = setRounds > 0 && setRounds <= MAX_ROOKIE_ROUNDS ? setRounds : DEFAULT_ROOKIE_ROUNDS;
  const [seasons, { results: drafts, picks, becomes, rounds }, idIndex] = await Promise.all([
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
    loadDrafts(
      chain.map((l) => l.league_id),
      rookieRounds
    ),
    loadPlayerIdIndex(),
  ]);
  // Every team's players and draft picks over time, from today's rosters (and the picks they hold) back.
  const { events, held } = settlePicks(withPicks(seasons, picks, drafts, rounds, rookieRounds));
  const current = new Map(seasons[0]?.rosters ?? []);
  for (const [rosterId, ids] of held) current.set(rosterId, [...(current.get(rosterId) ?? []), ...ids]);
  const timeline = rosterTimeline(current, events, Date.now());
  // Sleeper's details for everyone traded, drafted with a traded pick, or in the timeline.
  const ids = new Set<string>();
  for (const s of seasons) for (const t of s.trades) for (const id of Object.keys(t.adds ?? {})) ids.add(id);
  for (const list of drafts.values()) for (const d of list) for (const id of d.players.values()) ids.add(id);
  for (const column of timeline) for (const players of column.rosters.values()) for (const id of players) if (!isPick(id)) ids.add(id);
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
  // The draft picks: their season and round, whose they first were, and who they became.
  const teamName = seasons[0]?.teamNames ?? new Map<number, string>();
  for (const column of timeline)
    for (const list of column.rosters.values())
      for (const id of list) {
        if (!isPick(id) || people.has(id)) continue;
        const [season, round, original] = id.slice(5).split("-").map(Number);
        const name = `${season} ${ordinal(round)} (${teamName.get(original) ?? `Team ${original}`})`;
        people.set(id, { name, position: PICK, value: null, becomes: becomes.get(id) });
      }
  const teams = [...(seasons[0]?.teamNames ?? new Map<number, string>())].map(([rosterId, name]) => ({ rosterId, name })).sort((a, b) => a.rosterId - b.rosterId);
  return { trades: analyzeTrades(seasons, drafts, history, bySleeperId, players, superflex), teams, superflex, timeline, people };
}
