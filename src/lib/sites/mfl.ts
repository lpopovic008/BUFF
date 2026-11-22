// A MyFantasyLeague league in Sleeper's shape (see sites/index), from MFL's export API — readable without a login
// for any league that isn't set private. Each MFL franchise ("0001") is a roster, its number the roster's id.
//
// MFL lets a lineup run from one count to another at a position ("2-4" running backs); here each position has the
// fewest it can, the rest of the starters as flex. Its playoff brackets aren't read (none are shown).

import type { SleeperDraftPick, SleeperLeague, SleeperLeagueUser, SleeperMatchup, SleeperRoster, SleeperTradedPick, SleeperTransaction } from "../sleeper";
import type { SiteAdapter } from "./index";
import { siteDraftId, siteLeagueId, SiteLeagueRef } from "./ids";
import { asList, nflWeekAt, num, siteJson } from "./fetch";
import { mapPlayers, SitePlayer } from "./player-map";
import { orderStarters, rosterPositions, rosterSettings, transaction } from "./shape";
import { managerId } from "./teams";

const API = "https://api.myfantasyleague.com";

interface MflFranchise {
  id: string;
  name?: string;
  owner_name?: string;
  icon?: string;
  logo?: string;
}

interface MflLeague {
  league?: {
    name?: string;
    franchises?: { franchise?: MflFranchise | MflFranchise[] };
    starters?: { count?: string; position?: { name: string; limit: string } | { name: string; limit: string }[] };
    rosterSize?: string;
    lastRegularSeasonWeek?: string;
    history?: { league?: { url: string; year: string } | { url: string; year: string }[] };
  };
}

interface MflPlayer {
  id: string;
  name?: string;
  position?: string;
  team?: string;
  espn_id?: string;
}

interface MflScoredPlayer {
  id: string;
  score?: string;
  status?: string;
}

interface MflSide {
  id: string;
  score?: string;
  player?: MflScoredPlayer | MflScoredPlayer[];
  players?: { player?: MflScoredPlayer | MflScoredPlayer[] };
}

const POSITION: Record<string, string> = { PK: "K", Def: "DEF", DE: "DL", DT: "DL", CB: "DB", S: "DB" };
const position = (p?: string) => (p ? (POSITION[p] ?? p.toUpperCase()) : "UNK");

/** One of MFL's exports for a league, kept `ttl` seconds. */
function exportOf<T>(ref: SiteLeagueRef, type: string, ttl: number, extra = ""): Promise<T | null> {
  return siteJson<T>({ url: `${API}/${ref.season}/export?TYPE=${type}&L=${ref.id}&JSON=1${extra}` }, ttl);
}

const info = (ref: SiteLeagueRef) => exportOf<MflLeague>(ref, "league", 300);

/** Every NFL player MFL knows that season, by its id (its whole list: kept an hour). */
async function players(season: string): Promise<Map<string, SitePlayer>> {
  const d = await siteJson<{ players?: { player?: MflPlayer | MflPlayer[] } }>({ url: `${API}/${season}/export?TYPE=players&DETAILS=1&JSON=1` }, 3600);
  const out = new Map<string, SitePlayer>();
  for (const p of asList(d?.players?.player)) {
    // MFL names him "Allen, Josh".
    const [last, first] = (p.name ?? "").split(",").map((s) => s.trim());
    out.set(p.id, { id: p.id, name: first ? `${first} ${last}` : last, position: position(p.position), team: p.team ?? null, espnId: p.espn_id ?? null });
  }
  return out;
}

/** MFL's players' Sleeper ids, by MFL's. */
async function idsFor(ref: SiteLeagueRef, ids: string[]): Promise<(id: string) => string> {
  const all = await players(ref.season);
  const map = await mapPlayers("mfl", ids.map((id) => all.get(id) ?? { id, name: `Player ${id}`, position: "UNK" }));
  return (id) => map.get(id) ?? `mfl:${id}`;
}

