/**
 * Fetches a real-players-only draft pool ranking from FantasyCalc's API and
 * writes a normalized snapshot to src/data/player-adp.json.
 *
 * Runs server-side in CI (see .github/workflows/player-adp.yml), same reason
 * as scripts/fetch-player-values.ts: no browser CORS restriction, and the
 * app itself only ever reads the committed static snapshot.
 *
 * Unlike KeepTradeCut's trade-value chart (which mixes real players with
 * future-pick assets nobody actually drafts), FantasyCalc's player endpoint
 * only ever returns real players, across the same four modes the app
 * already exposes: dynasty/redraft x 1QB/superflex.
 *
 * This was originally meant to use literal crowd-sourced Average Draft
 * Position (e.g. Underdog's own ADP), but that data isn't reachable from a
 * plain fetch script: FantasyCalc's own `maybeAdp` field is present but
 * always null (confirmed live, both isDynasty values, with and without
 * includeAdp=true); Underdog's site sits behind a Cloudflare bot challenge
 * that returns a JS challenge page instead of content to a scripted
 * request; FantasyPros' public ADP pages return 200 but load the actual
 * table client-side via JS after page load (confirmed: the only <table> in
 * the static HTML is an unrelated "pick experts" filter modal, not ADP
 * rows) — none of that is fetchable without a full headless browser. So
 * this uses FantasyCalc's `overallRank`/`positionRank` instead, which ARE
 * populated and are computed fresh per (isDynasty, numQbs) query — i.e.
 * FantasyCalc actually re-ranks its whole real-player pool for each of the
 * four modes this needs. It's a value-based rank, not literal draft-day
 * ADP; see the AdpEntry doc comment in src/lib/player-adp.ts.
 *
 * FantasyCalc's endpoint shape isn't formally documented, so extraction here
 * is defensive like the KTC script: try the field names known from public
 * usage, and if a run's records don't match, print a real sample record so
 * the actual shape is visible in the CI log rather than guessing blind. On
 * failure this exits non-zero WITHOUT touching the existing file — see the
 * workflow, which only commits on success.
 *
 *   npx tsx scripts/fetch-adp.ts             # write the file
 *   npx tsx scripts/fetch-adp.ts --dry-run    # print, change nothing
 *   npx tsx scripts/fetch-adp.ts --probe      # try several URL/param variants and log each response, write nothing
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AdpEntry, AdpSnapshot } from "../src/lib/player-adp";

const DRY_RUN = process.argv.includes("--dry-run");
const PROBE = process.argv.includes("--probe");
const OUT_PATH = path.join(process.cwd(), "src", "data", "player-adp.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const BASE_URL = "https://api.fantasycalc.com/values/current";

interface Mode {
  key: keyof Omit<AdpSnapshot, "updatedAt" | "source">;
  label: string;
  isDynasty: boolean;
  numQBs: 1 | 2;
}

const MODES: Mode[] = [
  { key: "dynastyOneQB", label: "dynasty 1QB", isDynasty: true, numQBs: 1 },
  { key: "dynastySuperflex", label: "dynasty superflex", isDynasty: true, numQBs: 2 },
  { key: "fantasyOneQB", label: "redraft 1QB", isDynasty: false, numQBs: 1 },
  { key: "fantasySuperflex", label: "redraft superflex", isDynasty: false, numQBs: 2 },
];

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status} ${res.statusText}. Body (first 500 chars): ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} returned non-JSON. Body (first 500 chars): ${text.slice(0, 500)}`);
  }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/**
 * FantasyCalc's real shape nests player identity under a `player` object
 * (`player.name`, `player.position`, `player.maybeTeam`) with the numeric
 * ranking fields flat on the outer record.
 *
 * `maybeAdp` is present in every real record but always comes back `null`
 * (confirmed via a live probe run against both isDynasty values, with and
 * without `includeAdp=true`) — FantasyCalc's public API doesn't actually
 * have populated per-player ADP behind this field. `overallRank` /
 * `positionRank`, however, ARE populated and computed separately per query
 * (isDynasty x numQbs), i.e. FantasyCalc re-ranks its whole player pool for
 * each of the four modes this app needs — so it's used here as the
 * pool-ordering signal instead. It isn't literally "average draft
 * position"; see the AdpEntry doc comment.
 *
 * Like KTC's trade-value chart, FantasyCalc's dynasty endpoint (isDynasty=
 * true) also mixes in future-pick trade assets — e.g. a record with
 * player.name "2026 Pick 1.01" and player.position "PICK" (confirmed live:
 * 76 such entries in one dynasty-1QB fetch). Those aren't real players and
 * nobody drafts them in an actual draft, so they're excluded here — this is
 * the actual fix for the pool including undraftable pick assets, not just a
 * side effect of switching off KTC.
 */
