/**
 * Fetches a real-players-only draft pool ranking and writes a normalized
 * snapshot to src/data/player-adp.json, across the four modes the Draft
 * Room exposes: dynasty/redraft ("fantasy") x 1QB/superflex.
 *
 * Runs server-side in CI (see .github/workflows/player-adp.yml), same reason
 * as scripts/fetch-player-values.ts: no browser CORS restriction, and the
 * app itself only ever reads the committed static snapshot.
 *
 * Two different real sources, one per pair of modes:
 *
 * - Redraft ("fantasy") 1QB/superflex: 4for4's public ADP pages
 *   (4for4.com/adp, 4for4.com/superflex-adp) are genuinely useful — a
 *   plain, fully server-rendered HTML <table>, no JS framework blocking it
 *   (confirmed live: real rows like Jahmyr Gibbs/DET/... in the raw
 *   response, cross-checked against a user-provided CSV export of the same
 *   table). The page's own "ADP" column is literal crowd-sourced average
 *   draft position aggregated across real platforms (FFPC, Sleeper, CBS,
 *   ESPN, etc. depending on mode) — not a value-based proxy.
 *
 * - Dynasty 1QB/superflex: still FantasyCalc's `overallRank`/`positionRank`
 *   (a value-based rank, not literal ADP — see the AdpEntry doc comment in
 *   src/lib/player-adp.ts) because no real dynasty ADP source has been
 *   found yet. FantasyCalc's own `maybeAdp` field is present but always
 *   null (confirmed live, both isDynasty values, with and without
 *   includeAdp=true); Underdog's site sits behind a Cloudflare bot
 *   challenge; FantasyPros' ADP pages load the actual table client-side via
 *   JS after page load (confirmed: the only <table> in the static HTML is
 *   an unrelated "pick experts" filter modal); DraftSharks' ADP page is
 *   also Vue-rendered client-side. Swap this out for a real dynasty ADP
 *   source (4for4 or otherwise) if/when one turns up.
 *
 * Both extraction paths are defensive like the KTC script: on a shape
 * mismatch or a suspiciously low parsed-row count, print real sample data
 * so the actual shape is visible in the CI log rather than guessing blind.
 * On failure this exits non-zero WITHOUT touching the existing file — see
 * the workflow, which only commits on success.
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

// Only the dynasty modes still come from FantasyCalc — the redraft
// ("fantasy") modes now come from 4for4's real ADP pages (see FOR4_URLS
// below and fetchFor4()).
const MODES: Mode[] = [
  { key: "dynastyOneQB", label: "dynasty 1QB", isDynasty: true, numQBs: 1 },
  { key: "dynastySuperflex", label: "dynasty superflex", isDynasty: true, numQBs: 2 },
];

const FOR4_URLS: { key: "fantasyOneQB" | "fantasySuperflex"; label: string; url: string }[] = [
  { key: "fantasyOneQB", label: "redraft 1QB (4for4)", url: "https://www.4for4.com/adp" },
  { key: "fantasySuperflex", label: "redraft superflex (4for4)", url: "https://www.4for4.com/superflex-adp" },
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

/**
 * Extracts a table row's <td> cell contents as plain text, in order. A
 * cell that wraps its content in an <a> (every player/team-name cell on
 * this page) is reduced to the link's own text rather than the raw anchor
 * markup; any other cell just has its tags stripped.
 */
function parseFor4RowCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => {
    const raw = m[1];
    const linkMatch = raw.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    return (linkMatch ? linkMatch[1] : raw).replace(/<[^>]+>/g, "").trim();
  });
}

/**
 * Parses 4for4's ADP table. Confirmed live (CI run 33132856201) and
 * cross-checked against a user-provided CSV export of the same table: a
 * plain, fully server-rendered <table><tbody>, columns always starting
 * [ADP, position-rank (e.g. "RB-01"), player name, team, ...variable
 * per-platform/pick columns...] — the 1QB and superflex pages have a
 * different number of trailing columns (more source platforms track 1QB),
 * so only the first four fixed columns are read; ADP itself (a plain 1..N
 * ordinal, already the real crowd-aggregated draft order) becomes `adp`.
 */
