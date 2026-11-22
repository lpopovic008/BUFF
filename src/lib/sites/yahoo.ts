// A Yahoo league in Sleeper's shape (see sites/index). Yahoo's Fantasy API needs you signed in to Yahoo — OAuth, its
// secret held by the app's league-sites function (see supabase/functions/league-sites) — and every request goes by
// way of that function, Yahoo's API not being readable from a browser. Signing in finds your Yahoo leagues (see
// myYahooLeagues); your access lasts an hour and is renewed as it runs out.
//
// Each Yahoo team is a roster, its team number the roster's id. Yahoo writes its answers as lists of one-key objects
// and numbered collections; `merged` and `itemsOf` turn them into plain objects and lists.

import type { SleeperDraftPick, SleeperLeague, SleeperLeagueUser, SleeperMatchup, SleeperRoster, SleeperTransaction } from "../sleeper";
import type { SiteAdapter } from "./index";
import { siteDraftId, siteLeagueId, SiteLeagueRef } from "./ids";
import { keep, nflWeekAt, num, relay } from "./fetch";
import { getLogins, setLogin, YahooLogin } from "./logins";
import { mapPlayers, SitePlayer } from "./player-map";
import { bracketFrom, orderStarters, rosterPositions, rosterSettings, transaction } from "./shape";
import { managerId } from "./teams";

type Json = Record<string, unknown>;

/** One of Yahoo's resources ([{a}, {b}, [{c}]] or {a, b}) as one plain object. */
export function merged(v: unknown): Json {
  if (Array.isArray(v)) return v.reduce<Json>((acc, x) => ({ ...acc, ...merged(x) }), {});
  return v && typeof v === "object" ? (v as Json) : {};
}

/** A Yahoo collection ({"0": {team: …}, "1": …, count}) as a list of its `key` resources, each merged. */
export function itemsOf(collection: unknown, key: string): Json[] {
  if (!collection || typeof collection !== "object") return [];
  return Object.entries(collection as Json)
    .filter(([k]) => /^\d+$/.test(k))
    .map(([, v]) => merged((v as Json)?.[key]));
}

/** Yahoo's team key's number ("449.l.12345.t.3" → 3). */
const teamNo = (teamKey: unknown) => Number(String(teamKey ?? "").split(".t.")[1] ?? 0);

/** The Yahoo app's client id, from the league-sites function (where it's kept, beside its secret). */
export function yahooClientId(): Promise<string | null> {
  return keep("yahoo-client", 3600, async () => (await relay<{ clientId?: string }>({ op: "yahoo-client" })).json?.clientId ?? null).catch(() => null);
}

/** Where Yahoo sends you back to once you've signed in: this app's Yahoo page in Settings. */
export function yahooRedirectUri(): string {
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings/yahoo`;
}

/** Yahoo's sign-in page for this app. */
export function yahooSignInUrl(clientId: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: yahooRedirectUri(), response_type: "code", language: "en-us" });
  return `https://api.login.yahoo.com/oauth2/request_auth?${q}`;
}

function saveTokens(t: { access_token?: string; refresh_token?: string; expires_in?: number } | null, keepRefresh?: string): boolean {
  if (!t?.access_token) return false;
  setLogin("yahoo", { accessToken: t.access_token, refreshToken: t.refresh_token ?? keepRefresh ?? "", expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 });
  return true;
}

/** Trades the code Yahoo sent you back with for your access, kept (see sites/logins). Whether it worked. */
export async function finishYahooSignIn(code: string): Promise<boolean> {
  const { json } = await relay<{ access_token?: string; refresh_token?: string; expires_in?: number }>({ op: "yahoo-token", code, redirect_uri: yahooRedirectUri() });
  return saveTokens(json);
}

let renewing: Promise<YahooLogin | null> | null = null;

/** Your Yahoo access, renewed if it's about to run out — null if you're not signed in (or it can't be renewed). */
async function access(): Promise<YahooLogin | null> {
  const login = getLogins().yahoo;
  if (!login) return null;
  if (login.expiresAt - Date.now() > 60_000) return login;
  renewing ??= (async () => {
    const { json } = await relay<{ access_token?: string; refresh_token?: string; expires_in?: number }>({ op: "yahoo-refresh", refresh_token: login.refreshToken });
    return saveTokens(json, login.refreshToken) ? (getLogins().yahoo ?? null) : null;
  })().finally(() => (renewing = null));
  return renewing;
}

