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

/** The page's full player table: the largest array of player records in any of its scripts (it's a bare JSON array, not a named variable). */
function largestPlayerArray(html: string): Record<string, unknown>[] {
  let best: Record<string, unknown>[] = [];
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

async function probe() {
  const html = await fetchHtml("https://keeptradecut.com/dynasty-rankings");
  const players = largestPlayerArray(html);
  console.log(`player table: ${players.length} entries`);
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
    for (const [, id, body] of page.matchAll(/<script[^>]*id="(pd-[\w-]+)"[^>]*>([\s\S]*?)<\/script>/g)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        console.log(`  #${id}: not JSON (${body.length} chars)`);
        continue;
      }
      if (Array.isArray(parsed)) {
        console.log(`  #${id}: array of ${parsed.length}`);
        continue;
      }
      console.log(`  #${id}: keys ${Object.keys(parsed as object).join(", ")}`);
      // Every array in it longer than a few entries — where a history would be.
      const walk = (node: unknown, path: string) => {
        if (Array.isArray(node)) {
          if (node.length > 3) console.log(`    ${path}: ${node.length} × ${JSON.stringify(node[0]).slice(0, 120)} … last ${JSON.stringify(node[node.length - 1]).slice(0, 120)}`);
          return;
        }
        if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
      };
      walk(parsed, id);
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
