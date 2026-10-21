/**
 * KeepTradeCut values over time, for the values page's trade analyzer — what
 * every player and draft pick in a trade was worth then, and since.
 *
 *   npx tsx scripts/fetch-value-history.ts --probe    # print a player page's shape, write nothing
 */

const PROBE = process.argv.includes("--probe");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  return res.text();
}

/** The `[...]` starting at `open`, brackets balanced outside of strings. */
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

async function probe() {
  const html = await fetchHtml("https://keeptradecut.com/dynasty-rankings");
  const at = [...html.matchAll(/var\s+playersArray\s*=\s*\[/g)].map((m) => m.index! + m[0].length - 1);
  let players: Record<string, unknown>[] = [];
  for (const i of at) {
    const text = balanced(html, i, "[]");
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>[]) : [];
    if (parsed.length > players.length) players = parsed;
  }
  console.log(`playersArray: ${players.length} entries`);
  const first = players[0];
  console.log(`a player's keys: ${Object.keys(first ?? {}).join(", ")}`);
  console.log(`a player (values cut): ${JSON.stringify(first).slice(0, 900)}`);
  const pick = players.find((p) => p.position === "RDP");
  console.log(`a pick (values cut): ${JSON.stringify(pick).slice(0, 600)}`);
  for (const p of [first, pick]) {
    const slug = p?.slug as string | undefined;
    if (!slug) continue;
    const url = `https://keeptradecut.com/dynasty-rankings/players/${slug}`;
    console.log(`\nFetching ${url}`);
    const page = await fetchHtml(url);
    console.log(`  ${page.length} chars; script vars: ${[...new Set([...page.matchAll(/var\s+(\w+)\s*=/g)].map((m) => m[1]))].join(", ")}`);
    for (const m of page.matchAll(/var\s+(\w+)\s*=\s*\{/g)) {
      const obj = balanced(page, m.index! + m[0].length - 1, "{}");
      if (!obj) continue;
      console.log(`  var ${m[1]} (${obj.length} chars): ${obj.slice(0, 400)}`);
      for (const key of ["overallValue", "valueHistory", "history"]) {
        const k = obj.indexOf(`"${key}"`);
        if (k >= 0) console.log(`    ${key}: ${obj.slice(k, k + 300)} … ${obj.slice(Math.max(k, obj.indexOf("]", k) - 120), obj.indexOf("]", k) + 1)}`);
      }
    }
    const dv = page.search(/\{"d":"\d{4}-\d\d-\d\d","v":/);
    console.log(`  first {"d","v"}: ${dv >= 0 ? page.slice(Math.max(0, dv - 120), dv + 200) : "none"}`);
  }
}

if (PROBE) {
  probe().catch((err) => {
    console.error("Probe failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
