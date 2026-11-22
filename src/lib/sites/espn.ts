// An ESPN league in Sleeper's shape (see sites/index). ESPN's league feed (the one its own site reads from) can be
// read straight from the browser for a league ESPN shows the public; a private one needs your ESPN login cookies
// (see sites/logins) sent with each request, which only the app's relay can do (see sites/fetch).
//
// Each ESPN team is a roster, its id the roster's id; its manager is the team's (its primary owner's), yours the one
// you've said is yours or else the one your ESPN login says you are. A week is ESPN's scoring period, its matchups
// those of the matchup period it falls in.

import type {
  SleeperBracketMatch,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperRoster,
  SleeperTransaction,
} from "../sleeper";
import type { SiteAdapter } from "./index";
import { previousSeasonId, siteDraftId, siteLeagueId, SiteLeagueRef } from "./ids";
import { siteJson } from "./fetch";
import { getLogins, swidCookie } from "./logins";
import { mapPlayers, SitePlayer } from "./player-map";
import { bracketFrom, orderStarters, rosterPositions, rosterSettings, transaction } from "./shape";
import { managerId } from "./teams";

const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

interface EspnPlayer {
  id: number;
  fullName?: string;
  defaultPositionId?: number;
  proTeamId?: number;
}

interface EspnEntry {
  playerId: number;
  lineupSlotId: number;
  playerPoolEntry?: { appliedStatTotal?: number; player?: EspnPlayer };
}

interface EspnTeam {
  id: number;
  name?: string;
  location?: string;
  nickname?: string;
  abbrev?: string;
  logo?: string;
  owners?: string[];
  primaryOwner?: string;
  record?: { overall?: { wins?: number; losses?: number; ties?: number; pointsFor?: number; pointsAgainst?: number; streakLength?: number; streakType?: string } };
  roster?: { entries?: EspnEntry[] };
}

interface EspnSide {
  teamId: number;
  totalPoints?: number;
  totalPointsLive?: number;
  rosterForCurrentScoringPeriod?: { entries?: EspnEntry[] };
  rosterForMatchupPeriod?: { entries?: EspnEntry[] };
}

interface EspnGame {
  id: number;
  matchupPeriodId: number;
  home?: EspnSide;
  away?: EspnSide;
  winner?: string;
  playoffTierType?: string;
}

interface EspnLeague {
  seasonId?: number;
  settings?: {
    name?: string;
    size?: number;
    scoringSettings?: { scoringItems?: { statId: number; points: number; pointsOverrides?: Record<string, number> }[] };
    rosterSettings?: { lineupSlotCounts?: Record<string, number> };
    scheduleSettings?: { matchupPeriodCount?: number; playoffTeamCount?: number; matchupPeriods?: Record<string, number[]> };
    draftSettings?: { type?: string; date?: number; pickOrder?: number[]; keeperCount?: number };
  };
  status?: { isActive?: boolean; previousSeasons?: number[]; currentMatchupPeriod?: number };
  members?: { id: string; displayName?: string; firstName?: string; lastName?: string; isLeagueManager?: boolean }[];
  teams?: EspnTeam[];
  schedule?: EspnGame[];
  draftDetail?: { drafted?: boolean; picks?: { overallPickNumber: number; roundId: number; roundPickNumber: number; playerId: number; teamId: number }[] };
  transactions?: { id: string; type: string; status: string; proposedDate?: number; processDate?: number; bidAmount?: number; items?: { playerId: number; fromTeamId: number; toTeamId: number; type: string }[] }[];
}

/** ESPN's NFL teams by its ids for them, as Sleeper writes them. */
const PRO_TEAM: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND",
  12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI",
  23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

const POSITION: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };

