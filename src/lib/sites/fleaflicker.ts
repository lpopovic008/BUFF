// A Fleaflicker league in Sleeper's shape (see sites/index), from Fleaflicker's public API (every league on it can be
// read without a login). Each Fleaflicker team is a roster, its id the roster's id; a league keeps its id from season
// to season. A week's starters and players' points come from each game's box score.

import type { SleeperDraftPick, SleeperLeague, SleeperLeagueUser, SleeperMatchup, SleeperRoster, SleeperTransaction } from "../sleeper";
import type { SiteAdapter } from "./index";
import { previousSeasonId, siteDraftId, siteLeagueId, SiteLeagueRef } from "./ids";
import { nflWeekAt, num, siteJson } from "./fetch";
import { mapPlayers, SitePlayer } from "./player-map";
import { bracketFrom, orderStarters, rosterPositions, rosterSettings, transaction } from "./shape";
import { managerId } from "./teams";

const API = "https://www.fleaflicker.com/api";

interface FfProPlayer {
  id: number;
  nameFull?: string;
  position?: string;
  proTeamAbbreviation?: string;
}

interface FfTeam {
  id: number;
  name?: string;
  logoUrl?: string;
  recordOverall?: { wins?: number; losses?: number; ties?: number };
  pointsFor?: { value?: number };
  pointsAgainst?: { value?: number };
  streak?: { value?: number };
  owners?: { id: number; displayName?: string }[];
}

interface FfGame {
  id: string;
  home?: { id: number };
  away?: { id: number };
  homeScore?: { score?: { value?: number } };
  awayScore?: { score?: { value?: number } };
  homeResult?: string;
  isPlayoffs?: boolean;
  isConsolation?: boolean;
  isThirdPlaceGame?: boolean;
  isChampionshipGame?: boolean;
}

/** A player in a box score or on a roster: his details, and his points. */
interface FfLeaguePlayer {
  proPlayer?: FfProPlayer;
  leaguePlayer?: { proPlayer?: FfProPlayer };
  viewingActualPoints?: { value?: number };
}

const POSITION: Record<string, string> = { "D/ST": "DEF", DST: "DEF", DEF: "DEF", PK: "K" };
const sitePlayer = (p: FfProPlayer): SitePlayer => ({
  id: String(p.id),
  name: p.nameFull ?? `Player ${p.id}`,
  position: POSITION[p.position ?? ""] ?? p.position ?? "UNK",
  team: p.proTeamAbbreviation ?? null,
});
const proOf = (lp: FfLeaguePlayer | undefined) => lp?.proPlayer ?? lp?.leaguePlayer?.proPlayer;

/** Fleaflicker's lineup slots, as Sleeper names them. */
const SLOT: Record<string, string> = {
  QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "K", "D/ST": "DEF", DEF: "DEF",
  "RB/WR/TE": "FLEX", "WR/RB/TE": "FLEX", "RB/WR": "WRRB_FLEX", "WR/TE": "REC_FLEX", "QB/RB/WR/TE": "SUPER_FLEX",
  DL: "DL", LB: "LB", DB: "DB",
};

function call<T>(method: string, params: Record<string, string | number>, ttl: number): Promise<T | null> {
  const q = Object.entries({ sport: "NFL", ...params }).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  return siteJson<T>({ url: `${API}/${method}?${q}` }, ttl);
}

const standings = (ref: SiteLeagueRef) =>
  call<{ league?: { name?: string; size?: number }; divisions?: { teams?: FfTeam[] }[] }>("FetchLeagueStandings", { league_id: ref.id, season: ref.season }, 300);
const teamsOf = (d: { divisions?: { teams?: FfTeam[] }[] } | null) => (d?.divisions ?? []).flatMap((div) => div.teams ?? []);