/** The league's lineup slots in Sleeper's terms: each position's fewest, then the rest of its starters as flex. */
function slots(d: MflLeague | null): string[] {
  const s = d?.league?.starters;
  const counts: Record<string, number> = {};
  let fixed = 0;
  let qbMost = 0;
  for (const p of asList(s?.position)) {
    const [least, most] = p.limit.split("-").map(Number);
    const pos = position(p.name);
    counts[pos] = (counts[pos] ?? 0) + least;
    fixed += least;
    if (pos === "QB") qbMost = most ?? least;
  }
  const flex = Math.max(0, num(s?.count) - fixed);
  if (flex > 0) {
    // A second quarterback allowed: one of the flex spots is a superflex.
    if (qbMost > (counts.QB ?? 0)) {
      counts.SUPER_FLEX = 1;
      counts.FLEX = flex - 1;
    } else counts.FLEX = flex;
  }
  const bench = Math.max(0, num(d?.league?.rosterSize) - num(s?.count));
  return rosterPositions(counts, bench);
}

const franchiseNo = (id: string) => parseInt(id, 10);

/** A trade's or pickup's ids, "13604,FP_0005_2026_1,": the players, and the picks. */
function parseGave(list: string | undefined) {
  const parts = (list ?? "").split(",").filter(Boolean);
  return { players: parts.filter((p) => /^\d+$/.test(p)), picks: parts.filter((p) => /^(FP|DP)_/.test(p)) };
}

