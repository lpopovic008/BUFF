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
 * Sleeper has no *documented* stats endpoint, but its shape mirrors the
 * projections endpoint this app already fetches live and successfully
 * (src/lib/sleeper.ts's getWeeklyProjectionStats) — same base domain, same
 * /{kind}/nfl/{season}/{week}?season_type=regular&position[]=... query
 * shape, same flat array of {player_id, stats} where `stats` is the same
 * per-category vocabulary (pass_td, rec, rec_yd, ...) plus Sleeper's own
 * pts_ppr/pts_half_ppr/pts_std rollups and a `gp` (games played) flag —
 * just "projections" swapped for "stats". This fetches one real week to
 * confirm that shape still holds before the real per-week-summing fetch is
 * written, since it can't be verified from the sandboxed dev environment
 * (api.sleeper.app is blocked there by network policy).
 *
 *   npx tsx scripts/fetch-player-stats.ts --probe   # fetch one week, print shape, write nothing
 */

const PROBE = process.argv.includes("--probe");

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

interface SleeperStatsEntry {
  player_id: string;
  stats?: Record<string, number> | null;
}

async function probe() {
  // A fully-completed past week, so there's no "game still in progress"
  // ambiguity clouding the shape check.
  const season = "2025";
  const week = 1;
  const url =
    `https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=regular&` +
    POSITIONS.map((p) => `position[]=${p}`).join("&");
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
    console.log(`  first 3 entries:`);
    for (const e of entries.slice(0, 3)) {
      console.log(`    ${JSON.stringify(e)}`);
    }
    // Find a real, well-known skill-position player to sanity-check the
    // fantasy-point rollups and games-played flag specifically.
    const named = entries.find((e) => e.stats && (e.stats.pts_ppr ?? 0) > 5);
    console.log(`  a real scoring entry: ${JSON.stringify(named)}`);
    const gpKeys = new Set<string>();
    for (const e of entries.slice(0, 200)) {
      if (e.stats) for (const k of Object.keys(e.stats)) if (k.toLowerCase().includes("gp") || k === "gms_active") gpKeys.add(k);
    }
    console.log(`  games-played-ish keys seen in first 200 entries: ${[...gpKeys].join(", ") || "(none found)"}`);
  } else {
    console.log(`  body (first 2000 chars): ${text.slice(0, 2000)}`);
  }
}

async function main() {
  if (PROBE) {
    await probe();
    return;
  }
  console.log("Only --probe is implemented so far.");
}

main().catch((err) => {
  console.error("Player stats probe failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
