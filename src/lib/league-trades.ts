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
import { ValueHistory, ValueSeries } from "./value-history";

/** Sleeper keeps a season's transactions by week; the offseason's land in the first. */
const WEEKS = Array.from({ length: 19 }, (_, i) => i);

/** Each season's finished drafts, newest first — a startup and a rookie draft can share a season, and an empty one can sit beside the real one. */
async function loadDrafts(leagueIds: string[]): Promise<Map<string, DraftResult[]>> {
  const drafts = (await Promise.all(leagueIds.map(getLeagueDrafts))).flat().filter((d) => d.status === "complete");
  const results = await Promise.all(
    drafts.map(async (d) => {
      const [full, picks] = await Promise.all([getDraft(d.draft_id), getDraftPicks(d.draft_id)]);
      const slotRoster = full?.slot_to_roster_id ?? d.slot_to_roster_id ?? {};
      const players = new Map<string, string>();
      for (const p of picks) {
        const original = slotRoster[String(p.draft_slot)];
        if (original != null && p.player_id) players.set(`${p.round}-${original}`, p.player_id);
      }
      return { season: d.season, result: { at: d.start_time ?? 0, players } };
    })
  );
  const out = new Map<string, DraftResult[]>();
  for (const { season, result } of results) out.set(season, [...(out.get(season) ?? []), result]);
  for (const list of out.values()) list.sort((a, b) => b.at - a.at);
  return out;
}

export interface LeagueTrades {
  trades: AnalyzedTrade[];
  /** Weighed in superflex values (else 1QB). */
  superflex: boolean;
}

/** Every trade in a league, across all its seasons, weighed in KTC dynasty value then and now — null if Sleeper doesn't know the league. */
export async function loadLeagueTrades(leagueId: string, myUserId: string | null, history: ValueHistory): Promise<LeagueTrades | null> {
  const chain = await getLeagueHistoryChain(leagueId);
  if (chain.length === 0) return null;
  const [seasons, drafts, idIndex] = await Promise.all([
    Promise.all(
      chain.map(async (league): Promise<TradeSeason> => {
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
        return { season: league.season, teamNames, myRosterId: mine?.roster_id ?? null, trades: weeks.flat().filter((t) => t.type === "trade") };
      })
    ),
    loadDrafts(chain.map((l) => l.league_id)),
    loadPlayerIdIndex(),
  ]);
  // Sleeper's details for everyone traded or drafted with a traded pick.
  const ids = new Set<string>();
  for (const s of seasons) for (const t of s.trades) for (const id of Object.keys(t.adds ?? {})) ids.add(id);
  for (const list of drafts.values()) for (const d of list) for (const id of d.players.values()) ids.add(id);
  const resolved = await resolvePlayers([...ids]);
  const players = new Map(resolved.map((p) => [p.playerId, { name: p.name, position: p.position }]));
  // Each KTC player's series by Sleeper id, matched on position and name.
  const bySleeperId = new Map<string, ValueSeries>();
  for (const series of Object.values(history.players)) {
    const id = idIndex.get(`${series.p}-${normalizeName(series.n)}`);
    if (id) bySleeperId.set(id, series);
  }
  const superflex = leagueQBFormat(chain[0]) === "superflex";
  return { trades: analyzeTrades(seasons, drafts, history, bySleeperId, players, superflex), superflex };
}
