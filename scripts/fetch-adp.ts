/**
 * Fetches a real-players-only draft pool ranking and writes a normalized
 * snapshot to src/data/player-adp.json, across the four modes the Draft
 * Room exposes: dynasty/redraft ("fantasy") x 1QB/superflex.
 *
 * Runs server-side in CI (see .github/workflows/player-adp.yml), same reason
 * as scripts/fetch-player-values.ts: no browser CORS restriction, and the
 * app itself only ever reads the committed static snapshot.
 *
 * Source: yafsb.com's public ADP-rankings pages — literal crowd-sourced
 * Average Draft Position aggregated from real Sleeper drafts (per the
 * page's own description: "ADP rankings built from real Sleeper fantasy
 * drafts — not projections"), for all four modes. Plain, fully
 * server-rendered HTML <table> (no JS framework), confirmed live across all
 * four URLs below — each returns the right shape (redraft 1QB has no QB in
 * its top rows; dynasty superflex has Josh Allen #1; etc.) and a real ADP
 * decimal per player (e.g. Jahmyr Gibbs 1.1 in redraft 1QB).
 *
 * URL scheme, reverse-engineered from the site's own draftSettings.js
 * (its filter-apply button builds `?scoring_type=&league_size=&is_superflex=&is_dynasty=&is_rookies=`
 * on the bare /adp-rankings/ path) and confirmed against the equivalent
 * preset paths the site also exposes (/ppr/, /superflex/, /dynasty/):
 *   - redraft 1QB:        /adp-rankings/ppr/
 *   - redraft superflex:  /adp-rankings/superflex/
 *   - dynasty 1QB:        /adp-rankings/?scoring_type=ppr&league_size=12&is_superflex=False&is_dynasty=True&is_rookies=False
 *     (no preset path exists for this combo — dynasty/ppr/, dynasty-ppr/,
 *     ppr/dynasty/ all 404; only the query-param form works)
 *   - dynasty superflex:  /adp-rankings/dynasty/
 *
 * Superseded sources, kept here as history in case yafsb.com ever breaks:
 * FantasyCalc (own `maybeAdp` field always null; used as a value-rank proxy
 * for a while, and its dynasty endpoint mixed in future-pick "PICK"-position
 * assets); 4for4.com (real ADP, but only for redraft — dynasty modes stayed
 * on FantasyCalc); Underdog (Cloudflare bot-walled); FantasyPros and
 * DraftSharks (both load their real ADP table client-side via JS, not in
 * the raw HTML).
 *
 * Defensive like the KTC/FantasyCalc scripts before it: on a shape mismatch
 * or a suspiciously low parsed-row count, prints real sample data so the
 * actual shape is visible in the CI log rather than guessing blind. On
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

const YAFSB_BASE = "https://www.yafsb.com/fantasy-football/adp-rankings/";

const YAFSB_MODES: { key: keyof Omit<AdpSnapshot, "updatedAt" | "source">; label: string; url: string }[] = [
  { key: "fantasyOneQB", label: "redraft 1QB (yafsb)", url: `${YAFSB_BASE}ppr/` },
  { key: "fantasySuperflex", label: "redraft superflex (yafsb)", url: `${YAFSB_BASE}superflex/` },
  {
    key: "dynastyOneQB",
    label: "dynasty 1QB (yafsb)",
    url: `${YAFSB_BASE}?scoring_type=ppr&league_size=12&is_superflex=False&is_dynasty=True&is_rookies=False`,
  },
  { key: "dynastySuperflex", label: "dynasty superflex (yafsb)", url: `${YAFSB_BASE}dynasty/` },
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decodes HTML entities left behind after stripping tags — yafsb.com
 * encodes apostrophes in player names as numeric entities (e.g. "Ja&#x27;Marr
 * Chase" for "Ja'Marr Chase"), which a tag-stripping regex alone doesn't
 * touch.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

/**
 * Extracts a table row's <td> cell contents as plain text, in order. A
 * cell that wraps its content in an <a> (the Player-name cell on this
 * page) is reduced to the link's own text rather than the raw anchor
 * markup; any other cell just has its tags stripped and HTML entities
 * decoded.
 */
function parseTableRowCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => {
    const raw = m[1];
    const linkMatch = raw.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    return decodeHtmlEntities((linkMatch ? linkMatch[1] : raw).replace(/<[^>]+>/g, "").trim());
  });
}

/**
 * Parses yafsb.com's ADP table. Confirmed live across all four mode URLs:
 * a plain, fully server-rendered <table><thead><tr><th>Rank/Player/Pos/
 * Team/ADP/Drafts</th></tr></thead><tbody>, ADP itself a real decimal
 * average draft position (e.g. "4.9") rather than a plain ordinal rank.
 */
function parseYafsbTable(html: string): AdpEntry[] {
  const tbodyStart = html.indexOf("<tbody");
  if (tbodyStart === -1) return [];
  const tbodyEndIdx = html.indexOf("</tbody>", tbodyStart);
  const tbodyHtml = html.slice(tbodyStart, tbodyEndIdx === -1 ? undefined : tbodyEndIdx);

  const entries: AdpEntry[] = [];
  for (const rowMatch of tbodyHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = parseTableRowCells(rowMatch[1]);
    if (cells.length < 5) continue;
    const [, name, position, teamRaw, adpRaw] = cells;
    const adp = Number(adpRaw);
    if (!name || !Number.isFinite(adp)) continue;
    const team = teamRaw && teamRaw !== "-" ? teamRaw : null;
    entries.push({ name, position: position.toUpperCase() || "UNK", team, adp });
  }
  return entries;
}