async function slots(ref: SiteLeagueRef): Promise<string[]> {
  const rules = await call<{ rosterPositions?: { label?: string; group?: string; start?: number; min?: number }[] }>("FetchLeagueRules", { league_id: ref.id }, 3600);
  const counts: Record<string, number> = {};
  let bench = 0;
  for (const p of rules?.rosterPositions ?? []) {
    const n = p.start ?? p.min ?? 1;
    if (p.group === "START" && p.label) {
      const slot = SLOT[p.label] ?? "FLEX";
      counts[slot] = (counts[slot] ?? 0) + n;
    } else if (p.group === "BENCH") bench += n;
  }
  return rosterPositions(counts, bench);
}

const scoreboard = (ref: SiteLeagueRef, week: number, ttl: number) =>
  call<{ games?: FfGame[] }>("FetchLeagueScoreboard", { league_id: ref.id, season: ref.season, scoring_period: week }, ttl);

export const fleaflicker: SiteAdapter = {
  async league(ref) {
    const [d, positions] = await Promise.all([standings(ref), slots(ref)]);
    const teams = teamsOf(d);
    if (teams.length === 0) return null;
    const leagueId = siteLeagueId(ref);
    const league: SleeperLeague = {
      league_id: leagueId,
      name: d?.league?.name ?? `Fleaflicker league ${ref.id}`,
      season: ref.season,
      season_type: "regular",
      sport: "nfl",
      status: "in_season",
      avatar: null,
      previous_league_id: Number(ref.season) > 2010 ? previousSeasonId(ref) : null,
      draft_id: siteDraftId(leagueId),
      settings: { num_teams: d?.league?.size ?? teams.length, type: 0 },
      roster_positions: positions,
    };
    return league;
  },

  async users(ref) {
    const leagueId = siteLeagueId(ref);
    return teamsOf(await standings(ref)).map(
      (t): SleeperLeagueUser => ({
        user_id: managerId(leagueId, t.id),
        username: null,
        display_name: t.owners?.[0]?.displayName || t.name || `Team ${t.id}`,
        avatar: null,
        metadata: { team_name: t.name ?? `Team ${t.id}`, avatar: t.logoUrl ?? null },
      })
    );
  },

  async rosters(ref) {
    const [d, r] = await Promise.all([
      standings(ref),
      call<{ rosters?: { team?: { id: number }; players?: FfLeaguePlayer[] }[] }>("FetchLeagueRosters", { league_id: ref.id, season: ref.season }, 60),
    ]);
    const rosters = r?.rosters ?? [];
    const ids = await mapPlayers("fleaflicker", rosters.flatMap((x) => (x.players ?? []).map(proOf).filter((p): p is FfProPlayer => !!p).map(sitePlayer)));
    const leagueId = siteLeagueId(ref);
    return rosters
      .filter((x) => x.team)
      .map((x): SleeperRoster => {
        const t = teamsOf(d).find((y) => y.id === x.team!.id);
        const streak = t?.streak?.value ?? 0;
        return {
          roster_id: x.team!.id,
          owner_id: managerId(leagueId, x.team!.id),
          league_id: leagueId,
          players: (x.players ?? []).map(proOf).filter((p): p is FfProPlayer => !!p).map((p) => ids.get(String(p.id)) ?? `fleaflicker:${p.id}`),
          starters: [],
          settings: rosterSettings({
            wins: t?.recordOverall?.wins ?? 0,
            losses: t?.recordOverall?.losses ?? 0,
            ties: t?.recordOverall?.ties ?? 0,
            pointsFor: t?.pointsFor?.value ?? 0,
            pointsAgainst: t?.pointsAgainst?.value ?? 0,
          }),
          metadata: streak ? { streak: `${Math.abs(streak)}${streak > 0 ? "W" : "L"}` } : null,
        };
      });
  },

  async matchups(ref, week, ttl) {
    const [board, positions] = await Promise.all([scoreboard(ref, week, Math.min(ttl, 60)), slots(ref)]);
    type Slot = { position?: { label?: string }; home?: FfLeaguePlayer; away?: FfLeaguePlayer };
    const games = board?.games ?? [];
    const boxes = await Promise.all(
      games.map((g) => call<{ lineups?: { group?: string; slots?: Slot[] }[] }>("FetchLeagueBoxscore", { league_id: ref.id, fantasy_game_id: g.id, scoring_period: week }, Math.min(ttl, 60)))
    );
    const everyone = boxes.flatMap((b) => (b?.lineups ?? []).flatMap((l) => (l.slots ?? []).flatMap((s) => [proOf(s.home), proOf(s.away)]))).filter((p): p is FfProPlayer => !!p);
    const ids = await mapPlayers("fleaflicker", everyone.map(sitePlayer));
    const idOf = (p: FfProPlayer) => ids.get(String(p.id)) ?? `fleaflicker:${p.id}`;
    const out: SleeperMatchup[] = [];
    games.forEach((g, i) => {
      for (const side of ["home", "away"] as const) {
        const team = g[side];
        if (!team) continue;
        const lineups = boxes[i]?.lineups ?? [];
        const all = lineups.flatMap((l) => (l.slots ?? []).map((s) => ({ group: l.group, slot: s.position?.label ?? "", p: s[side] })));
        const filled = all.filter((x) => proOf(x.p));
        const starters = filled.filter((x) => x.group === "START").map((x) => ({ id: idOf(proOf(x.p)!), slot: SLOT[x.slot] ?? "FLEX" }));
        out.push({
          roster_id: team.id,
          matchup_id: g.home && g.away ? i + 1 : null,
          points: (side === "home" ? g.homeScore : g.awayScore)?.score?.value ?? 0,
          players: filled.map((x) => idOf(proOf(x.p)!)),
          starters: orderStarters(positions, starters),
          players_points: Object.fromEntries(filled.map((x) => [idOf(proOf(x.p)!), x.p?.viewingActualPoints?.value ?? 0])),
        });
      }
    });
    return out;
  },

  async transactions(ref, week) {
    type Item = { timeEpochMilli?: string | number; transaction?: { type?: string; player?: FfLeaguePlayer; team?: { id: number } } };
    type Trade = { id: number; approvedOn?: string | number; teams?: { team?: { id: number }; playersObtained?: FfLeaguePlayer[] }[] };
    const [moves, trades] = await Promise.all([
      call<{ items?: Item[] }>("FetchLeagueTransactions", { league_id: ref.id }, 120),
      call<{ trades?: Trade[] }>("FetchTrades", { league_id: ref.id, filter: "TRADES_COMPLETED" }, 300),
    ]);
    const inWeek = (at: unknown) => nflWeekAt(num(at), ref.season) === week;
    const items = (moves?.items ?? []).filter((x) => inWeek(x.timeEpochMilli) && x.transaction?.team && proOf(x.transaction.player) && x.transaction.type !== "TRANSACTION_TRADE");
    const done = (trades?.trades ?? []).filter((t) => inWeek(t.approvedOn));
    const pros = [...items.map((x) => proOf(x.transaction!.player)!), ...done.flatMap((t) => (t.teams ?? []).flatMap((s) => (s.playersObtained ?? []).map(proOf)))].filter((p): p is FfProPlayer => !!p);
    const ids = await mapPlayers("fleaflicker", pros.map(sitePlayer));
    const idOf = (p: FfProPlayer) => ids.get(String(p.id)) ?? `fleaflicker:${p.id}`;
    const out: SleeperTransaction[] = items.map((x, i) => {
      const t = x.transaction!;
      const team = t.team!.id;
      const player = idOf(proOf(t.player)!);
      const dropping = t.type === "TRANSACTION_DROP";
      return transaction({
        id: `${x.timeEpochMilli}-${i}`,
        type: t.type === "TRANSACTION_CLAIM" ? "waiver" : "free_agent",
        at: num(x.timeEpochMilli),
        week,
        adds: dropping ? {} : { [player]: team },
        drops: dropping ? { [player]: team } : {},
        rosterIds: [team],
      });
    });
    for (const t of done) {
      const sides = (t.teams ?? []).filter((s) => s.team);
      const adds: Record<string, number> = {};
      const drops: Record<string, number> = {};
      for (const s of sides) {
        for (const lp of s.playersObtained ?? []) {
          const p = proOf(lp);
          if (!p) continue;
          adds[idOf(p)] = s.team!.id;
          // (Two teams: what one got, the other gave.)
          const other = sides.find((o) => o !== s);
          if (other) drops[idOf(p)] = other.team!.id;
        }
      }
      out.push(transaction({ id: `trade-${t.id}`, type: "trade", at: num(t.approvedOn), week, adds, drops, rosterIds: sides.map((s) => s.team!.id) }));
    }
    return out;
  },

  async tradedPicks() {
    return [];
  },

  async drafts(ref) {
    type Cell = { player?: FfLeaguePlayer; team?: { id: number }; slot?: { round?: number; slot?: number; overall?: number } };
    const d = await call<{ rows?: { cells?: Cell[] }[] }>("FetchLeagueDraftBoard", { league_id: ref.id, season: ref.season }, 600);
    const cells = (d?.rows ?? []).flatMap((r) => r.cells ?? []);
    if (cells.length === 0) return [];
    const firstRound = cells.filter((c) => c.slot?.round === 1 && c.team);
    return [
      {
        draft_id: siteDraftId(siteLeagueId(ref)),
        season: ref.season,
        status: cells.every((c) => proOf(c.player)) ? "complete" : cells.some((c) => proOf(c.player)) ? "drafting" : "pre_draft",
        type: "snake",
        start_time: null,
        slot_to_roster_id: Object.fromEntries(firstRound.map((c) => [String(c.slot?.slot ?? 0), c.team!.id])),
        settings: { rounds: Math.max(...cells.map((c) => c.slot?.round ?? 0)) },
      },
    ];
  },

  async draftPicks(ref) {
    type Cell = { player?: FfLeaguePlayer; team?: { id: number }; slot?: { round?: number; slot?: number; overall?: number } };
    const d = await call<{ rows?: { cells?: Cell[] }[] }>("FetchLeagueDraftBoard", { league_id: ref.id, season: ref.season }, 600);
    const cells = (d?.rows ?? []).flatMap((r) => r.cells ?? []).filter((c) => proOf(c.player));
    const ids = await mapPlayers("fleaflicker", cells.map((c) => sitePlayer(proOf(c.player)!)));
    return cells.map(
      (c): SleeperDraftPick => ({
        round: c.slot?.round ?? 0,
        pick_no: c.slot?.overall ?? 0,
        draft_slot: c.slot?.slot ?? 0,
        roster_id: c.team?.id ?? null,
        player_id: ids.get(String(proOf(c.player)!.id)) ?? `fleaflicker:${proOf(c.player)!.id}`,
      })
    );
  },

  async winnersBracket(ref) {
    // Its playoff games, from each week's scoreboard after the regular season (Fleaflicker marks them).
    const weeks = [15, 16, 17, 18];
    const boards = await Promise.all(weeks.map((w) => scoreboard(ref, w, 600)));
    const games = boards.flatMap((b, i) => (b?.games ?? []).filter((g) => g.isPlayoffs && !g.isConsolation && g.home && g.away).map((g) => ({ g, week: weeks[i] })));
    if (games.length === 0) return [];
    const first = Math.min(...games.map((x) => x.week));
    return bracketFrom(
      games.map(({ g, week }) => ({
        round: week - first + 1,
        t1: g.home!.id,
        t2: g.away!.id,
        winner: g.homeResult === "WIN" ? g.home!.id : g.homeResult === "LOSE" ? g.away!.id : null,
        place: g.isChampionshipGame ? 1 : g.isThirdPlaceGame ? 3 : undefined,
      }))
    );
  },

  async losersBracket() {
    return [];
  },
};