function parseFor4Table(html: string): AdpEntry[] {
  const tbodyStart = html.indexOf("<tbody");
  if (tbodyStart === -1) return [];
  const tbodyEndIdx = html.indexOf("</tbody>", tbodyStart);
  const tbodyHtml = html.slice(tbodyStart, tbodyEndIdx === -1 ? undefined : tbodyEndIdx);

  const entries: AdpEntry[] = [];
  for (const rowMatch of tbodyHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = parseFor4RowCells(rowMatch[1]);
    if (cells.length < 4) continue;
    const [adpRaw, posRankRaw, name, teamRaw] = cells;
    const adp = Number(adpRaw);
    if (!name || !Number.isFinite(adp)) continue;
    const position = posRankRaw.split("-")[0]?.toUpperCase() || "UNK";
    const team = teamRaw && teamRaw !== "-" ? teamRaw : null;
    entries.push({ name, position, team, adp });
  }
  return entries;
}

async function fetchFor4(url: string, label: string): Promise<AdpEntry[]> {
  console.log(`Fetching ${label} from ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status} ${res.statusText}. Body (first 500 chars): ${text.slice(0, 500)}`);
  }
  const entries = parseFor4Table(text);
  // The real table has ~300 rows; a sharp drop means the page structure
  // changed and this needs re-checking against a fresh sample, not silently
  // writing a half-empty pool.
  if (entries.length < 150) {
    console.error(`  only parsed ${entries.length} rows for ${label} (expected ~300) — table structure may have changed.`);
    const tbodyIdx = text.indexOf("<tbody");
    console.error(`  <tbody> sample (first 1500 chars from offset ${tbodyIdx === -1 ? "N/A (not found)" : tbodyIdx}):`);
    console.error(tbodyIdx === -1 ? text.slice(0, 1500) : text.slice(tbodyIdx, tbodyIdx + 1500));
    if (entries.length === 0) throw new Error(`Could not parse any rows for ${label}`);
  }
  console.log(`  parsed ${entries.length} rows for ${label}`);
  return entries.sort((a, b) => a.adp! - b.adp!);
}