export const mfl: SiteAdapter = {
  async league(ref) {
    const d = await info(ref);
    if (!d?.league) return null;
    const l = d.league;
    const leagueId = siteLeagueId(ref);
    const prev = asList(l.history?.league).find((h) => Number(h.year) === Number(ref.season) - 1);
    const prevId = prev?.url.match(/\/home\/(\d+)/)?.[1];
    const league: SleeperLeague = {
      league_id: leagueId,
      name: l.name ?? `MFL league ${ref.id}`,
      season: ref.season,
      season_type: "regular",
      sport: "nfl",
      status: "in_season",
      avatar: null,
      previous_league_id: prevId ? siteLeagueId({ site: "mfl", season: String(Number(ref.season) - 1), id: prevId }) : null,
      draft_id: siteDraftId(leagueId),
      settings: {
        num_teams: asList(l.franchises?.franchise).length,
        playoff_week_start: num(l.lastRegularSeasonWeek) + 1 || 15,
        type: 0,
      },
      roster_positions: slots(d),
    };
    return league;
  },

  async users(ref) {
    const d = await info(ref);
    const leagueId = siteLeagueId(ref);
    return asList(d?.league?.franchises?.franchise).map(
      (f): SleeperLeagueUser => ({
        user_id: managerId(leagueId, franchiseNo(f.id)),
        username: null,
        display_name: f.owner_name || f.name || `Franchise ${f.id}`,
        avatar: null,
        metadata: { team_name: f.name ?? `Franchise ${f.id}`, avatar: f.logo || f.icon || null },
      })
    );
  },

  async rosters(ref) {
    type Standing = { id: string; h2hw?: string; h2hl?: string; h2ht?: string; pf?: string; pa?: string; strk?: string };
    const [r, st] = await Promise.all([
      exportOf<{ rosters?: { franchise?: { id: string; player?: { id: string; status?: string } | { id: string; status?: string }[] }[] } }>(ref, "rosters", 60),
      exportOf<{ leagueStandings?: { franchise?: Standing | Standing[] } }>(ref, "leagueStandings", 300),
    ]);
    const franchises = asList(r?.rosters?.franchise);
    const idOf = await idsFor(ref, franchises.flatMap((f) => asList(f.player).map((p) => p.id)));
    const leagueId = siteLeagueId(ref);
    return franchises.map((f): SleeperRoster => {
      const s = asList(st?.leagueStandings?.franchise).find((x) => x.id === f.id);
      const list = asList(f.player);
      return {
        roster_id: franchiseNo(f.id),
        owner_id: managerId(leagueId, franchiseNo(f.id)),
        league_id: leagueId,
        players: list.filter((p) => p.status !== "TAXI_SQUAD" && p.status !== "INJURED_RESERVE").map((p) => idOf(p.id)),
        starters: [],
        reserve: list.filter((p) => p.status === "INJURED_RESERVE").map((p) => idOf(p.id)),
        taxi: list.filter((p) => p.status === "TAXI_SQUAD").map((p) => idOf(p.id)),
        settings: rosterSettings({ wins: num(s?.h2hw), losses: num(s?.h2hl), ties: num(s?.h2ht), pointsFor: num(s?.pf), pointsAgainst: num(s?.pa) }),
        metadata: s?.strk ? { streak: s.strk } : null,
      };
    });
  },

  async matchups(ref, week, ttl) {
    type Week = { matchup?: { franchise?: MflSide[] } | { franchise?: MflSide[] }[]; franchise?: MflSide | MflSide[] };
    const [d, results, live] = await Promise.all([
      info(ref),
      exportOf<{ weeklyResults?: Week }>(ref, "weeklyResults", Math.min(ttl, 120), `&W=${week}`),
      exportOf<{ liveScoring?: Week }>(ref, "liveScoring", Math.min(ttl, 60), `&W=${week}`),
    ]);
    // The week's live scoring while it's on (it has the players playing now); its results once they're in.
    const shown = asList(live?.liveScoring?.matchup).length ? live?.liveScoring : results?.weeklyResults;
    const games = asList(shown?.matchup);
    const sides = (m: { franchise?: MflSide[] }) => asList(m.franchise);
    const playersOf = (s: MflSide) => asList(s.players?.player ?? s.player);
    const all = [...games.flatMap(sides), ...asList(shown?.franchise)];
    const idOf = await idsFor(ref, all.flatMap((s) => playersOf(s).map((p) => p.id)));
    const allIds = await players(ref.season);
    const positions = slots(d);
    const side = (s: MflSide, matchupId: number | null): SleeperMatchup => {
      const ps = playersOf(s);
      const starters = ps.filter((p) => p.status === "starter").map((p) => ({ id: idOf(p.id), slot: allIds.get(p.id)?.position ?? "FLEX" }));
      return {
        roster_id: franchiseNo(s.id),
        matchup_id: matchupId,
        points: num(s.score),
        players: ps.map((p) => idOf(p.id)),
        starters: orderStarters(positions, starters),
        players_points: Object.fromEntries(ps.map((p) => [idOf(p.id), num(p.score)])),
      };
    };
    return [...games.flatMap((m, i) => sides(m).map((s) => side(s, i + 1))), ...asList(shown?.franchise).map((s) => side(s, null))];
  },

  async transactions(ref, week) {
    type Txn = { type: string; timestamp: string; franchise?: string; franchise2?: string; franchise1_gave_up?: string; franchise2_gave_up?: string; transaction?: string };
    const d = await exportOf<{ transactions?: { transaction?: Txn | Txn[] } }>(ref, "transactions", 120, "&TRANS_TYPE=TRADE,FREE_AGENT,WAIVER,BBID_WAIVER");
    const txns = asList(d?.transactions?.transaction).filter((t) => nflWeekAt(num(t.timestamp) * 1000, ref.season) === week);
    const ids = txns.flatMap((t) => [t.franchise1_gave_up, t.franchise2_gave_up, ...(t.transaction ?? "").split("|")].flatMap((x) => parseGave(x).players));
    const idOf = await idsFor(ref, ids);
    return txns.map((t, i): SleeperTransaction => {
      const at = num(t.timestamp) * 1000;
      const from = franchiseNo(t.franchise ?? "0");
      if (t.type === "TRADE") {
        const to = franchiseNo(t.franchise2 ?? "0");
        const a = parseGave(t.franchise1_gave_up);
        const b = parseGave(t.franchise2_gave_up);
        const adds: Record<string, number> = {};
        const drops: Record<string, number> = {};
        for (const p of a.players) [adds[idOf(p)], drops[idOf(p)]] = [to, from];
        for (const p of b.players) [adds[idOf(p)], drops[idOf(p)]] = [from, to];
        // A future pick, "FP_0005_2026_1": franchise 5's 2026 first; this year's, "DP_02_05": its third round.
        const pick = (code: string, giver: number, getter: number): SleeperTradedPick | null => {
          const fp = /^FP_(\d+)_(\d{4})_(\d+)$/.exec(code);
          if (fp) return { season: fp[2], round: Number(fp[3]), roster_id: franchiseNo(fp[1]), previous_owner_id: giver, owner_id: getter };
          const dp = /^DP_(\d+)_(\d+)$/.exec(code);
          return dp ? { season: ref.season, round: Number(dp[1]) + 1, roster_id: giver, previous_owner_id: giver, owner_id: getter } : null;
        };
        const picks = [...a.picks.map((c) => pick(c, from, to)), ...b.picks.map((c) => pick(c, to, from))].filter((p): p is SleeperTradedPick => p !== null);
        return transaction({ id: `${t.timestamp}-${i}`, type: "trade", at, week, adds, drops, rosterIds: [from, to], picks });
      }
      // A pickup, "13604,|12345,": who came, then (after a bid, on a blind-bid waiver) who went.
      const parts = (t.transaction ?? "").split("|");
      const adds = Object.fromEntries(parseGave(parts[0]).players.map((p) => [idOf(p), from]));
      const drops = Object.fromEntries(parseGave(parts.length > 1 ? parts[parts.length - 1] : "").players.map((p) => [idOf(p), from]));
      const bid = parts.length === 3 ? num(parts[1]) : undefined;
      return transaction({ id: `${t.timestamp}-${i}`, type: t.type === "FREE_AGENT" ? "free_agent" : "waiver", at, week, adds, drops, rosterIds: [from], bid });
    });
  },

  async tradedPicks(ref) {
    type Pick = { year: string; round: string; originalPickFor: string };
    const d = await exportOf<{ futureDraftPicks?: { franchise?: { id: string; futureDraftPick?: Pick | Pick[] }[] } }>(ref, "futureDraftPicks", 300);
    return asList(d?.futureDraftPicks?.franchise).flatMap((f) =>
      asList(f.futureDraftPick)
        .filter((p) => p.originalPickFor !== f.id)
        .map((p) => ({ season: p.year, round: num(p.round), roster_id: franchiseNo(p.originalPickFor), previous_owner_id: franchiseNo(p.originalPickFor), owner_id: franchiseNo(f.id) }))
    );
  },

  async drafts(ref) {
    type Unit = { draftType?: string; round1DraftOrder?: string; draftPick?: { round: string; player?: string; timestamp?: string }[] };
    const d = await exportOf<{ draftResults?: { draftUnit?: Unit | Unit[] } }>(ref, "draftResults", 600);
    const unit = asList(d?.draftResults?.draftUnit)[0];
    if (!unit) return [];
    const picks = asList(unit.draftPick);
    const order = (unit.round1DraftOrder ?? "").split(",").filter(Boolean);
    return [
      {
        draft_id: siteDraftId(siteLeagueId(ref)),
        season: ref.season,
        status: picks.length && picks.every((p) => p.player) ? "complete" : picks.some((p) => p.player) ? "drafting" : "pre_draft",
        type: /AUCTION/i.test(unit.draftType ?? "") ? "auction" : "snake",
        start_time: picks[0]?.timestamp ? num(picks[0].timestamp) * 1000 : null,
        slot_to_roster_id: Object.fromEntries(order.map((f, i) => [String(i + 1), franchiseNo(f)])),
        settings: { rounds: picks.length ? Math.max(...picks.map((p) => num(p.round))) : undefined },
      },
    ];
  },

  async draftPicks(ref) {
    type Pick = { round: string; pick: string; franchise: string; player?: string };
    const d = await exportOf<{ draftResults?: { draftUnit?: { draftPick?: Pick[] } | { draftPick?: Pick[] }[] } }>(ref, "draftResults", 600);
    const picks = asList(asList(d?.draftResults?.draftUnit)[0]?.draftPick).filter((p) => p.player);
    const idOf = await idsFor(ref, picks.map((p) => p.player!));
    const perRound = Math.max(1, ...picks.map((p) => num(p.pick)));
    return picks.map(
      (p): SleeperDraftPick => ({
        round: num(p.round),
        pick_no: (num(p.round) - 1) * perRound + num(p.pick),
        draft_slot: num(p.pick),
        roster_id: franchiseNo(p.franchise),
        player_id: idOf(p.player!),
      })
    );
  },

  async winnersBracket() {
    return [];
  },
  async losersBracket() {
    return [];
  },
};
