/**
 * KeepTradeCut's dynasty values over time, for the values page's trade
 * analyzer: written to public/data/value-history.json (see
 * src/lib/value-history.ts), a value a week for every player and future draft
 * pick on KTC's dynasty rankings, in both superflex and 1QB.
 *
 * Each KTC player page carries that player's whole value history (a JSON
 * block, `#pd-superflex` / `#pd-oneqb`, whose `overallValue` is a value a day,
 * `{"d":"240831","v":5768}`) — but the pages are ~4MB apiece, so the full
 * fetch is a one-off (--full). After that a run only fetches the pages of
 * players and picks it hasn't got yet, and sets the week's value from the
 * rankings page alone — today's, each run. Anyone who drops off the rankings — a pick once it's
 * been drafted, a retired player — keeps the history already gathered.
 *
 * On failure it prints why and exits non-zero without touching the file.
 *
 *   npx tsx scripts/fetch-value-history.ts            # new players' histories, this week's values
 *   npx tsx scripts/fetch-value-history.ts --full     # every page again
 *   npx tsx scripts/fetch-value-history.ts --dry-run  # change nothing
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { dayOf, ValueHistory, ValueSeries } from "../src/lib/value-history";
import { onGrid, pageHistory } from "./ktc-pages";

const FULL = process.argv.includes("--full");
const DRY_RUN = process.argv.includes("--dry-run");
const OUT_PATH = path.join(process.cwd(), "public", "data", "value-history.json");
const STEP = 7;
/** Player pages fetched at once, and the pause after each — gentle on KTC. */
const CONCURRENCY = 4;
const PAUSE_MS = 250;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  return res.text();
}

/** The `[...]` or `{...}` starting at `open`, brackets balanced outside of strings. */
function balanced(text: string, open: number, pair: "[]" | "{}"): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === pair[0]) depth++;
    else if (ch === pair[1] && --depth === 0) return text.slice(open, i + 1);
  }
  return null;
}

interface RankedPlayer {
  playerID: number;
  playerName: string;
  slug: string;
  position: string;
  team: string | null;
  oneQBValues?: { value?: number };
  superflexValues?: { value?: number };
}

/** The rankings page's full player table: the largest array of player records in any of its scripts (a bare JSON array, not a named variable). */
function largestPlayerArray(html: string): RankedPlayer[] {
  let best: RankedPlayer[] = [];
  for (const [, body] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    let quote: string | null = null;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "[") {
        const text = balanced(body, i, "[]");
        if (!text) continue;
        i += text.length - 1;
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > best.length && typeof parsed[0]?.playerName === "string") best = parsed;
        } catch {
          // not JSON — keep looking
        }
      }
    }
  }
  return best;
}

async function loadExisting(): Promise<ValueHistory | null> {
  try {
    return JSON.parse(await fs.readFile(OUT_PATH, "utf8")) as ValueHistory;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Fetching the dynasty rankings…");
  const ranked = largestPlayerArray(await fetchHtml("https://keeptradecut.com/dynasty-rankings"));
  if (ranked.length < 100) throw new Error(`only ${ranked.length} players in the rankings table — the page has likely changed`);
  console.log(`  ${ranked.length} players and picks.`);

  // Everything gathered is kept, even with --full, which only fetches every ranked page again — a pick, once
  // drafted, is on no rankings page and its own page is gone.
  const existing = await loadExisting();
  const today = dayOf(Date.now());
  const toFetch = FULL ? ranked : ranked.filter((p) => !existing?.players[String(p.playerID)]);
  console.log(`${toFetch.length} player pages to fetch${FULL ? " (--full)" : ""}.`);

  // Each page's whole history, both formats.
  const fetched = new Map<string, { sf: [number, number][]; q: [number, number][] }>();
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < toFetch.length) {
      const p = toFetch[next++];
      try {
        const page = await fetchHtml(`https://keeptradecut.com/dynasty-rankings/players/${p.slug}`);
        fetched.set(String(p.playerID), { sf: pageHistory(page, "pd-superflex"), q: pageHistory(page, "pd-oneqb") });
      } catch (err) {
        failed++;
        console.log(`  ${p.playerName}: ${err instanceof Error ? err.message : err}`);
      }
      if (fetched.size % 50 === 0) console.log(`  ${fetched.size} of ${toFetch.length}…`);
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failed > toFetch.length / 4) throw new Error(`${failed} of ${toFetch.length} player pages failed`);

  // The grid: from the earliest day anyone's history reaches (kept on the existing grid's weeks), through today.
  const earliest = Math.min(today, ...[...fetched.values()].flatMap((h) => [h.sf[0]?.[0] ?? today, h.q[0]?.[0] ?? today]));
  let from = existing?.from ?? earliest;
  if (existing && earliest < from) from -= Math.ceil((from - earliest) / STEP) * STEP;
  const count = Math.floor((today - from) / STEP) + 1;
  const shift = existing ? (existing.from - from) / STEP : 0;

  const players: Record<string, ValueSeries> = {};
  // Everyone already gathered, moved onto the grid and carried through today.
  for (const [id, s] of Object.entries(existing?.players ?? {})) {
    const pad = (values: (number | null)[]) => [...Array<null>(shift).fill(null), ...values, ...Array<null>(Math.max(0, count - shift - values.length)).fill(null)].slice(0, count);
    players[id] = { ...s, sf: pad(s.sf), q: pad(s.q) };
  }
  for (const [id, h] of fetched) {
    const p = ranked.find((r) => String(r.playerID) === id)!;
    players[id] = { n: p.playerName, p: p.position, t: p.team && p.team !== "FA" ? p.team : null, sf: onGrid(h.sf, from, count, STEP), q: onGrid(h.q, from, count, STEP) };
  }
  // This week's point, for anyone still ranked: today's value from the rankings page, so it's never older than the run.
  for (const p of ranked) {
    const s = players[String(p.playerID)];
    if (!s) continue;
    s.n = p.playerName;
    s.t = p.team && p.team !== "FA" ? p.team : null;
    if (p.superflexValues?.value) s.sf[count - 1] = p.superflexValues.value;
    if (p.oneQBValues?.value) s.q[count - 1] = p.oneQBValues.value;
  }

  const history: ValueHistory = { updatedAt: new Date().toISOString(), from, step: STEP, players };
  const firstDate = new Date(from * 86_400_000).toISOString().slice(0, 10);
  console.log(`${Object.keys(players).length} players and picks, ${count} weekly points from ${firstDate}.`);
  if (DRY_RUN) {
    console.log("--dry-run: not writing the file.");
    return;
  }
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(history) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), OUT_PATH)}.`);
}

main().catch((err) => {
  console.error("Value history fetch failed:", err instanceof Error ? err.message : err);
  console.error("Leaving public/data/value-history.json untouched.");
  process.exitCode = 1;
});
