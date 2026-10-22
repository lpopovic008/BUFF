/**
 * Diagnostic, read-only: how often the Internet Archive captured KTC's dynasty
 * rankings, and whether a capture's player table (picks and all) reads.
 *
 *   npx tsx scripts/probe-archive.ts
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

// The archive throttles hard: a pause before every request, a long one after a 429.
async function get(url: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 8000 : 60000 * attempt));
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.text();
      console.log(`  ${url} → ${res.status}`);
    } catch (err) {
      console.log(`  ${url} → ${err instanceof Error ? err.message : err}`);
    }
  }
  return "";
}

function balanced(text: string, open: number): string | null {
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
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return text.slice(open, i + 1);
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function largestPlayerArray(html: string): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let best: any[] = [];
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
        const text = balanced(body, i);
        if (!text) continue;
        i += text.length - 1;
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > best.length && typeof parsed[0]?.playerName === "string") best = parsed;
        } catch {
          // not JSON
        }
      }
    }
  }
  return best;
}

async function main() {
  // Pick pages: KTC's own page for each pick carries its whole value history.
  const cdx = await get(
    "https://web.archive.org/cdx/search/cdx?url=keeptradecut.com/dynasty-rankings/players/20*&output=json&fl=timestamp,original&filter=statuscode:200&from=2019"
  );
  const rows = (cdx ? (JSON.parse(cdx) as string[][]) : []).slice(1);
  const pages = new Map<string, string[]>();
  for (const [ts, original] of rows) {
    const slug = original.replace(/^.*\/players\//, "").replace(/[?#].*$/, "");
    if (!/^20\d\d-/.test(slug)) continue;
    pages.set(slug, [...(pages.get(slug) ?? []), ts]);
  }
  console.log(`${rows.length} captures, ${pages.size} pick pages:`);
  for (const [slug, ts] of [...pages].sort()) console.log(`  ${slug}: ${ts.length} (${ts[0].slice(0, 8)} … ${ts[ts.length - 1].slice(0, 8)})`);

  // One pick page from before its draft: how far back does its history go?
  const pick = [...pages].find(([slug]) => /^2026-(mid-1st|pick-1-0[5-8])/.test(slug)) ?? [...pages].find(([slug]) => /^2026-/.test(slug)) ?? [...pages][0];
  if (pick) {
    const [slug, stamps] = pick;
    const ts = stamps[stamps.length - 1];
    const html = await get(`https://web.archive.org/web/${ts}id_/https://keeptradecut.com/dynasty-rankings/players/${slug}`);
    console.log(`\n${slug} @ ${ts}: ${html.length} chars`);
    for (const id of ["pd-superflex", "pd-oneqb"]) {
      const m = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`).exec(html);
      if (!m) {
        console.log(`  no #${id}`);
        continue;
      }
      const values = (JSON.parse(m[1]) as { overallValue?: { d: string; v: number }[] }).overallValue ?? [];
      console.log(`  #${id}: ${values.length} days, ${values[0]?.d} … ${values[values.length - 1]?.d}; e.g. ${values.filter((_, i) => i % 60 === 0).map((p) => `${p.d}:${p.v}`).join(" ")}`);
    }
  }

  // And a rankings capture from January 2026: does its table read?
  const ranked = await get("https://web.archive.org/cdx/search/cdx?url=keeptradecut.com/dynasty-rankings&output=json&fl=timestamp&filter=statuscode:200&from=202601&to=202602");
  const ts = (ranked ? (JSON.parse(ranked) as string[][]) : []).slice(1)[0]?.[0];
  if (ts) {
    const html = await get(`https://web.archive.org/web/${ts}id_/https://keeptradecut.com/dynasty-rankings`);
    const players = largestPlayerArray(html);
    const picks = players.filter((p) => p.position === "RDP");
    console.log(`\nrankings @ ${ts}: ${players.length} players, ${picks.length} picks: ${picks.slice(0, 40).map((p) => `${p.playerName}=${p.superflexValues?.value ?? "?"}`).join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