function normalizeEntry(item: unknown): AdpEntry | null {
  if (typeof item !== "object" || item === null) return null;
  const obj = item as Record<string, unknown>;
  const player = typeof obj["player"] === "object" && obj["player"] !== null ? (obj["player"] as Record<string, unknown>) : obj;

  const name = pickString(player, ["name", "playerName", "full_name", "player_name"]);
  if (!name) return null;
  const position = pickString(player, ["position", "pos"]) ?? "UNK";
  if (position.toUpperCase() === "PICK") return null;
  const team = pickString(player, ["maybeTeam", "team", "team_abbrev", "teamAbbrev"]);
  const adp = pickNumber(obj, ["maybeAdp", "adp", "redraftAdp", "dynastyAdp"]) ?? pickNumber(obj, ["overallRank", "positionRank"]);

  return { name, position, team, adp };
}

function looksLikeAdpRecord(item: unknown): boolean {
  return normalizeEntry(item) !== null;
}

async function fetchMode(mode: Mode): Promise<AdpEntry[]> {
  const url = `${BASE_URL}?isDynasty=${mode.isDynasty}&numQbs=${mode.numQBs}&numTeams=12&ppr=1&includeAdp=true`;
  console.log(`Fetching ${mode.label} from ${url}`);
  const data = await fetchJson(url);

  let raw: unknown;
  if (Array.isArray(data)) {
    raw = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    raw = obj["data"] ?? obj["players"] ?? obj["rankings"] ?? obj["results"] ?? obj["values"];
  }
  if (!Array.isArray(raw)) {
    console.error(`  response for ${mode.label} wasn't an array, and none of data/players/rankings/results/values held one.`);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      console.error(`  top-level keys: ${Object.keys(data as Record<string, unknown>).join(", ")}`);
    }
    console.error(`  raw response (first 2000 chars):`);
    console.error(JSON.stringify(data, null, 2).slice(0, 2000));
    throw new Error(`Unexpected response shape for ${mode.label}`);
  }
  console.log(`  received ${raw.length} records`);

  const valid = raw.filter(looksLikeAdpRecord);
  if (valid.length < raw.length * 0.5 || valid.length === 0) {
    console.error(`  only normalized ${valid.length}/${raw.length} records for ${mode.label}; sample raw entry:`);
    console.error(JSON.stringify(raw[0], null, 2));
    if (valid.length === 0) throw new Error(`Could not normalize any records for ${mode.label}`);
  }

  const entries = valid.map(normalizeEntry).filter((e): e is AdpEntry => e !== null);
  // Real ADP first (lowest = earliest pick), then anyone FantasyCalc hasn't
  // seen enough real drafts for yet, in whatever order the API already
  // ranked them (its own overallRank/value ordering) — keeps the pool
  // complete for a full draft board instead of just the players with ADP.
  const withAdp = entries.filter((e) => e.adp !== null).sort((a, b) => a.adp! - b.adp!);
  const withoutAdp = entries.filter((e) => e.adp === null);
  return [...withAdp, ...withoutAdp];
}