/** Yahoo's answer for a path under /fantasy/v2, its fantasy_content, kept `ttl` seconds. */
async function yapi(path: string, ttl: number): Promise<Json | null> {
  return keep(`yahoo:${path}`, ttl, async () => {
    const login = await access();
    if (!login) return null;
    const { status, json } = await relay<{ fantasy_content?: Json }>({ op: "yahoo", path, access_token: login.accessToken });
    return status >= 200 && status < 300 ? (json?.fantasy_content ?? null) : null;
  }).catch(() => null);
}

/** Your Yahoo NFL leagues, every season you've played in, newest first: each one's key, name and season. */
export async function myYahooLeagues(): Promise<{ key: string; name: string; season: string; url?: string }[]> {
  const d = await yapi("users;use_login=1/games;game_codes=nfl/leagues", 300);
  const user = itemsOf(d?.users, "user")[0];
  const games = itemsOf(user?.games, "game");
  return games
    .flatMap((g) => itemsOf(g.leagues, "league"))
    .map((l) => ({ key: String(l.league_key), name: String(l.name ?? l.league_key), season: String(l.season), url: l.url ? String(l.url) : undefined }))
    .sort((a, b) => Number(b.season) - Number(a.season));
}

/** Whether you're signed in to Yahoo here. */
export const yahooSignedIn = () => Boolean(getLogins().yahoo);

const POSITION: Record<string, string> = { DEF: "DEF", "D/ST": "DEF", K: "K" };
const SLOT: Record<string, string> = { "W/R/T": "FLEX", "W/R": "WRRB_FLEX", "W/T": "REC_FLEX", "Q/W/R/T": "SUPER_FLEX", DEF: "DEF", D: "DL", DB: "DB", LB: "LB", DL: "DL" };

function sitePlayer(p: Json): SitePlayer {
  const name = merged(p.name);
  const pos = String(p.display_position ?? p.primary_position ?? "UNK").split(",")[0];
  return {
    id: String(p.player_id),
    name: String(name.full ?? `Player ${p.player_id}`),
    position: POSITION[pos] ?? pos,
    team: p.editorial_team_abbr ? String(p.editorial_team_abbr) : null,
  };
}

const league = (ref: SiteLeagueRef) => yapi(`league/${ref.id};out=settings,standings`, 300).then((d) => (d ? merged(d.league) : null));

function slots(l: Json | null): string[] {
  const settings = merged(l?.settings);
  const counts: Record<string, number> = {};
  let bench = 0;
  for (const rp of (settings.roster_positions as Json[] | undefined) ?? []) {
    const p = merged(rp.roster_position);
    const pos = String(p.position);
    const n = num(p.count);
    if (pos === "BN") bench += n;
    else if (pos !== "IR") counts[SLOT[pos] ?? pos] = (counts[SLOT[pos] ?? pos] ?? 0) + n;
  }
  return rosterPositions(counts, bench);
}

const standingsTeams = (l: Json | null) => itemsOf(merged(l?.standings).teams, "team");

/** A team's players for a week — on its roster, in its slot, with his points that week. */
async function teamWeek(teamKey: string, week: number, ttl: number) {
  const d = await yapi(`team/${teamKey}/roster;week=${week}/players/stats;type=week;week=${week}`, ttl);
  const roster = merged(merged(d?.team).roster);
  return itemsOf(merged(roster["0"]).players, "player");
}

