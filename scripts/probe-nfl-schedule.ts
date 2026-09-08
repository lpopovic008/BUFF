/**
 * TEMPORARY diagnostic probe: confirms ESPN's scoreboard accepts a
 * week/season query (rather than just "today"), and dumps the venue shape so
 * international games can be told apart from ones played at a home stadium.
 * Delete once the dashboard's schedule box is built and verified.
 */

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

interface AnyObj {
  [key: string]: unknown;
}

async function get(url: string): Promise<AnyObj | null> {
  const res = await fetch(url);
  console.log(`  ${res.status} ${res.statusText}  ${url}`);
  if (!res.ok) return null;
  return (await res.json()) as AnyObj;
}

function rec(v: unknown): AnyObj | null {
  return typeof v === "object" && v !== null ? (v as AnyObj) : null;
}

async function dumpWeek(season: number, week: number, seasontype = 2) {
  const data = await get(`${BASE}?seasontype=${seasontype}&week=${week}&dates=${season}`);
  if (!data) return;
  const events = Array.isArray(data.events) ? data.events : [];
  console.log(`  week ${week}: ${events.length} events`);
  const leagues = Array.isArray(data.leagues) ? data.leagues : [];
  const l0 = rec(leagues[0]);
  if (l0) {
    console.log(`  league season block: ${JSON.stringify(l0.season)}`);
  }
  for (const e of events) {
    const ev = rec(e);
    if (!ev) continue;
    const comp = rec((Array.isArray(ev.competitions) ? ev.competitions : [])[0]);
    if (!comp) continue;
    const venue = rec(comp.venue);
    const addr = venue ? rec(venue.address) : null;
    const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
    const names = competitors.map((c) => {
      const cc = rec(c);
      const team = cc ? rec(cc.team) : null;
      return `${cc?.homeAway}:${team?.abbreviation}`;
    });
    console.log(
      `    ${ev.date} ${names.join(" ")} | venue="${venue?.fullName}" ` +
        `addr=${JSON.stringify(addr)} neutral=${comp.neutralSite}`
    );
  }
}

async function main() {
  console.log("=== default (today) ===");
  const today = await get(BASE);
  if (today) {
    const events = Array.isArray(today.events) ? today.events : [];
    console.log(`  ${events.length} events today`);
  }

  for (const week of [1, 2, 5, 6, 7, 10]) {
    console.log(`\n=== 2026 regular season week ${week} ===`);
    await dumpWeek(2026, week);
  }

  // Last season had known international games — useful for the venue shape
  // even if 2026's schedule isn't fully populated yet.
  console.log(`\n=== 2025 regular season week 5 (international check) ===`);
  await dumpWeek(2025, 5);
}

main().catch((err) => {
  console.error("probe failed:", err);
  process.exitCode = 1;
});
