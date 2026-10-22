/**
 * Diagnostic, read-only: how often the Internet Archive captured KTC's dynasty
 * rankings, and whether a capture's player table (picks and all) reads.
 *
 *   npx tsx scripts/probe-archive.ts
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function get(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.text();
      console.log(`  ${url} → ${res.status}`);
    } catch (err) {
      console.log(`  ${url} → ${err instanceof Error ? err.message : err}`);
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
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
  const cdx = await get(
    "https://web.archive.org/cdx/search/cdx?url=keeptradecut.com/dynasty-rankings*&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&from=2019"
  );
  const rows = (cdx ? (JSON.parse(cdx) as string[][]) : []).slice(1);
  console.log(`${rows.length} captures of keeptradecut.com/dynasty-rankings*`);
  const originals = new Map<string, number>();
  for (const [, original] of rows) originals.set(original, (originals.get(original) ?? 0) + 1);
  console.log("Most captured URLs:");
  for (const [u, n] of [...originals].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n}  ${u}`);
  const main = rows.filter(([, o]) => /keeptradecut\.com(:80)?\/dynasty-rankings\/?(\?.*)?$/.test(o));
  const byMonth = new Map<string, number>();
  for (const [ts] of main) byMonth.set(ts.slice(0, 6), (byMonth.get(ts.slice(0, 6)) ?? 0) + 1);
  console.log("Rankings page captures by month:");
  console.log([...byMonth].map(([m, n]) => `${m.slice(0, 4)}-${m.slice(4)}:${n}`).join("  "));

  // A few captures across the years: does the table read, and what are the picks called?
  const want = ["2021", "2023", "202402", "202502", "202601", "202602", "202604"];
  for (const prefix of want) {
    const row = main.find(([ts]) => ts.startsWith(prefix));
    if (!row) {
      console.log(`\n${prefix}: no capture`);
      continue;
    }
    const [ts, original] = row;
    const html = await get(`https://web.archive.org/web/${ts}id_/${original}`);
    const players = largestPlayerArray(html);
    console.log(`\n${ts} ${original}: ${html.length} chars, ${players.length} players`);
    if (players.length === 0) {
      const at = html.search(/playersArray|superflexValues|oneQBValues/);
      console.log(`  no table; first hint at ${at}: ${at >= 0 ? html.slice(Math.max(0, at - 200), at + 300).replace(/\s+/g, " ") : "none"}`);
      continue;
    }
    console.log(`  keys: ${Object.keys(players[0]).join(", ")}`);
    const picks = players.filter((p) => p.position === "RDP");
    console.log(`  ${picks.length} picks: ${picks.map((p) => `${p.playerName}=${p.superflexValues?.value ?? p.value ?? "?"}/${p.oneQBValues?.value ?? "?"}`).join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
