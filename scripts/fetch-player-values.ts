/**
 * Fetches KeepTradeCut dynasty and fantasy (redraft) player trade values and
 * writes a normalized snapshot to src/data/player-values.json.
 *
 * Runs server-side in CI (see .github/workflows/player-values.yml), not in the
 * browser: KeepTradeCut has no official public API, and a browser fetch would
 * be at the mercy of whatever CORS policy (if any) they happen to send. A
 * plain Node fetch has no such restriction, so the values are pulled once
 * here and shipped as static, build-time data — the /values page never talks
 * to KeepTradeCut directly.
 *
 * KTC's page structure isn't documented anywhere, so extraction here is
 * intentionally defensive: try a couple of known scraping patterns, then fall
 * back to walking any embedded JSON looking for something shaped like a
 * player-values array. On failure this prints diagnostic output and exits
 * non-zero WITHOUT touching the existing file, so a bad run never clobbers
 * the last good snapshot — see the workflow, which only commits on success.
 *
 *   npx tsx scripts/fetch-player-values.ts             # write the file
 *   npx tsx scripts/fetch-player-values.ts --dry-run    # print, change nothing
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { PlayerValue, PlayerValuesSnapshot } from "../src/lib/player-values";

const DRY_RUN = process.argv.includes("--dry-run");
const OUT_PATH = path.join(process.cwd(), "src", "data", "player-values.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/** Classic scraping target used by several open-source KTC tools: a bare `var playersArray = [...]`. */
function extractPlayersArrayLiteral(html: string): unknown[] | null {
  const match = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Next.js apps commonly embed their page's fetched data in this script tag. */
function extractNextData(html: string): unknown | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Generic fallback: recursively walk any parsed JSON structure looking for an
 * array whose entries look like player-value records (a name-ish string field
 * plus a numeric value-ish field). This doesn't depend on knowing the exact
 * key names or nesting KTC uses, only the rough shape of one record.
 */
function findPlayerArray(node: unknown, depth = 0): unknown[] | null {
  if (depth > 8 || node == null) return null;
  if (Array.isArray(node)) {
    if (node.length >= 20 && node.every((item) => looksLikePlayerRecord(item))) {
      return node;
    }
    for (const item of node) {
      const found = findPlayerArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = findPlayerArray(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function looksLikePlayerRecord(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  const hasName = pickString(obj, ["playerName", "name", "full_name", "player_name"]) !== null;
  const hasValue = extractValue(obj) !== null;
  return hasName && hasValue;
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
 * KTC's actual record shape (confirmed from a live CI run, not guessed): the
 * trade value isn't a flat field on the player object — it's nested one level
 * down under `oneQBValues.value` (1QB leagues, the common case and what this
 * app assumes) or `superflexValues.value`. Everything else (playerName,
 * position, team, age) is flat and matched the first guess.
 */
function extractValue(obj: Record<string, unknown>): number | null {
  const flat = pickNumber(obj, ["value", "sf_trade_value", "tradeValue", "trade_value", "sfValue"]);
  if (flat !== null) return flat;
  const oneQB = obj["oneQBValues"];
  if (oneQB && typeof oneQB === "object") {
    const nested = pickNumber(oneQB as Record<string, unknown>, ["value"]);
    if (nested !== null) return nested;
  }
  return null;
}

function normalize(raw: unknown[]): PlayerValue[] {
  const rows: PlayerValue[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const name = pickString(obj, ["playerName", "name", "full_name", "player_name"]);
    const value = extractValue(obj);
    if (!name || value === null) continue;
    const position = pickString(obj, ["position", "pos"]) ?? "UNK";
    const team = pickString(obj, ["team", "team_abbrev", "teamAbbrev"]);
    const age = pickNumber(obj, ["age"]);
    rows.push({ name, position, team, age, value, rank: 0 });
  }
  rows.sort((a, b) => b.value - a.value);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

async function fetchRanking(url: string, label: string): Promise<PlayerValue[]> {
  console.log(`Fetching ${label} from ${url}`);
  const html = await fetchHtml(url);
  console.log(`  received ${html.length} bytes`);

  const literal = extractPlayersArrayLiteral(html);
  if (literal) {
    console.log(`  found playersArray literal with ${literal.length} entries`);
    const normalized = normalize(literal);
    if (normalized.length > 0) return normalized;
    // Our guessed field names didn't match anything — dump a real record so
    // the actual keys are visible in the CI log instead of guessing again blind.
    console.log(`  normalize() found 0 valid rows; sample raw entry:`);
    console.log(JSON.stringify(literal[0], null, 2));
  }

  const nextData = extractNextData(html);
  if (nextData) {
    console.log(`  found __NEXT_DATA__ script tag`);
    const found = findPlayerArray(nextData);
    if (found) {
      console.log(`  located a player-shaped array inside __NEXT_DATA__ with ${found.length} entries`);
      const normalized = normalize(found);
      if (normalized.length > 0) return normalized;
    }
  }

  // Last resort: hunt for ANY inline <script> JSON blob shaped like player data.
  const scriptBlobs = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => s.includes("value") || s.includes("Value"));
  for (const blob of scriptBlobs) {
    const arrayMatch = blob.match(/(\[\s*\{[\s\S]*?\}\s*\])/);
    if (!arrayMatch) continue;
    try {
      const parsed = JSON.parse(arrayMatch[1]);
      if (Array.isArray(parsed) && parsed.length >= 20 && parsed.every(looksLikePlayerRecord)) {
        console.log(`  found a raw script-tag array with ${parsed.length} entries`);
        const normalized = normalize(parsed);
        if (normalized.length > 0) return normalized;
      }
    } catch {
      // not this one
    }
  }

  console.error(`  could not locate a player-values array for ${label}.`);
  console.error(`  first 2000 chars of response for debugging:`);
  console.error(html.slice(0, 2000));
  throw new Error(`Failed to extract ${label} rankings from ${url}`);
}

async function main() {
  const [dynasty, fantasy] = await Promise.all([
    fetchRanking("https://keeptradecut.com/dynasty-rankings", "dynasty rankings"),
    fetchRanking("https://keeptradecut.com/fantasy-rankings", "fantasy (redraft) rankings"),
  ]);

  const snapshot: PlayerValuesSnapshot = {
    updatedAt: new Date().toISOString(),
    source: "keeptradecut",
    dynasty,
    fantasy,
  };

  console.log(`Dynasty: ${dynasty.length} players. Top 3: ${dynasty.slice(0, 3).map((p) => p.name).join(", ")}`);
  console.log(`Fantasy: ${fantasy.length} players. Top 3: ${fantasy.slice(0, 3).map((p) => p.name).join(", ")}`);

  if (DRY_RUN) {
    console.log("--dry-run: not writing file.");
    return;
  }

  await fs.writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error("Player value fetch failed:", err instanceof Error ? err.message : err);
  console.error("Leaving existing src/data/player-values.json untouched.");
  process.exitCode = 1;
});
