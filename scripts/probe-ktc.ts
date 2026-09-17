/**
 * Temporary diagnostic probe for why fetch-player-values.ts's extraction
 * fails on https://keeptradecut.com/fantasy-rankings (dynasty-rankings
 * still succeeds via the raw-script-tag fallback). Dumps script tag
 * candidates and why each one is or isn't accepted as the player array.
 * Deleted once the real fix lands — this never runs in the scheduled
 * workflow.
 *
 *   npx tsx scripts/probe-ktc.ts
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  return res.text();
}

async function probe(url: string, label: string) {
  console.log(`\n=== ${label}: ${url} ===`);
  const html = await fetchHtml(url);
  console.log(`received ${html.length} bytes`);

  console.log(`has "var playersArray": ${html.includes("var playersArray")}`);
  console.log(`has "__NEXT_DATA__": ${html.includes("__NEXT_DATA__")}`);
  console.log(`has "__NUXT__": ${html.includes("__NUXT__")}`);
  console.log(`has "playerName": ${html.includes("playerName")}`);
  console.log(`has "oneQBValues": ${html.includes("oneQBValues")}`);

  const scriptBlobs = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  console.log(`total <script> blocks: ${scriptBlobs.length}`);
  const candidates = scriptBlobs.filter((s) => s.includes("value") || s.includes("Value"));
  console.log(`blocks containing "value"/"Value": ${candidates.length}`);

  candidates.forEach((blob, i) => {
    console.log(`\n--- candidate ${i} (length ${blob.length}) ---`);
    console.log(`  contains "playerName": ${blob.includes("playerName")}`);
    console.log(`  contains "oneQBValues": ${blob.includes("oneQBValues")}`);
    const arrayMatch = blob.match(/(\[\s*\{[\s\S]*?\}\s*\])/);
    console.log(`  non-greedy array regex matched: ${Boolean(arrayMatch)}${arrayMatch ? ` (matched length ${arrayMatch[1].length})` : ""}`);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[1]);
        console.log(`  parsed OK: array of ${Array.isArray(parsed) ? parsed.length : "N/A"}`);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`  first item keys: ${Object.keys(parsed[0]).join(", ")}`);
        }
      } catch (err) {
        console.log(`  JSON.parse failed: ${err instanceof Error ? err.message : err}`);
        console.log(`  first 300 chars of matched text: ${arrayMatch[1].slice(0, 300)}`);
        console.log(`  last 300 chars of matched text: ${arrayMatch[1].slice(-300)}`);
      }
    } else {
      console.log(`  first 300 chars of blob: ${blob.slice(0, 300)}`);
    }
  });
}

async function main() {
  await probe("https://keeptradecut.com/dynasty-rankings", "dynasty rankings");
  await probe("https://keeptradecut.com/fantasy-rankings", "fantasy (redraft) rankings");
}

main().catch((err) => {
  console.error("Probe failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