/** ESPN's lineup slots, by its ids for them, as Sleeper names them (the ones it has). */
const SLOT: Record<number, string> = {
  0: "QB", 2: "RB", 3: "WRRB_FLEX", 4: "WR", 5: "REC_FLEX", 6: "TE", 7: "SUPER_FLEX", 8: "DL", 9: "DL", 10: "LB",
  11: "DL", 12: "DB", 13: "DB", 14: "DB", 15: "IDP_FLEX", 16: "DEF", 17: "K", 23: "FLEX",
};
const BENCH = 20;
const IR = 21;

/** ESPN's scoring stats, by its ids for them, as Sleeper names them (the ones it has a like for). */
const STAT: Record<number, string[]> = {
  0: ["pass_att"], 1: ["pass_cmp"], 3: ["pass_yd"], 4: ["pass_td"], 19: ["pass_2pt"], 20: ["pass_int"],
  23: ["rush_att"], 24: ["rush_yd"], 25: ["rush_td"], 26: ["rush_2pt"],
  42: ["rec_yd"], 43: ["rec_td"], 44: ["rec_2pt"], 53: ["rec"], 58: ["rec_tgt"],
  68: ["fum"], 72: ["fum_lost"],
  74: ["fgm_50p"], 77: ["fgm_40_49"], 80: ["fgm_0_19", "fgm_20_29", "fgm_30_39"], 85: ["fgmiss"], 86: ["xpm"], 88: ["xpmiss"],
  89: ["pts_allow_0"], 90: ["pts_allow_1_6"], 91: ["pts_allow_7_13"], 92: ["pts_allow_14_20"], 121: ["pts_allow_14_20"],
  122: ["pts_allow_21_27"], 123: ["pts_allow_28_34"], 124: ["pts_allow_35p"], 125: ["pts_allow_35p"],
  95: ["int"], 96: ["fum_rec"], 97: ["blk_kick"], 98: ["safe"], 99: ["sack"], 101: ["st_td"], 102: ["st_td"],
  103: ["def_td"], 104: ["def_td"],
};

/** A league's scoring in Sleeper's terms (its scoring_settings): each stat ESPN scores that Sleeper has a like for. */
export function espnScoring(items: { statId: number; points: number; pointsOverrides?: Record<string, number> }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    for (const key of STAT[item.statId] ?? []) if (!(key in out)) out[key] = item.points;
    // A tight end's catches worth more (ESPN's points for one at its TE slot, 6): Sleeper's bonus on top.
    const te = item.pointsOverrides?.["6"];
    if (item.statId === 53 && te != null && te !== item.points) out.bonus_rec_te = te - item.points;
  }
  return out;
}

/** A player as ESPN gives him (on a roster, his details; in a transaction, his id alone). */
function sitePlayer(id: number, p?: EspnPlayer): SitePlayer {
  // A defense: ESPN's id for it is -16000 less its team's.
  if (id < 0) {
    const team = PRO_TEAM[-16000 - id] ?? null;
    return { id: String(id), name: `${team ?? ""} D/ST`, position: "DEF", team };
  }
  return {
    id: String(id),
    name: p?.fullName ?? `Player ${id}`,
    position: POSITION[p?.defaultPositionId ?? 0] ?? "UNK",
    team: PRO_TEAM[p?.proTeamId ?? 0] ?? null,
  };
}

const playersOf = (entries: EspnEntry[]) => entries.map((e) => sitePlayer(e.playerId, e.playerPoolEntry?.player));

/** ESPN's league feed with these views (and anything else asked), kept `ttl` seconds — with your login if there's one. */
async function feed(ref: SiteLeagueRef, views: string[], ttl: number, extra = ""): Promise<EspnLeague | null> {
  const url = `${BASE}/${ref.season}/segments/0/leagues/${ref.id}?${views.map((v) => `view=${v}`).join("&")}${extra}`;
  const open = await siteJson<EspnLeague>({ url }, ttl);
  if (open) return open;
  const login = getLogins().espn;
  if (!login) return null;
  return siteJson<EspnLeague>({ url, cookies: { espn_s2: login.s2, SWID: swidCookie(login.swid) } }, ttl);
}