export const yahoo: SiteAdapter = {
  async league(ref) {
    const l = await league(ref);
    if (!l?.league_key) return null;
    const settings = merged(l.settings);
    const leagueId = siteLeagueId(ref);
    // The same league the season before: Yahoo's "renew", its game and league ("423_12345").
    const [game, prev] = String(l.renew ?? "").split("_");
    const out: SleeperLeague = {
      league_id: leagueId,
      name: String(l.name ?? `Yahoo league`),
      season: ref.season,
      season_type: "regular",
      sport: "nfl",
      status: l.is_finished ? "complete" : l.draft_status === "postdraft" ? "in_season" : "pre_draft",
      avatar: null,
      previous_league_id: game && prev ? siteLeagueId({ site: "yahoo", season: String(Number(ref.season) - 1), id: `${game}.l.${prev}` }) : null,
      draft_id: siteDraftId(leagueId),
      settings: {
        num_teams: num(l.num_teams),
        playoff_week_start: num(settings.playoff_start_week) || 15,
        playoff_teams: num(settings.num_playoff_teams) || undefined,
        type: settings.is_keeper || num(settings.max_keepers) > 0 ? 1 : 0,
      },
      roster_positions: slots(l),
    };
    return out;
  },

  async users(ref) {
    const leagueId = siteLeagueId(ref);
    return standingsTeams(await league(ref)).map((t): SleeperLeagueUser => {
      const manager = merged(merged((t.managers as Json[] | undefined)?.[0]).manager);
      const mine = num(t.is_owned_by_current_login) === 1;
      return {
        user_id: managerId(leagueId, num(t.team_id), mine),
        username: null,
        display_name: String(manager.nickname ?? t.name),
        avatar: null,
        is_owner: mine && num(manager.is_commissioner) === 1,
        metadata: { team_name: String(t.name), avatar: String(merged(merged((t.team_logos as Json[] | undefined)?.[0]).team_logo).url ?? "") || null },
      };
    });
  },

  async rosters(ref) {
    const [l, r] = await Promise.all([league(ref), yapi(`league/${ref.id}/teams/roster`, 60)]);
    const teams = itemsOf(merged(r?.league).teams, "team");
    const playersOf = (t: Json) => itemsOf(merged(merged(t.roster)["0"]).players, "player");
    const ids = await mapPlayers("yahoo", teams.flatMap((t) => playersOf(t).map(sitePlayer)));
    const leagueId = siteLeagueId(ref);
    const positions = slots(l);
    return teams.map((t): SleeperRoster => {
      const no = num(t.team_id);
      const st = standingsTeams(l).find((x) => num(x.team_id) === no);
      const ts = merged(st?.team_standings);
      const rec = merged(ts.outcome_totals);
      const streak = merged(ts.streak);
      const ps = playersOf(t);
      const idOf = (p: Json) => ids.get(String(p.player_id)) ?? `yahoo:${p.player_id}`;
      const slot = (p: Json) => String(merged(p.selected_position).position ?? "BN");
      return {
        roster_id: no,
        owner_id: managerId(leagueId, no, num(t.is_owned_by_current_login) === 1),
        league_id: leagueId,
        players: ps.map(idOf),
        starters: orderStarters(positions, ps.filter((p) => !["BN", "IR"].includes(slot(p))).map((p) => ({ id: idOf(p), slot: SLOT[slot(p)] ?? slot(p) }))),
        reserve: ps.filter((p) => slot(p) === "IR").map(idOf),
        settings: rosterSettings({ wins: num(rec.wins), losses: num(rec.losses), ties: num(rec.ties), pointsFor: num(ts.points_for), pointsAgainst: num(ts.points_against) }),
        metadata: streak.value ? { streak: `${streak.value}${streak.type === "win" ? "W" : "L"}` } : null,
      };
    });
  },

  async matchups(ref, week, ttl) {
    const [l, d] = await Promise.all([league(ref), yapi(`league/${ref.id}/scoreboard;week=${week}`, Math.min(ttl, 60))]);
    const board = merged(merged(d?.league).scoreboard);
    const games = itemsOf(merged(board["0"]).matchups, "matchup");
    const positions = slots(l);
    const sides = games.flatMap((g, i) => itemsOf(merged(g["0"]).teams, "team").map((t) => ({ t, matchupId: i + 1 })));
    const weeks = await Promise.all(sides.map(({ t }) => teamWeek(String(t.team_key), week, Math.min(ttl, 60))));
    const ids = await mapPlayers("yahoo", weeks.flat().map(sitePlayer));
    return sides.map(({ t, matchupId }, i): SleeperMatchup => {
      const ps = weeks[i];
      const idOf = (p: Json) => ids.get(String(p.player_id)) ?? `yahoo:${p.player_id}`;
      const slot = (p: Json) => String(merged(p.selected_position).position ?? "BN");
      return {
        roster_id: num(t.team_id),
        matchup_id: matchupId,
        points: num(merged(t.team_points).total),
        players: ps.map(idOf),
        starters: orderStarters(positions, ps.filter((p) => !["BN", "IR"].includes(slot(p))).map((p) => ({ id: idOf(p), slot: SLOT[slot(p)] ?? slot(p) }))),
        players_points: Object.fromEntries(ps.map((p) => [idOf(p), num(merged(p.player_points).total)])),
      };
    });
  },

  async transactions(ref, week) {
    const d = await yapi(`league/${ref.id}/transactions;types=add,drop,trade`, 120);
    const txns = itemsOf(merged(d?.league).transactions, "transaction").filter((t) => t.status === "successful" && nflWeekAt(num(t.timestamp) * 1000, ref.season) === week);
    const players = txns.flatMap((t) => itemsOf(t.players, "player"));
    const ids = await mapPlayers("yahoo", players.map(sitePlayer));
    return txns.map((t): SleeperTransaction => {
      const adds: Record<string, number> = {};
      const drops: Record<string, number> = {};
      for (const p of itemsOf(t.players, "player")) {
        const data = merged(p.transaction_data);
        const id = ids.get(String(p.player_id)) ?? `yahoo:${p.player_id}`;
        if (data.destination_team_key) adds[id] = teamNo(data.destination_team_key);
        if (data.source_team_key) drops[id] = teamNo(data.source_team_key);
      }
      return transaction({
        id: String(t.transaction_key ?? t.transaction_id),
        type: t.type === "trade" ? "trade" : "free_agent",
        at: num(t.timestamp) * 1000,
        week,
        adds,
        drops,
      });
    });
  },

  async tradedPicks() {
    return [];
  },

  async drafts(ref) {
    const [l, d] = await Promise.all([league(ref), yapi(`league/${ref.id}/draftresults`, 600)]);
    if (!l?.league_key) return [];
    const results = itemsOf(merged(d?.league).draft_results, "draft_result");
    const first = results.filter((r) => num(r.round) === 1).sort((a, b) => num(a.pick) - num(b.pick));
    return [
      {
        draft_id: siteDraftId(siteLeagueId(ref)),
        season: ref.season,
        status: l.draft_status === "postdraft" ? "complete" : l.draft_status === "predraft" ? "pre_draft" : "drafting",
        type: "snake",
        start_time: null,
        slot_to_roster_id: Object.fromEntries(first.map((r, i) => [String(i + 1), teamNo(r.team_key)])),
        settings: { rounds: results.length ? Math.max(...results.map((r) => num(r.round))) : undefined },
      },
    ];
  },

  async draftPicks(ref) {
    const d = await yapi(`league/${ref.id}/draftresults`, 600);
    const results = itemsOf(merged(d?.league).draft_results, "draft_result").filter((r) => r.player_key);
    const perRound = results.filter((r) => num(r.round) === 1).length || 1;
    const pid = (r: Json) => String(r.player_key).split(".p.")[1] ?? "";
    const ids = await mapPlayers("yahoo", results.map((r) => ({ id: pid(r), name: `Player ${pid(r)}`, position: "UNK" })));
    return results.map(
      (r): SleeperDraftPick => ({
        round: num(r.round),
        pick_no: num(r.pick),
        draft_slot: ((num(r.pick) - 1) % perRound) + 1,
        roster_id: teamNo(r.team_key),
        player_id: ids.get(pid(r)) ?? `yahoo:${pid(r)}`,
      })
    );
  },

  async winnersBracket(ref) {
    const l = await league(ref);
    const start = num(merged(l?.settings).playoff_start_week);
    if (!start) return [];
    const weeks = [start, start + 1, start + 2];
    const boards = await Promise.all(weeks.map((w) => yapi(`league/${ref.id}/scoreboard;week=${w}`, 600)));
    const games = boards.flatMap((d, i) =>
      itemsOf(merged(merged(merged(d?.league).scoreboard)["0"]).matchups, "matchup")
        .filter((g) => num(g.is_playoffs) === 1 && num(g.is_consolation) !== 1)
        .map((g) => ({ g, round: i + 1 }))
    );
    const last = Math.max(0, ...games.map((x) => x.round));
    return bracketFrom(
      games.map(({ g, round }) => {
        const [a, b] = itemsOf(merged(g["0"]).teams, "team");
        return { round, t1: num(a?.team_id) || null, t2: num(b?.team_id) || null, winner: g.winner_team_key ? teamNo(g.winner_team_key) : null, place: round === last ? 1 : undefined };
      })
    );
  },

  async losersBracket() {
    return [];
  },
};
