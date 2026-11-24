// notify: sends each person's push notifications — their players scoring, lineup problems, how their matchups went,
// trades in their leagues (see logic.ts for what's sent when). A Supabase Edge Function (Deno), run every minute by
// pg_cron (see supabase/push.sql), set up once as docs/app-store.md says.
//
// Each run: the phones with notifications on (push_devices) and whose accounts they're signed in to; each account's
// Sleeper leagues, from what it's synced (app_data's config); the week's games and live plays, from ESPN; the
// leagues' rosters, matchups and trades, from Sleeper; then what's new for each, sent through Apple's push service
// (APNs), each notification once (push_sent). Leagues on other sites aren't watched yet.
//
// Secrets (Edge Functions → Secrets): NOTIFY_SECRET (the same as the vault's notify_secret, so only the schedule can
// run it), APNS_KEY (the .p8 key's text), APNS_KEY_ID, APPLE_TEAM_ID. "Verify JWT" off: the schedule calls it with
// its secret, not a user's token. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are Supabase's own.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Game, LeagueWeek, lineupNotes, Note, NoteKind, Play, Player, resultNotes, scoringNotes, Trade, tradeNotes } from "./logic.ts";

const SLEEPER = "https://api.sleeper.app/v1";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const BUNDLE_ID = "com.lukapopovic.commish";
/** The most notifications one person's sent in a run (a flood, after a long quiet, held to this). */
const MOST_PER_RUN = 6;
const PLAYERS_FRESH_MS = 60 * 60_000;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** ESPN's team abbreviations as Sleeper writes them. */
const team = (abbr: string | undefined | null) => (abbr === "WSH" ? "WAS" : (abbr ?? null));

// ---- NFL players (kept in nfl_players, refreshed hourly from Sleeper's whole list)

