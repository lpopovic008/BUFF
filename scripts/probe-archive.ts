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
  // KTC's own pages for picks long drafted (their slugs from the archive's captures): still served, history and all?
  for (const slug of ["2026-mid-1st-1528", "2026-mid-2nd-1531", "2025-mid-1st-1362", "2024-mid-1st-1294", "2023-mid-1st-1096", "2022-mid-1st-953"]) {
    const res = await fetch(`https://keeptradecut.com/dynasty-rankings/players/${slug}`, { headers: { "User-Agent": UA } }).catch(() => null);
    const html = res?.ok ? await res.text() : "";
    console.log(`\n${slug}: ${res?.status ?? "failed"} ${res?.url ?? ""}, ${html.length} chars`);
    for (const id of ["pd-superflex", "pd-oneqb"]) {
      const m = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`).exec(html);
      if (!m) {
        console.log(`  no #${id}`);
        continue;
      }
      const values = (JSON.parse(m[1]) as { overallValue?: { d: string; v: number }[] }).overallValue ?? [];
      console.log(`  #${id}: ${values.length} days, ${values[0]?.d} … ${values[values.length - 1]?.d}; ${values.filter((_, i) => i % 45 === 0).map((p) => `${p.d}:${p.v}`).join(" ")}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
