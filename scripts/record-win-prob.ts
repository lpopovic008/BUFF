/**
 * The game-day win-probability recorder. Runs every 5 minutes during game
 * hours in GitHub Actions (.github/workflows/win-prob-recorder.yml): for
 * every matchup in the given Sleeper users' leagues, it takes a win-chance
 * reading — the same model, from the same Sleeper points and projections
 * and ESPN game clock, as the league page's live chart (readMatchup in
 * src/lib/win-probability.ts) — and adds it to that league's line in
 * `<dataDir>/winprob/<leagueId>.json`. The workflow keeps those files on the
 * repo's `winprob-data` branch, where the app reads them, so every device
 * sees the whole line even when nobody had the page open.
 *
 * Sleeper publishes no win probability of its own (no field in its public
 * API, nor its app's GraphQL), so this records our model's.
 *
 * Usage: npx tsx scripts/record-win-prob.ts <dataDir>
 * Env: WINPROB_USERNAMES — comma-separated Sleeper usernames whose leagues to
 * record (default: the commish's).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { COMMISH_SLEEPER_USERNAME } from "../src/lib/app-defaults";
import { getWeekGames, NFLGame } from "../src/lib/nfl-schedule";
import { weighProjection } from "../src/lib/sleeper";
import { GameClock, matchupKey, MatchupSide, packLine, readMatchup, unpackLine, withReading, WinProbPoint } from "../src/lib/win-probability";
import type { StoredWeek } from "../src/lib/win-prob-store";

const SLEEPER = "https://api.sleeper.app/v1";
const PROJECTIONS = "https://api.sleeper.app/projections/nfl";

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

interface SleeperMatchupEntry {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  starters: string[] | null;
  players_points: Record<string, number> | null;
}

async function main() {
  const dataDir = process.argv[2] ?? "winprob-data";
  const usernames = (process.env.WINPROB_USERNAMES || COMMISH_SLEEPER_USERNAME)
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  const state = await json<{ season: string; week: number; season_type: string }>(`${SLEEPER}/state/nfl`);
  if (!state || state.season_type !== "regular") {
    console.log(`Not in the regular season (${state?.season_type ?? "no state"}); nothing to record.`);
    return;
  }
  const { season, week } = state;
  const games = await getWeekGames(season, week);
  if (!games.some((g) => g.state !== "pre")) {
    console.log(`Week ${week}: no game has started; nothing to record.`);
    return;
  }
  const gameByTeam = new Map<string, GameClock>();
  for (const g of games as NFLGame[]) {
    gameByTeam.set(g.homeTeam, g);
    gameByTeam.set(g.awayTeam, g);
  }

  const [players, projectionEntries] = await Promise.all([
    json<Record<string, { team?: string | null }>>(`${SLEEPER}/players/nfl`),
    json<{ player_id: string; stats?: Record<string, number> | null }[]>(
      `${PROJECTIONS}/${season}/${week}?season_type=regular&` + ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&")
    ),
  ]);
  if (!players || !projectionEntries) throw new Error("Couldn't load Sleeper's players or projections.");

  const leagueIds = new Set<string>();
  const leagues: { league_id: string; name: string; scoring_settings?: Record<string, number> }[] = [];
  for (const username of usernames) {
    const user = await json<{ user_id: string }>(`${SLEEPER}/user/${encodeURIComponent(username)}`);
    if (!user) continue;
    for (const l of (await json<typeof leagues>(`${SLEEPER}/user/${user.user_id}/leagues/nfl/${season}`)) ?? []) {
      if (!leagueIds.has(l.league_id)) {
        leagueIds.add(l.league_id);
        leagues.push(l);
      }
    }
  }

  const now = Date.now();
  const weekKey = `${season}-${week}`;
  await fs.mkdir(path.join(dataDir, "winprob"), { recursive: true });

  for (const league of leagues) {
    const matchups = (await json<SleeperMatchupEntry[]>(`${SLEEPER}/league/${league.league_id}/matchups/${week}`)) ?? [];
    const projections: Record<string, number> = {};
    for (const e of projectionEntries) {
      const pts = e.stats ? weighProjection(e.stats, league.scoring_settings) : undefined;
      if (typeof pts === "number") projections[e.player_id] = pts;
    }

    const file = path.join(dataDir, "winprob", `${league.league_id}.json`);
    const stored = await fs
      .readFile(file, "utf8")
      .then((text) => JSON.parse(text) as StoredWeek)
      .catch(() => null);
    // A new week starts a fresh file.
    const lines: Record<string, WinProbPoint[]> =
      stored?.week === weekKey ? Object.fromEntries(Object.entries(stored.lines ?? {}).map(([k, v]) => [k, unpackLine(v)])) : {};

    const byMatchup = new Map<number, SleeperMatchupEntry[]>();
    for (const m of matchups) {
      if (m.matchup_id == null) continue;
      byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), m]);
    }
    let recorded = 0;
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [low, high] = pair[0].roster_id < pair[1].roster_id ? [pair[0], pair[1]] : [pair[1], pair[0]];
      const side = (m: SleeperMatchupEntry): MatchupSide => ({
        points: m.points ?? 0,
        starters: (m.starters ?? [])
          .filter((id) => id && id !== "0")
          .map((id) => ({ playerId: id, team: players[id]?.team ?? null, points: m.players_points?.[id] ?? 0 })),
      });
      const reading = readMatchup(side(low), side(high), projections, gameByTeam);
      if (!reading.started) continue;
      const key = matchupKey(low.roster_id, high.roster_id);
      const next = withReading(lines[key] ?? [], { t: now, p: reading.p, a: low.points ?? 0, b: high.points ?? 0 }, reading.live, reading.allDone);
      if (next) {
        lines[key] = next;
        recorded++;
      }
    }

    if (recorded > 0 || stored?.week !== weekKey) {
      const out: StoredWeek = { week: weekKey, lines: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, packLine(v)])) };
      await fs.writeFile(file, JSON.stringify(out));
    }
    console.log(`${league.name} (${league.league_id}): ${recorded} reading(s) recorded, week ${week}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