async function refreshPlayers(): Promise<void> {
  const { data } = await db.from("nfl_players").select("updated_at").order("updated_at", { ascending: false }).limit(1);
  const last = data?.[0]?.updated_at ? Date.parse(data[0].updated_at) : 0;
  if (Date.now() - last < PLAYERS_FRESH_MS) return;
  type Raw = { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string | null; injury_status?: string | null; active?: boolean };
  const all = await json<Record<string, Raw>>(`${SLEEPER}/players/nfl`);
  if (!all) return;
  const now = new Date().toISOString();
  const rows = Object.entries(all)
    .filter(([id, p]) => p.active !== false && ["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position ?? "") && (p.team || /^[A-Z]+$/.test(id)))
    .map(([id, p]) => ({
      id,
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || id,
      position: p.position!,
      team: p.team ?? null,
      injury: p.injury_status ?? null,
      updated_at: now,
    }));
  for (let i = 0; i < rows.length; i += 500) await db.from("nfl_players").upsert(rows.slice(i, i + 500));
}

async function playersById(ids: string[]): Promise<Map<string, Player>> {
  const out = new Map<string, Player>();
  const unique = [...new Set(ids.filter((id) => id && id !== "0"))];
  for (let i = 0; i < unique.length; i += 300) {
    const { data } = await db.from("nfl_players").select("id,name,position,team,injury").in("id", unique.slice(i, i + 300));
    for (const p of data ?? []) out.set(p.id, p as Player);
  }
  return out;
}

// ---- The week's games and plays (ESPN)

async function weekGames(season: string, week: number): Promise<Game[]> {
  type Comp = { competitors?: { homeAway: string; team?: { abbreviation?: string } }[]; status?: { type?: { state?: string } }; date?: string };
  const d = await json<{ events?: { id: string; date?: string; competitions?: Comp[] }[] }>(`${ESPN}/scoreboard?seasontype=2&week=${week}&dates=${season}`);
  return (d?.events ?? []).flatMap((e) => {
    const c = e.competitions?.[0];
    const home = c?.competitors?.find((x) => x.homeAway === "home")?.team?.abbreviation;
    const away = c?.competitors?.find((x) => x.homeAway === "away")?.team?.abbreviation;
    if (!home || !away) return [];
    const state = c?.status?.type?.state;
    return [{ id: e.id, home: team(home)!, away: team(away)!, state: state === "in" || state === "post" ? state : "pre", kickoff: Date.parse(c?.date ?? e.date ?? "") || 0 } as Game];
  });
}

async function gamePlays(gameId: string): Promise<Play[]> {
  type RawPlay = { id?: string | number; text?: string; type?: { text?: string }; scoringPlay?: boolean; isTurnover?: boolean; wallclock?: string };
  type Drive = { team?: { abbreviation?: string }; plays?: RawPlay[] };
  const d = await json<{ drives?: { previous?: Drive[]; current?: Drive } }>(`${ESPN}/summary?event=${gameId}`);
  const drives = [...(d?.drives?.previous ?? []), ...(d?.drives?.current ? [d.drives.current] : [])];
  return drives.flatMap((drive) =>
    (drive.plays ?? [])
      .filter((p) => p.id != null && typeof p.text === "string")
      .map((p) => ({
        id: String(p.id),
        gameId,
        text: p.text!.replace(/^\s*\([^)]*\)\s*/, ""),
        type: p.type?.text ?? "",
        offense: team(drive.team?.abbreviation),
        scoring: p.scoringPlay === true,
        turnover: p.isTurnover === true,
        at: p.wallclock ? Date.parse(p.wallclock) : null,
      }))
  );
}

// ---- Leagues (Sleeper)

interface LeagueData {
  name: string;
  rosters: { roster_id: number; owner_id: string | null; co_owners?: string[] | null; starters?: string[] | null }[];
  teams: Record<number, string>;
  matchups: { roster_id: number; matchup_id: number | null; points: number; starters?: string[] | null }[];
  trades: Trade[];
}

async function leagueData(leagueId: string, week: number): Promise<LeagueData | null> {
  type Txn = { transaction_id: string; type: string; status: string; created: number; roster_ids: number[]; adds: Record<string, number> | null; draft_picks?: { season: string; round: number; owner_id: number }[] };
  const [league, rosters, users, matchups, txns] = await Promise.all([
    json<{ name: string }>(`${SLEEPER}/league/${leagueId}`),
    json<LeagueData["rosters"]>(`${SLEEPER}/league/${leagueId}/rosters`),
    json<{ user_id: string; display_name: string; metadata?: { team_name?: string } }[]>(`${SLEEPER}/league/${leagueId}/users`),
    json<LeagueData["matchups"]>(`${SLEEPER}/league/${leagueId}/matchups/${week}`),
    json<Txn[]>(`${SLEEPER}/league/${leagueId}/transactions/${week}`),
  ]);
  if (!league || !rosters) return null;
  const teams: Record<number, string> = {};
  for (const r of rosters) {
    const u = users?.find((x) => x.user_id === r.owner_id);
    teams[r.roster_id] = u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`;
  }
  const trades = (txns ?? [])
    .filter((t) => t.type === "trade" && t.status === "complete")
    .map((t) => ({ id: t.transaction_id, created: t.created, rosterIds: t.roster_ids, adds: t.adds ?? {}, picks: (t.draft_picks ?? []).map((p) => ({ season: p.season, round: p.round, ownerId: p.owner_id })) }));
  return { name: league.name, rosters, teams, matchups: matchups ?? [], trades };
}

// ---- Sending (APNs)

let apnsJwt: { token: string; at: number } | null = null;

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === "string" ? bytes : String.fromCharCode(...bytes))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

/** The signed token Apple's push service takes (good for an hour; made anew every 50 minutes). */
async function apnsToken(): Promise<string> {
  if (apnsJwt && Date.now() - apnsJwt.at < 50 * 60_000) return apnsJwt.token;
  const pem = Deno.env.get("APNS_KEY") ?? "";
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: Deno.env.get("APNS_KEY_ID") }));
  const claims = b64url(JSON.stringify({ iss: Deno.env.get("APPLE_TEAM_ID"), iat: Math.floor(Date.now() / 1000) }));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${claims}`)));
  apnsJwt = { token: `${head}.${claims}.${b64url(signature)}`, at: Date.now() };
  return apnsJwt.token;
}

/** Sends one notification to one device: true if it went, false if the device is gone (and should be forgotten). */
async function send(token: string, note: Note): Promise<boolean> {
  const body = JSON.stringify({ aps: { alert: { title: note.title, body: note.body }, sound: "default", "thread-id": note.kind }, path: note.path });
  const headers = { authorization: `bearer ${await apnsToken()}`, "apns-topic": BUNDLE_ID, "apns-push-type": "alert", "apns-priority": "10" };
  // App Store and TestFlight builds use Apple's production service; a build run from Xcode, its sandbox.
  for (const host of ["api.push.apple.com", "api.sandbox.push.apple.com"]) {
    const res = await fetch(`https://${host}/3/device/${token}`, { method: "POST", headers, body });
    if (res.ok) return true;
    const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason;
    if (res.status === 410 || reason === "Unregistered") return false;
    if (reason !== "BadDeviceToken") return true;
  }
  return false;
}

// ---- A run

