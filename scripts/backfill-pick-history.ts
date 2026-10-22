/**
 * Draft picks' KTC values from before this app kept them, from the Internet
 * Archive. KTC drops a pick's page — its whole history with it — once the pick
 * is drafted, but the archive kept copies of those pages (each one carrying
 * the pick's value a day, `#pd-superflex` / `#pd-oneqb`, from when KTC listed
 * it). This takes the latest copy of each year's Mid pick page in every round
 * that public/data/value-history.json hasn't got, and adds its history there,
 * keyed by KTC's id, as the daily run would have — up to the day the copy was
 * made and no further.
 *
 * The archive throttles hard (more so from cloud servers), so it waits between
 * pages, and minutes after a refusal; each page is saved as it comes in.
 *
 *   npx tsx scripts/backfill-pick-history.ts            # every missing Mid pick page
 *   npx tsx scripts/backfill-pick-history.ts --dry-run  # list them, change nothing
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { ValueHistory } from "../src/lib/value-history";
import { onGrid, pageHistory } from "./ktc-pages";

const DRY_RUN = process.argv.includes("--dry-run");
const OUT_PATH = path.join(process.cwd(), "public", "data", "value-history.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const PAUSE_MS = 45_000;
const REFUSED_MS = 300_000;
const TRIES = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A page from the archive — waiting first, and minutes after each refusal — or "" once it's given up. */
async function archived(url: string): Promise<string> {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    await sleep(attempt === 0 ? PAUSE_MS : REFUSED_MS * attempt);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.text();
      console.log(`  ${res.status} (try ${attempt + 1} of ${TRIES})`);
      if (res.status === 404) return "";
    } catch (err) {
      console.log(`  ${err instanceof Error ? err.message : err} (try ${attempt + 1} of ${TRIES})`);
    }
  }
  return "";
}

/** "2026-mid-1st-1528" → its name, as KTC writes it ("2026 Mid 1st"), and KTC's id. */
function pickOf(slug: string): { name: string; id: string } | null {
  const m = /^(20\d\d)-mid-(1st|2nd|3rd|4th)-(\d+)$/.exec(slug);
  return m ? { name: `${m[1]} Mid ${m[2]}`, id: m[3] } : null;
}

async function main() {
  const history = JSON.parse(await fs.readFile(OUT_PATH, "utf8")) as ValueHistory;
  const have = new Set(Object.values(history.players).map((s) => s.n));

  // Every capture of a pick page; the latest of each missing Mid pick (the most history).
  console.log("Listing the archive's captures of KTC's pick pages…");
  const cdx = await archived(
    "https://web.archive.org/cdx/search/cdx?url=keeptradecut.com/dynasty-rankings/players/20*&output=json&fl=timestamp,original&filter=statuscode:200"
  );
  if (!cdx) throw new Error("couldn't list the archive's captures");
  const latest = new Map<string, { ts: string; original: string }>();
  for (const [ts, original] of (JSON.parse(cdx) as string[][]).slice(1)) {
    const slug = original.replace(/^.*\/players\//, "").replace(/[?#].*$/, "");
    const pick = pickOf(slug);
    if (!pick || have.has(pick.name)) continue;
    if (!latest.has(slug) || latest.get(slug)!.ts < ts) latest.set(slug, { ts, original });
  }
  const wanted = [...latest].sort(([a], [b]) => b.localeCompare(a));
  console.log(`${wanted.length} pick pages to fetch: ${wanted.map(([slug, { ts }]) => `${slug}@${ts.slice(0, 8)}`).join(", ")}`);
  if (DRY_RUN) return;

  const count = history.players[Object.keys(history.players)[0]]?.sf.length ?? 0;
  let added = 0;
  for (const [slug, { ts, original }] of wanted) {
    console.log(`${slug} (${ts.slice(0, 8)})…`);
    const page = await archived(`https://web.archive.org/web/${ts}id_/${original}`);
    const sf = pageHistory(page, "pd-superflex");
    const q = pageHistory(page, "pd-oneqb");
    if (sf.length === 0 && q.length === 0) {
      console.log("  no history on it");
      continue;
    }
    const { name, id } = pickOf(slug)!;
    history.players[id] = {
      n: name,
      p: "RDP",
      t: null,
      sf: onGrid(sf, history.from, count, history.step, true),
      q: onGrid(q, history.from, count, history.step, true),
    };
    added++;
    console.log(`  ${sf.length} days, ${new Date(sf[0][0] * 86_400_000).toISOString().slice(0, 10)} to ${new Date(sf[sf.length - 1][0] * 86_400_000).toISOString().slice(0, 10)}`);
    // Saved as each comes in, so a run cut short keeps what it got.
    await fs.writeFile(OUT_PATH, JSON.stringify(history) + "\n");
  }
  console.log(`Added ${added} of ${wanted.length}.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