const info = (ref: SiteLeagueRef) => feed(ref, ["mSettings", "mTeam", "mStatus", "mDraftDetail"], 300);

const teamName = (t: EspnTeam) => t.name?.trim() || `${t.location ?? ""} ${t.nickname ?? ""}`.trim() || t.abbrev || `Team ${t.id}`;

/** Whether your ESPN login is one of a team's owners. */
function loggedInAs(t: EspnTeam): boolean {
  const swid = getLogins().espn?.swid;
  return swid != null && (t.owners ?? []).some((o) => o.toLowerCase() === swidCookie(swid).toLowerCase());
}

/** The matchup period a week (a scoring period) is in. */
function periodOf(d: EspnLeague | null, week: number): number {
  const periods = d?.settings?.scheduleSettings?.matchupPeriods ?? {};
  for (const [period, weeks] of Object.entries(periods)) if (weeks.includes(week)) return Number(period);
  return week;
}

/** Sleeper's lineup slot counts from ESPN's (bench and IR aside). */
function slotCounts(d: EspnLeague | null): { counts: Record<string, number>; bench: number } {
  const counts: Record<string, number> = {};
  let bench = 0;
  for (const [slot, n] of Object.entries(d?.settings?.rosterSettings?.lineupSlotCounts ?? {})) {
    const id = Number(slot);
    if (id === BENCH) bench = n;
    else if (SLOT[id] && n > 0) counts[SLOT[id]] = (counts[SLOT[id]] ?? 0) + n;
  }
  return { counts, bench };
}

/** A team's lineup: its players, its starters in the league's slots, and who's on IR. */
async function lineup(ref: SiteLeagueRef, d: EspnLeague | null, entries: EspnEntry[]) {
  const ids = await mapPlayers("espn", playersOf(entries));
  const { counts, bench } = slotCounts(d);
  const positions = rosterPositions(counts, bench);
  const idOf = (e: EspnEntry) => ids.get(String(e.playerId)) ?? `espn:${e.playerId}`;
  const starters = entries.filter((e) => e.lineupSlotId !== BENCH && e.lineupSlotId !== IR).map((e) => ({ id: idOf(e), slot: SLOT[e.lineupSlotId] ?? "FLEX" }));
  return {
    players: entries.map(idOf),
    starters: orderStarters(positions, starters),
    reserve: entries.filter((e) => e.lineupSlotId === IR).map(idOf),
    points: Object.fromEntries(entries.map((e) => [idOf(e), e.playerPoolEntry?.appliedStatTotal ?? 0])),
  };
}

const winnerOf = (g: EspnGame) => (g.winner === "HOME" ? g.home?.teamId : g.winner === "AWAY" ? g.away?.teamId : null) ?? null;

async function bracket(ref: SiteLeagueRef, tiers: string[], third?: string): Promise<SleeperBracketMatch[]> {
  const d = await feed(ref, ["mMatchupScore"], 300);
  const games = (d?.schedule ?? []).filter((g) => g.away && (tiers.includes(g.playoffTierType ?? "") || g.playoffTierType === third));
  if (games.length === 0) return [];
  const first = Math.min(...games.map((g) => g.matchupPeriodId));
  const last = Math.max(...games.map((g) => g.matchupPeriodId));
  return bracketFrom(
    games
      // The game for third, only in the last round (the rest of ESPN's ladder places further down).
      .filter((g) => g.playoffTierType !== third || g.matchupPeriodId === last)
      .map((g) => ({
        round: g.matchupPeriodId - first + 1,
        t1: g.home?.teamId ?? null,
        t2: g.away?.teamId ?? null,
        winner: winnerOf(g),
        place: g.matchupPeriodId !== last ? undefined : g.playoffTierType === third ? 3 : 1,
      }))
  );
}

