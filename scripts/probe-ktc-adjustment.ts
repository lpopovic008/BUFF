/**
 * Diagnostic, read-only: KTC's trade calculator works its value adjustment out in the browser, so its code is
 * on the page or in a script the page loads — this fetches them and prints every passage about it. Temporary.
 *
 *   npx tsx scripts/probe-ktc-adjustment.ts
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function main() {
  const base = "https://keeptradecut.com";
  const page = await get(`${base}/trade-calculator`);
  const scripts = [...page.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => new URL(m[1], base).href);
  console.log(`page: ${page.length} chars; scripts: ${scripts.join(", ")}`);
  const sources: [string, string][] = [["page", page]];
  for (const src of scripts) {
    if (!src.includes("keeptradecut")) continue;
    try {
      sources.push([src, await get(src)]);
    } catch (err) {
      console.log(`  ${src}: ${err instanceof Error ? err.message : err}`);
    }
  }
  for (const [name, text] of sources) {
    const hits = [...text.matchAll(/adjust/gi)].map((m) => m.index!);
    console.log(`\n=== ${name}: ${text.length} chars, ${hits.length} mentions of "adjust"`);
    // Each passage once: a window around every mention, merged where they overlap.
    let lastEnd = -1;
    for (const at of hits) {
      const from = Math.max(at - 700, lastEnd);
      const to = at + 1500;
      if (from >= to) continue;
      console.log(`--- @${at}\n${text.slice(from, to)}`);
      lastEnd = to;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