Deno.serve(async (req) => {
  if (req.headers.get("x-notify-secret") !== Deno.env.get("NOTIFY_SECRET")) return new Response("No", { status: 401 });

  const { data: devices } = await db.from("push_devices").select("token,user_id,prefs");
  if (!devices?.length) return Response.json({ sent: 0 });

  const state = await json<{ week: number; season: string; season_type: string }>(`${SLEEPER}/state/nfl`);
  if (!state || (state.season_type !== "regular" && state.season_type !== "post")) return Response.json({ sent: 0, quiet: "offseason" });
  const { week, season } = state;

  await refreshPlayers();

  // Each account's Sleeper leagues (not hidden) and Sleeper id, from what it's synced.
  const userIds = [...new Set(devices.map((d) => d.user_id as string))];
  const { data: synced } = await db.from("app_data").select("user_id,data").in("user_id", userIds);
  type Config = { sleeperUserId?: string | null; leagues?: { leagueId: string; hidden?: boolean }[] };
  const people = (synced ?? []).map((row) => {
    const config = ((row.data as { config?: Config })?.config ?? {}) as Config;
    return { userId: row.user_id as string, me: config.sleeperUserId ?? null, leagues: (config.leagues ?? []).filter((l) => !l.hidden && /^\d+$/.test(l.leagueId)).map((l) => l.leagueId) };
  });

  const leagueIds = [...new Set(people.flatMap((p) => p.leagues))];
  const leagues = new Map<string, LeagueData>();
  await Promise.all(leagueIds.map(async (id) => {
    const d = await leagueData(id, week);
    if (d) leagues.set(id, d);
  }));

  const games = await weekGames(season, week);
  // Plays from the games under way, and those over within the last hour or so (their last plays still news).
  const recent = games.filter((g) => g.state === "in" || (g.state === "post" && Date.now() - g.kickoff < 5 * 3_600_000));
  const plays = (await Promise.all(recent.map((g) => gamePlays(g.id)))).flat();

  // Every starter's (and traded player's) name, team and injury.
  const ids = [...leagues.values()].flatMap((l) => [...l.matchups.flatMap((m) => m.starters ?? []), ...l.rosters.flatMap((r) => r.starters ?? []), ...l.trades.flatMap((t) => Object.keys(t.adds))]);
  const players = await playersById(ids);

  let sent = 0;
  const now = Date.now();
  for (const person of people) {
    // Each device wants its own kinds (see the app's Settings → Notifications): worked out for any that wants it.
    const theirs = devices.filter((d) => d.user_id === person.userId);
    const wants = (d: (typeof theirs)[number], k: NoteKind) => ((d.prefs ?? {}) as Partial<Record<NoteKind, boolean>>)[k] !== false;
    const on = (k: NoteKind) => theirs.some((d) => wants(d, k));
    const weeks: LeagueWeek[] = person.leagues.flatMap((id) => {
      const l = leagues.get(id);
      if (!l) return [];
      const mine = l.rosters.find((r) => r.owner_id === person.me || (r.co_owners ?? []).includes(person.me ?? ""));
      const myMatchup = mine ? l.matchups.find((m) => m.roster_id === mine.roster_id) : undefined;
      return [{
        leagueId: id,
        name: l.name,
        week,
        myRosterId: mine?.roster_id ?? null,
        teams: l.teams,
        starters: myMatchup?.starters ?? mine?.starters ?? [],
        matchups: l.matchups.map((m) => ({ rosterId: m.roster_id, matchupId: m.matchup_id, points: m.points ?? 0 })),
        trades: l.trades,
      }];
    });

    const notes: Note[] = [];
    if (on("scoring")) {
      const starters = new Map<string, { player: Player; leagues: string[] }>();
      for (const w of weeks) for (const id of w.starters) {
        const p = players.get(id);
        if (!p) continue;
        const s = starters.get(id) ?? { player: p, leagues: [] };
        s.leagues.push(w.name);
        starters.set(id, s);
      }
      notes.push(...scoringNotes(plays, starters, now));
    }
    for (const w of weeks) {
      if (on("lineup")) notes.push(...lineupNotes(w, players, games, now));
      if (on("results")) notes.push(...resultNotes(w, games));
      if (on("trades")) notes.push(...tradeNotes(w, players, now));
    }
    if (notes.length === 0) continue;

    // Only what's not been sent: claimed here first (so two runs never both send it), then sent.
    const { data: claimed } = await db
      .from("push_sent")
      .upsert(notes.map((n) => ({ user_id: person.userId, key: n.key })), { onConflict: "user_id,key", ignoreDuplicates: true })
      .select("key");
    const fresh = new Set((claimed ?? []).map((c) => c.key as string));
    const toSend = notes.filter((n) => fresh.has(n.key)).slice(0, MOST_PER_RUN);
    for (const device of theirs) {
      for (const note of toSend.filter((n) => wants(device, n.kind))) {
        const kept = await send(device.token as string, note);
        if (!kept) {
          await db.from("push_devices").delete().eq("token", device.token);
          break;
        }
        sent++;
      }
    }
  }
  return Response.json({ sent });
});