export const espn: SiteAdapter = {
  async league(ref) {
    const d = await info(ref);
    if (!d?.settings) return null;
    const s = d.settings;
    const { counts, bench } = slotCounts(d);
    const periods = s.scheduleSettings?.matchupPeriods ?? {};
    const regular = s.scheduleSettings?.matchupPeriodCount ?? 14;
    const picks = d.draftDetail?.picks ?? [];
    const leagueId = siteLeagueId(ref);
    const league: SleeperLeague = {
      league_id: leagueId,
      name: s.name ?? `ESPN league ${ref.id}`,
      season: ref.season,
      season_type: "regular",
      sport: "nfl",
      status: d.status?.isActive === false ? "complete" : d.draftDetail?.drafted ? "in_season" : "pre_draft",
      avatar: null,
      previous_league_id: (d.status?.previousSeasons ?? []).includes(Number(ref.season) - 1) ? previousSeasonId(ref) : null,
      draft_id: siteDraftId(leagueId),
      settings: {
        num_teams: s.size ?? d.teams?.length ?? 0,
        playoff_week_start: periods[String(regular + 1)]?.[0] ?? regular + 1,
        playoff_teams: s.scheduleSettings?.playoffTeamCount,
        type: (s.draftSettings?.keeperCount ?? 0) > 0 ? 1 : 0,
        draft_rounds: picks.length ? Math.max(...picks.map((p) => p.roundId)) : undefined,
      },
      scoring_settings: espnScoring(s.scoringSettings?.scoringItems ?? []),
      roster_positions: rosterPositions(counts, bench),
    };
    return league;
  },

  async users(ref) {
    const d = await info(ref);
    const leagueId = siteLeagueId(ref);
    return (d?.teams ?? []).map((t): SleeperLeagueUser => {
      const owner = t.primaryOwner ?? t.owners?.[0];
      const member = d?.members?.find((m) => m.id === owner);
      const mine = loggedInAs(t);
      return {
        user_id: managerId(leagueId, t.id, mine),
        username: null,
        display_name: member?.displayName || [member?.firstName, member?.lastName].filter(Boolean).join(" ") || teamName(t),
        avatar: null,
        is_owner: Boolean(mine && member?.isLeagueManager),
        metadata: { team_name: teamName(t), avatar: t.logo ?? null },
      };
    });
  },

  async rosters(ref) {
    const [d, r] = await Promise.all([info(ref), feed(ref, ["mRoster", "mTeam"], 60)]);
    const leagueId = siteLeagueId(ref);
    return Promise.all(
      (r?.teams ?? []).map(async (t): Promise<SleeperRoster> => {
        const team = d?.teams?.find((x) => x.id === t.id) ?? t;
        const rec = team.record?.overall ?? t.record?.overall ?? {};
        const l = await lineup(ref, d, t.roster?.entries ?? []);
        return {
          roster_id: t.id,
          owner_id: managerId(leagueId, t.id, loggedInAs(team)),
          league_id: leagueId,
          players: l.players,
          starters: l.starters,
          reserve: l.reserve,
          settings: rosterSettings({ wins: rec.wins ?? 0, losses: rec.losses ?? 0, ties: rec.ties ?? 0, pointsFor: rec.pointsFor ?? 0, pointsAgainst: rec.pointsAgainst ?? 0 }),
          metadata: rec.streakLength ? { streak: `${rec.streakLength}${rec.streakType === "WIN" ? "W" : "L"}` } : null,
        };
      })
    );
  },

  async matchups(ref, week, ttl) {
    const [d, m] = await Promise.all([info(ref), feed(ref, ["mMatchup", "mMatchupScore"], Math.min(ttl, 60), `&scoringPeriodId=${week}`)]);
    const period = periodOf(d, week);
    const games = (m?.schedule ?? []).filter((g) => g.matchupPeriodId === period);
    const out: SleeperMatchup[] = [];
    let n = 0;
    for (const g of games) {
      const matchupId = g.home && g.away ? ++n : null;
      for (const side of [g.home, g.away]) {
        if (!side) continue;
        const l = await lineup(ref, d, side.rosterForCurrentScoringPeriod?.entries ?? side.rosterForMatchupPeriod?.entries ?? []);
        out.push({
          roster_id: side.teamId,
          matchup_id: matchupId,
          points: side.totalPointsLive ?? side.totalPoints ?? 0,
          players: l.players,
          starters: l.starters,
          players_points: l.points,
        });
      }
    }
    return out;
  },

  async transactions(ref, week) {
    const d = await feed(ref, ["mTransactions2"], 60, `&scoringPeriodId=${week}`);
    const done = (d?.transactions ?? []).filter((t) => t.status === "EXECUTED" && ["TRADE_ACCEPT", "FREEAGENT", "WAIVER"].includes(t.type));
    const ids = await mapPlayers("espn", done.flatMap((t) => (t.items ?? []).map((i) => sitePlayer(i.playerId))));
    return done.map((t): SleeperTransaction => {
      const adds: Record<string, number> = {};
      const drops: Record<string, number> = {};
      for (const i of t.items ?? []) {
        const id = ids.get(String(i.playerId)) ?? `espn:${i.playerId}`;
        if (i.type === "ADD" || i.type === "TRADE") adds[id] = i.toTeamId;
        if (i.type === "DROP" || i.type === "TRADE") drops[id] = i.fromTeamId;
      }
      return transaction({
        id: t.id,
        type: t.type === "TRADE_ACCEPT" ? "trade" : t.type === "WAIVER" ? "waiver" : "free_agent",
        at: t.processDate ?? t.proposedDate ?? 0,
        week,
        adds,
        drops,
        bid: t.type === "WAIVER" ? t.bidAmount : undefined,
      });
    });
  },

  // (ESPN leagues don't trade future picks.)
  async tradedPicks() {
    return [];
  },

  async drafts(ref) {
    const d = await info(ref);
    if (!d?.settings) return [];
    const ds = d.settings.draftSettings ?? {};
    const picks = d.draftDetail?.picks ?? [];
    const { counts, bench } = slotCounts(d);
    const draft: SleeperDraft = {
      draft_id: siteDraftId(siteLeagueId(ref)),
      season: ref.season,
      status: d.draftDetail?.drafted ? "complete" : "pre_draft",
      type: ds.type === "AUCTION" ? "auction" : "snake",
      start_time: ds.date ?? null,
      slot_to_roster_id: Object.fromEntries((ds.pickOrder ?? []).map((teamId, i) => [String(i + 1), teamId])),
      settings: { rounds: picks.length ? Math.max(...picks.map((p) => p.roundId)) : Object.values(counts).reduce((a, b) => a + b, bench) },
    };
    return [draft];
  },

  async draftPicks(ref) {
    const d = await info(ref);
    const picks = (d?.draftDetail?.picks ?? []).filter((p) => p.playerId > 0 || p.playerId < -16000);
    const teams = d?.settings?.size ?? d?.teams?.length ?? 0;
    const ids = await mapPlayers("espn", picks.map((p) => sitePlayer(p.playerId)));
    const snake = d?.settings?.draftSettings?.type !== "AUCTION";
    return picks.map(
      (p): SleeperDraftPick => ({
        round: p.roundId,
        pick_no: p.overallPickNumber,
        draft_slot: snake && p.roundId % 2 === 0 ? teams + 1 - p.roundPickNumber : p.roundPickNumber,
        roster_id: p.teamId,
        player_id: ids.get(String(p.playerId)) ?? `espn:${p.playerId}`,
      })
    );
  },

  winnersBracket: (ref) => bracket(ref, ["WINNERS_BRACKET"], "WINNERS_CONSOLATION_LADDER"),
  losersBracket: (ref) => bracket(ref, ["LOSERS_CONSOLATION_LADDER"]),
};
