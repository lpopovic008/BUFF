/**
 * Fetches real Average Draft Position data from FantasyCalc's rankings API
 * and writes a normalized snapshot to src/data/player-adp.json.
 *
 * Runs server-side in CI (see .github/workflows/player-adp.yml), same reason
 * as scripts/fetch-player-values.ts: no browser CORS restriction, and the
 * app itself only ever reads the committed static snapshot.
 *
 * Unlike KeepTradeCut's trade-value chart (which mixes real players with
 * future-pick assets), this is real crowd ADP — where people actually pick
 * a player in real drafts — across the same four modes the app already
 * exposes: dynasty/redraft x 1QB/superflex.
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
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AdpEntry, AdpSnapshot } from "../src/lib/player-adp";

const DRY_RUN = process.argv.includes("--dry-run");
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
 * ranking fields (`value`, `overallRank`, `maybeAdp`) flat on the outer
 * record — but this tries flat-record fallbacks too in case that's wrong,
 * the same defensive-but-verifiable spirit as the KTC script.
 */
function normalizeEntry(item: unknown): AdpEntry | null {
  if (typeof item !== "object" || item === null) return null;
  const obj = item as Record<string, unknown>;
  const player = typeof obj["player"] === "object" && obj["player"] !== null ? (obj["player"] as Record<string, unknown>) : obj;

  const name = pickString(player, ["name", "playerName", "full_name", "player_name"]);
  if (!name) return null;
  const position = pickString(player, ["position", "pos"]) ?? "UNK";
  const team = pickString(player, ["maybeTeam", "team", "team_abbrev", "teamAbbrev"]);
  const adp = pickNumber(obj, ["maybeAdp", "adp", "redraftAdp", "dynastyAdp"]);

  return { name, position, team, adp };
}

function looksLikeAdpRecord(item: unknown): boolean {
  return normalizeEntry(item) !== null;
}

async function fetchMode(mode: Mode): Promise<AdpEntry[]> {
  const url = `${BASE_URL}?isDynasty=${mode.isDynasty}&numQBs=${mode.numQBs}&numTeams=12&ppr=1&includeAdp=true`;
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

async function main() {
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