/** Tries several plausible URL/param variants against the real API and logs each response's status + a body snippet, so the correct shape can be read straight from a CI log instead of guessed at blind. Writes nothing. */
async function probe() {
  // FantasyCalc's own `maybeAdp` field came back null even with
  // includeAdp=true (confirmed via CI run 33130524717) — their public API
  // doesn't actually have populated ADP through this endpoint. FantasyPros'
  // public ADP pages aggregate real ADP across many sites (Underdog,
  // Sleeper, ESPN, NFL.com, etc.) and are known to embed a JSON blob in the
  // page; probing those instead, plus one more shot at a dedicated
  // FantasyCalc ADP endpoint in case /values/current just isn't it.
  const jsonCandidates = [
    "https://underdogfantasy.com/rankings",
    "https://api.underdogfantasy.com/v2/rankings",
    "https://stats.underdogfantasy.com/v1/user/adp",
  ];
  const htmlCandidates = ["https://www.fantasypros.com/nfl/adp/overall.php"];

  for (const url of jsonCandidates) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      const text = await res.text();
      console.log(`\n${url}`);
      console.log(`  status: ${res.status} ${res.statusText}`);
      console.log(`  content-type: ${res.headers.get("content-type")}`);
      console.log(`  body length: ${text.length}`);
      try {
        const parsed = JSON.parse(text);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        console.log(`  first record: ${JSON.stringify(first, null, 2)}`);
      } catch {
        console.log(`  body (first 1200 chars): ${text.slice(0, 1200)}`);
      }
    } catch (err) {
      console.log(`\n${url}`);
      console.log(`  request failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const url of htmlCandidates) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const text = await res.text();
      console.log(`\n${url}`);
      console.log(`  status: ${res.status} ${res.statusText}`);
      console.log(`  content-type: ${res.headers.get("content-type")}`);
      console.log(`  body length: ${text.length}`);
      // Look for the usual embedded-data markers FantasyPros pages use
      // rather than dumping the whole HTML document.
      const markers = ["var ecrData", "ecrData =", "adpData", "__NEXT_DATA__", "var players", "api.fantasypros", ".json", "id=\"data\"", "<table"];
      let found = false;
      for (const marker of markers) {
        const idx = text.indexOf(marker);
        if (idx !== -1) {
          found = true;
          console.log(`  found marker "${marker}" at offset ${idx}, snippet:`);
          console.log(`  ${text.slice(Math.max(0, idx - 100), idx + 500)}`);
        }
      }
      // Also dump every <script src="..."> so the actual JS bundle/API base
      // URLs are visible even if none of the marker guesses hit.
      const scriptSrcs = [...text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
      console.log(`  script src count: ${scriptSrcs.length}`);
      for (const src of scriptSrcs.slice(0, 20)) console.log(`    ${src}`);
      if (!found) {
        console.log(`  no known markers found; first 600 chars: ${text.slice(0, 600)}`);
      }
    } catch (err) {
      console.log(`\n${url}`);
      console.log(`  request failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function main() {
  if (PROBE) {
    await probe();
    return;
  }

  const results = await Promise.all(MODES.map(fetchMode));

  const snapshot: AdpSnapshot = {
    updatedAt: new Date().toISOString(),
    source: "fantasycalc",
    dynastyOneQB: results[0],
    dynastySuperflex: results[1],
    fantasyOneQB: results[2],
    fantasySuperflex: results[3],
  };

  for (const mode of MODES) {
    const list = snapshot[mode.key];
    const withAdp = list.filter((e) => e.adp !== null).length;
    console.log(`${mode.label}: ${list.length} players (${withAdp} with real ADP). Top 3: ${list.slice(0, 3).map((p) => p.name).join(", ")}`);
  }

  if (DRY_RUN) {
    console.log("--dry-run: not writing file.");
    return;
  }

  await fs.writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error("ADP fetch failed:", err instanceof Error ? err.message : err);
  console.error("Leaving existing src/data/player-adp.json untouched.");
  process.exitCode = 1;
});