/** Tries several plausible URL/param variants against the real API and logs each response's status + a body snippet, so the correct shape can be read straight from a CI log instead of guessed at blind. Writes nothing. */
async function probe() {
  // DraftSharks (draftsharks.com) publishes public ADP pages (redraft,
  // dynasty, superflex variants). Unknown yet whether the numbers are
  // server-rendered in the HTML (like a classic page) or loaded via JS
  // after the fact (like FantasyPros turned out to be) — checking both the
  // raw HTML for an embedded table/JSON and any API host their JS bundle
  // references.
  const jsonCandidates: string[] = [];
  // User-provided site: yafsb.com, wants Sleeper-specific ADP. Confirmed
  // live (run 33134552442): root page links to /fantasy-football/adp-rankings/.
  // User then supplied the real per-format paths directly: base = redraft
  // 1QB, /superflex/ = redraft superflex, /dynasty/ = dynasty startup 1QB,
  // /dynasty-rookie/ = dynasty rookie-only (not one of our four modes).
  // Dynasty superflex's path is an educated guess (dynasty-superflex/) —
  // checking rendering (server HTML table vs JS) and column structure
  // (does it break out Sleeper specifically, like 4for4 did per-platform?)
  // on all of these at once.
  const htmlCandidates = [
    "https://www.yafsb.com/fantasy-football/adp-rankings/",
    "https://www.yafsb.com/fantasy-football/adp-rankings/superflex/",
    "https://www.yafsb.com/fantasy-football/adp-rankings/dynasty/",
    "https://www.yafsb.com/fantasy-football/adp-rankings/dynasty-superflex/",
  ];
  const jsBundleCandidates: string[] = [];

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
        console.log(`  first record (first 500 chars): ${JSON.stringify(first).slice(0, 500)}`);
      } catch {
        console.log(`  body (first 500 chars): ${text.slice(0, 500)}`);
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
      const adpLinks = [...text.matchAll(/<a[^>]+href="([^"]*(?:adp|sleeper)[^"]*)"/gi)].map((m) => m[1]);
      const uniqueAdpLinks = [...new Set(adpLinks)];
      console.log(`  links mentioning adp/sleeper (${uniqueAdpLinks.length}):`);
      for (const link of uniqueAdpLinks.slice(0, 40)) console.log(`    ${link}`);
      // Any <select>/<option>/query-param-carrying control that mentions a
      // draft-site name or format, so the URL scheme for switching
      // site/format can be read straight off the page instead of guessed.
      for (const kw of ["sleeper", "dynasty", "superflex", "redraft", "1qb", "one-qb", "half-ppr"]) {
        const idx = text.toLowerCase().indexOf(kw);
        if (idx !== -1) {
          console.log(`  found "${kw}" at offset ${idx}: ${text.slice(Math.max(0, idx - 150), idx + 150).replace(/\s+/g, " ")}`);
        }
      }
      // Confirmed live (run 33132856201): 4for4's ADP page has a plain,
      // fully server-rendered <table><tbody> with real rows (no JS
      // framework blocking it like FantasyPros'/DraftSharks' pages) — e.g.
      // Jahmyr Gibbs / DET / ... / 1.01 (round.pick). Grabbing the <thead>
      // to map the column meanings, plus a much bigger <tbody> window (this
      // page is only 290KB total, plenty of budget) and a row count.
      const theadIdx = text.indexOf("<thead");
      if (theadIdx !== -1) {
        const theadEnd = text.indexOf("</thead>", theadIdx);
        console.log(`  <thead> (offset ${theadIdx}):`);
        console.log(`  ${text.slice(theadIdx, theadEnd === -1 ? theadIdx + 2000 : theadEnd + 9)}`);
      } else {
        console.log(`  no <thead> found.`);
      }
      const trCount = [...text.matchAll(/<tr\b/g)].length;
      console.log(`  total <tr count: ${trCount}`);
      const markers: string[] = [];
      let found = false;
      for (const marker of markers) {
        const idx = text.indexOf(marker);
        if (idx !== -1) {
          found = true;
          console.log(`  found marker "${marker}" at offset ${idx}, snippet:`);
          console.log(`  ${text.slice(Math.max(0, idx - 100), idx + 1500)}`);
        }
      }
      const tbodyIdx = text.indexOf("<tbody");
      if (tbodyIdx !== -1) {
        console.log(`  <tbody> content (1200 chars from offset ${tbodyIdx}):`);
        console.log(`  ${text.slice(tbodyIdx, tbodyIdx + 1200)}`);
      } else {
        console.log(`  no <tbody> found in the response at all.`);
      }
      const scriptSrcs = [...text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
      console.log(`  script src count: ${scriptSrcs.length}`);
      for (const src of scriptSrcs.slice(0, 25)) console.log(`    ${src}`);
      if (!found) {
        console.log(`  no known JS-data markers found; first 800 chars: ${text.slice(0, 800)}`);
      }
    } catch (err) {
      console.log(`\n${url}`);
      console.log(`  request failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const url of jsBundleCandidates) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      const text = await res.text();
      console.log(`\n${url}`);
      console.log(`  status: ${res.status} ${res.statusText}`);
      console.log(`  body length: ${text.length}`);
      // Confirmed live (run 33131800955): getExportLink() builds
      // '/adp/export?' + 'adp[]=' + encodeURIComponent(key) + '&adp_names[]='
      // + ... for each key in selectedSetKeys, where key comes from
      // descriptorByKey.get(key) — so the valid adp[]= values are whatever
      // keys populate descriptorByKey. The bundle is only 26KB total, small
      // enough to just dump in full rather than guess more windows.
      console.log(`  FULL BUNDLE TEXT:\n${text}`);
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

  const [dynastyResults, for4Results] = await Promise.all([
    Promise.all(MODES.map(fetchMode)),
    Promise.all(FOR4_URLS.map((mode) => fetchFor4(mode.url, mode.label))),
  ]);

  const snapshot: AdpSnapshot = {
    updatedAt: new Date().toISOString(),
    source: "mixed",
    dynastyOneQB: dynastyResults[0],
    dynastySuperflex: dynastyResults[1],
    fantasyOneQB: for4Results[0],
    fantasySuperflex: for4Results[1],
  };

  const allModes = [...MODES, ...FOR4_URLS];
  for (const mode of allModes) {
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