async function fetchYafsb(url: string, label: string): Promise<AdpEntry[]> {
  console.log(`Fetching ${label} from ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status} ${res.statusText}. Body (first 500 chars): ${text.slice(0, 500)}`);
  }
  const entries = parseYafsbTable(text);
  // Real tables here run ~250-400 rows depending on mode; a sharp drop
  // means the page structure changed and this needs re-checking against a
  // fresh sample, not silently writing a half-empty pool.
  if (entries.length < 150) {
    console.error(`  only parsed ${entries.length} rows for ${label} (expected 250+) — table structure may have changed.`);
    const tbodyIdx = text.indexOf("<tbody");
    console.error(`  <tbody> sample (first 1500 chars from offset ${tbodyIdx === -1 ? "N/A (not found)" : tbodyIdx}):`);
    console.error(tbodyIdx === -1 ? text.slice(0, 1500) : text.slice(tbodyIdx, tbodyIdx + 1500));
    if (entries.length === 0) throw new Error(`Could not parse any rows for ${label}`);
  }
  console.log(`  parsed ${entries.length} rows for ${label}`);
  return entries.sort((a, b) => a.adp! - b.adp!);
}

/** Tries several plausible URL/param variants against the real site and logs each response's status + a body snippet, so the correct shape can be read straight from a CI log instead of guessed at blind. Writes nothing. */
async function probe() {
  // Temporary: checking whether ESPN's public-league read endpoint sends
  // CORS headers that would let a client-side (browser) fetch succeed, for
  // the "ESPN fantasy capabilities" task. A known public league id (from
  // the espn-api Python library's own test fixtures) is used since a
  // private league would 401 regardless of CORS. Simulates a browser
  // cross-origin request with an explicit Origin header — CORS is decided
  // by the server echoing (or not) Access-Control-Allow-Origin for that
  // Origin, so this is testable from a plain server-side fetch.
  const jsonCandidates: string[] = [
    "https://fantasy.espn.com/apis/v3/games/ffl/seasons/2023/segments/0/leagues/1421388?view=mTeam",
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2023/segments/0/leagues/1421388?view=mTeam",
  ];
  // User pushed back with a different mode->URL mapping than what live data
  // confirmed earlier (bare URL = redraft 1QB, /dynasty/ = dynasty 1QB in
  // their telling). Re-checking all four fresh, right now, to settle it
  // against actual table content rather than URL naming.
  const htmlCandidates = [
    "https://www.yafsb.com/fantasy-football/adp-rankings/",
    "https://www.yafsb.com/fantasy-football/adp-rankings/dynasty/",
  ];
  const jsBundleCandidates: string[] = [];

  for (const url of jsonCandidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://example.com" },
      });
      const text = await res.text();
      console.log(`\n${url}`);
      console.log(`  status: ${res.status} ${res.statusText}`);
      console.log(`  content-type: ${res.headers.get("content-type")}`);
      console.log(`  access-control-allow-origin: ${res.headers.get("access-control-allow-origin")}`);
      console.log(`  access-control-allow-credentials: ${res.headers.get("access-control-allow-credentials")}`);
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
      const dataLayerMatch = text.match(/dataLayer\.push\(\{([^}]+)\}\)/);
      console.log(`  dataLayer flags: ${dataLayerMatch ? dataLayerMatch[1].trim() : "not found"}`);
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
      if (text.length <= 40000) {
        console.log(`  FULL BUNDLE TEXT:\n${text}`);
      } else {
        console.log(`  bundle too large to dump whole (${text.length} chars).`);
        const lines = text.split("\n").filter((l) => /dynasty|superflex|\bppr\b|href|\burl\b/i.test(l));
        if (lines.length > 0 && lines.length < 200) {
          console.log(`  lines mentioning dynasty/superflex/ppr/href/url:`);
          for (const line of lines) console.log(`    ${line.slice(0, 500)}`);
        } else {
          console.log(`  falling back to windows around each "dynasty" occurrence (first 10):`);
          const idxs = [...text.matchAll(/dynasty/gi)].map((m) => m.index!).slice(0, 10);
          for (const idx of idxs) console.log(`    ...${text.slice(Math.max(0, idx - 200), idx + 200)}...`);
        }
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

  const results = await Promise.all(YAFSB_MODES.map((mode) => fetchYafsb(mode.url, mode.label)));

  const snapshot: AdpSnapshot = {
    updatedAt: new Date().toISOString(),
    source: "yafsb",
    dynastyOneQB: [],
    dynastySuperflex: [],
    fantasyOneQB: [],
    fantasySuperflex: [],
  };
  YAFSB_MODES.forEach((mode, i) => {
    snapshot[mode.key] = results[i];
  });

  for (const mode of YAFSB_MODES) {
    const list = snapshot[mode.key];
    console.log(`${mode.label}: ${list.length} players. Top 3: ${list.slice(0, 3).map((p) => p.name).join(", ")}`);
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
