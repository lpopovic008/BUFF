/**
 * TEMPORARY diagnostic probe: dumps every linked season of every league this
 * user plays in — league settings, rosters, both playoff brackets, and every
 * week's real matchup results — so final-placement logic can be written
 * against what Sleeper actually returns rather than assumptions.
 *
 * Runs in CI (see .github/workflows/probe-league-history.yml), where the
 * runner can actually reach api.sleeper.app. Delete once the finish
 * calculation is fixed and verified.
 */

const BASE = "https://api.sleeper.app/v1";
const USERNAME = process.env.SLEEPER_USERNAME || "lpop8";
const SEASONS = ["2026", "2025", "2024", "2023", "2022"];

interface AnyObj {
  [key: string]: unknown;
}

async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text === "null") return null;
  return JSON.parse(text) as T;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

async function dumpLeague(leagueId: string) {
  const league = await get<AnyObj>(`/league/${leagueId}`);
  if (!league) {
    console.log(`!! league ${leagueId} not found`);
    return null;
  }

  const [rosters, users, winners, losers] = await Promise.all([
    get<AnyObj[]>(`/league/${leagueId}/rosters`),
    get<AnyObj[]>(`/league/${leagueId}/users`),
    get<AnyObj[]>(`/league/${leagueId}/winners_bracket`),
    get<AnyObj[]>(`/league/${leagueId}/losers_bracket`),
  ]);

  console.log(`\n${"=".repeat(78)}`);
  console.log(`LEAGUE "${league.name}" season=${league.season} id=${leagueId} status=${league.status}`);
  console.log(`previous_league_id=${league.previous_league_id}`);
  console.log(`settings=${JSON.stringify(league.settings)}`);
  console.log(`roster_positions=${JSON.stringify(league.roster_positions)}`);

  const usersById = new Map((users ?? []).map((u) => [String(u.user_id), u]));
  console.log(`\n-- rosters (settings snapshot as Sleeper reports it) --`);
  for (const r of rosters ?? []) {
    const s = (r.settings ?? {}) as AnyObj;
    const u = r.owner_id ? usersById.get(String(r.owner_id)) : undefined;
    const meta = (u?.metadata ?? {}) as AnyObj;
    console.log(
      `  roster ${r.roster_id} owner=${r.owner_id} "${u?.display_name ?? "?"}" team="${meta.team_name ?? ""}" ` +
        `W-L-T=${num(s.wins)}-${num(s.losses)}-${num(s.ties)} ` +
        `pf=${num(s.fpts)}.${num(s.fpts_decimal)} pa=${num(s.fpts_against)}.${num(s.fpts_against_decimal)} ` +
        `settings=${JSON.stringify(s)}`
    );
  }

  console.log(`\n-- winners_bracket --`);
  console.log(JSON.stringify(winners, null, 1));
  console.log(`\n-- losers_bracket --`);
  console.log(JSON.stringify(losers, null, 1));

  console.log(`\n-- matchups by week (roster=points) --`);
  for (let week = 1; week <= 18; week++) {
    const ms = await get<AnyObj[]>(`/league/${leagueId}/matchups/${week}`);
    if (!ms || ms.length === 0) {
      console.log(`  W${week}: (none)`);
      continue;
    }
    const scored = ms.filter((m) => num(m.points) > 0).length;
    const byMatchup = new Map<string, string[]>();
    for (const m of ms) {
      const key = m.matchup_id == null ? `bye${m.roster_id}` : String(m.matchup_id);
      const list = byMatchup.get(key) ?? [];
      list.push(`r${m.roster_id}=${num(m.points).toFixed(2)}`);
      byMatchup.set(key, list);
    }
    const parts = [...byMatchup.entries()].map(([id, teams]) => `[${id}: ${teams.join(" vs ")}]`);
    console.log(`  W${week} (${scored}/${ms.length} scored): ${parts.join(" ")}`);
  }

  return String(league.previous_league_id ?? "") || null;
}

async function main() {
  const user = await get<AnyObj>(`/user/${encodeURIComponent(USERNAME)}`);
  if (!user) {
    console.log(`No Sleeper user "${USERNAME}"`);
    process.exitCode = 1;
    return;
  }
  console.log(`user ${USERNAME} -> ${user.user_id}`);

  const roots = new Map<string, string>();
  for (const season of SEASONS) {
    const leagues = await get<AnyObj[]>(`/user/${user.user_id}/leagues/nfl/${season}`);
    for (const l of leagues ?? []) {
      roots.set(String(l.league_id), `${l.name} (${l.season})`);
    }
  }
  console.log(`\nfound ${roots.size} league-seasons directly:`);
  for (const [id, label] of roots) console.log(`  ${id} ${label}`);

  const visited = new Set<string>();
  for (const id of roots.keys()) {
    let cursor: string | null = id;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      cursor = await dumpLeague(cursor);
    }
  }
}

main().catch((err) => {
  console.error("probe failed:", err);
  process.exitCode = 1;
});
