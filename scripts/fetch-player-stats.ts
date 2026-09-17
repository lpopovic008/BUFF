/**
 * Fetches real NFL season-long per-player scoring (games played + fantasy
 * point rollups) and writes a normalized snapshot to src/data/player-stats.json
 * — the source for each league's lineup view's "Pos Rk" column (a player's
 * rank among others at their position by points-per-game this season).
 *
 * Runs server-side in CI (see .github/workflows/player-stats.yml), same
 * reasoning as the KTC/ADP/props pipelines: the app itself only ever reads
 * the committed static snapshot, never fetches this live.
 *
 * Sleeper has no *documented* stats endpoint, but a --probe run against a
 * real week (see git history) confirmed it mirrors the projections endpoint
 * this app already fetches live and successfully (src/lib/sleeper.ts's
 * getWeeklyProjectionStats) — same base domain, same
 * /{kind}/nfl/{season}/{week}?season_type=regular&position[]=... query
 * shape, same flat array of {player_id, stats} where `stats` carries a `gp`
 * (games played) flag plus Sleeper's own pts_ppr/pts_half_ppr/pts_std
 * rollups — just "projections" swapped for "stats".
 *
 * Sums every completed week of the season (1 through the current week — a
 * player's still-in-progress or future week simply has no `gp`/points in
 * that week's entry, so it naturally doesn't contribute).
 *
 *   npx tsx scripts/fetch-player-stats.ts             # write the file
 *   npx tsx scripts/fetch-player-stats.ts --dry-run    # print, change nothing
 *   npx tsx scripts/fetch-player-stats.ts --probe      # minimal-cost shape check, write nothing
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentWeek, getNFLState } from "../src/lib/sleeper";
import type { PlayerStatLine, PlayerStatsSnapshot } from "../src/lib/player-stats";

const DRY_RUN = process.argv.includes("--dry-run");
const PROBE = process.argv.includes("--probe");
const OUT_PATH = path.join(process.cwd(), "src", "data", "player-stats.json");

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

interface SleeperStatsEntry {
  player_id: string;
  player?: { position?: string | null } | null;
  stats?: Record<string, number> | null;
}

function statsUrl(season: string, week: number): string {
  return (
    `https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=regular&` +
    POSITIONS.map((p) => `position[]=${p}`).join("&")
  );
}

async function fetchWeekStats(season: string, week: number): Promise<SleeperStatsEntry[]> {
  const res = await fetch(statsUrl(season, week));
  if (!res.ok) {
    console.log(`  week ${week}: ${res.status} ${res.statusText} — skipping.`);
    return [];
  }
  const data = (await res.json()) as SleeperStatsEntry[] | null;
  return Array.isArray(data) ? data : [];
}

async function probe() {
  const season = "2025";
  const week = 1;
  const url = statsUrl(season, week);
  console.log(`Fetching: ${url}`);
  const res = await fetch(url);
  console.log(`  status: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!res.ok) {
    console.log(`  body (first 1000 chars): ${text.slice(0, 1000)}`);
    return;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.log(`  Response wasn't valid JSON: ${err instanceof Error ? err.message : err}`);
    console.log(`  body (first 1000 chars): ${text.slice(0, 1000)}`);
    return;
  }
  console.log(`  top-level type: ${Array.isArray(data) ? `array (length ${data.length})` : typeof data}`);
  if (Array.isArray(data)) {
    const entries = data as SleeperStatsEntry[];
    const named = entries.find((e) => e.stats && (e.stats.pts_ppr ?? 0) > 5);
    console.log(`  a real scoring entry: ${JSON.stringify(named)}`);
  }
}

async function main() {
  if (PROBE) {
    await probe();
    return;
  }

  const state = await getNFLState();
  const season = state?.season ?? new Date().getFullYear().toString();
  const currentWeek = await getCurrentWeek();
  console.log(`Season ${season}, summing weeks 1 through ${currentWeek}.`);

  const byPlayer = new Map<string, PlayerStatLine>();
  let lastWeekWithData = 0;

  for (let week = 1; week <= currentWeek; week++) {
    const entries = await fetchWeekStats(season, week);
    let weekHadData = false;
    for (const entry of entries) {
      if (!entry.player_id || !entry.stats) continue;
      const gp = entry.stats.gp;
      if (typeof gp !== "number" || gp <= 0) continue; // not yet played this week

      weekHadData = true;
      const position = entry.player?.position ?? "";
      const existing = byPlayer.get(entry.player_id) ?? {
        playerId: entry.player_id,
        position,
        gamesPlayed: 0,
        ptsPpr: 0,
        ptsHalfPpr: 0,
        ptsStd: 0,
      };
      if (!existing.position && position) existing.position = position;
      existing.gamesPlayed += gp;
      existing.ptsPpr += entry.stats.pts_ppr ?? 0;
      existing.ptsHalfPpr += entry.stats.pts_half_ppr ?? 0;
      existing.ptsStd += entry.stats.pts_std ?? 0;
      byPlayer.set(entry.player_id, existing);
    }
    console.log(`  week ${week}: ${entries.length} entries fetched, ${weekHadData ? "had" : "no"} played games.`);
    if (weekHadData) lastWeekWithData = week;
  }

  const snapshot: PlayerStatsSnapshot = {
    updatedAt: new Date().toISOString(),
    season,
    throughWeek: lastWeekWithData || null,
    players: [...byPlayer.values()].sort((a, b) => a.playerId.localeCompare(b.playerId)),
  };

  console.log(`\n${snapshot.players.length} players with at least one recorded game this season.`);

  if (DRY_RUN) {
    console.log("--dry-run: not writing file.");
    return;
  }

  await fs.writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error("Player stats fetch failed:", err instanceof Error ? err.message : err);
  console.error("Leaving existing src/data/player-stats.json untouched.");
  process.exitCode = 1;
});
