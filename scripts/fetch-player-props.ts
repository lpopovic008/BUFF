/**
 * Fetches NFL player prop odds (passing yards, passing TDs, rushing yards,
 * receptions, etc.) from The Odds API and writes a normalized snapshot to
 * src/data/player-props.json — the source for the War Room's "sportsbook
 * fantasy points" section (each prop's line, converted to fantasy points
 * under the chosen league's own scoring settings).
 *
 * Runs server-side in CI (see .github/workflows/player-props.yml) for two
 * reasons: it needs an API key that must never reach client-side JS (a key
 * embedded in the static site would be readable by anyone from page source
 * and could drain the account's quota), and — same as the KTC/ADP
 * pipelines — the app itself only ever reads the committed static snapshot.
 *
 * The Odds API (the-odds-api.com) is a licensed odds aggregator, not a
 * scrape of any sportsbook's private app API. It requires ODDS_API_KEY
 * (an environment variable, from the repo's ODDS_API_KEY Actions secret).
 * Real player-prop requests cost API credits (the account's plan, not
 * this project's to spend carelessly) — this fetches props only for events
 * that give a plausible reason to care (the shape is confirmed once via
 * --probe, which spends minimal credits: the events list is typically free,
 * and only ONE event's props are fetched to inspect the response).
 *
 *   npx tsx scripts/fetch-player-props.ts             # write the file
 *   npx tsx scripts/fetch-player-props.ts --dry-run    # print, change nothing
 *   npx tsx scripts/fetch-player-props.ts --probe      # minimal-cost shape check, write nothing
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { PlayerPropEntry, PlayerPropLine, PlayerPropsSnapshot } from "../src/lib/player-props";

const DRY_RUN = process.argv.includes("--dry-run");
const PROBE = process.argv.includes("--probe");
const OUT_PATH = path.join(process.cwd(), "src", "data", "player-props.json");

const API_KEY = process.env.ODDS_API_KEY;
const BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl";

// Priority order: try the sharpest book first, fall back down the list to
// whichever the account's plan/region actually returns for a given event.
// Pinnacle and Circa are the two books the sports-betting community treats
// as the closest thing to a genuinely efficient (low-vig, sharp-money-
// driven) market; DraftKings/FanDuel are recreational-book fallbacks in
// case neither sharp book has a line up for a given player/market.
const BOOKMAKER_PRIORITY = ["pinnacle", "circasports", "draftkings", "fanduel"];

const MARKETS = [
  "player_pass_yds",
  "player_pass_tds",
  "player_pass_interceptions",
  "player_rush_yds",
  "player_rush_tds",
  "player_reception_yds",
  "player_receptions",
  "player_reception_tds",
];

interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface OddsApiOutcome {
  name: string; // "Over" | "Under"
  description?: string; // player name
  price: number; // American odds
  point?: number;
}

interface OddsApiMarket {
  key: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: OddsApiMarket[];
}

interface OddsApiEventOdds {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsApiBookmaker[];
}

function requireApiKey(): string {
  if (!API_KEY) {
    throw new Error("ODDS_API_KEY is not set (expected as a repo Actions secret / env var).");
  }
  return API_KEY;
}

async function getJson<T>(url: string): Promise<{ data: T | null; res: Response; text: string }> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) return { data: null, res, text };
  try {
    return { data: JSON.parse(text) as T, res, text };
  } catch {
    return { data: null, res, text };
  }
}

/** Picks, per (player, market), the best-available bookmaker's Over/Under pair — sharpest first per BOOKMAKER_PRIORITY. */
function pickBestLines(bookmakers: OddsApiBookmaker[]): Map<string, PlayerPropLine & { playerName: string }> {
  // key: `${playerName}::${market}`
  const best = new Map<string, PlayerPropLine & { playerName: string }>();
  const rank = (key: string) => {
    const i = BOOKMAKER_PRIORITY.indexOf(key);
    return i === -1 ? BOOKMAKER_PRIORITY.length : i;
  };
  const sorted = [...bookmakers].sort((a, b) => rank(a.key) - rank(b.key));

  for (const book of sorted) {
    for (const market of book.markets) {
      if (!MARKETS.includes(market.key)) continue;
      const byPlayer = new Map<string, { over?: OddsApiOutcome; under?: OddsApiOutcome }>();
      for (const outcome of market.outcomes) {
        if (!outcome.description) continue;
        const entry = byPlayer.get(outcome.description) ?? {};
        if (outcome.name === "Over") entry.over = outcome;
        else if (outcome.name === "Under") entry.under = outcome;
        byPlayer.set(outcome.description, entry);
      }
      for (const [playerName, { over, under }] of byPlayer) {
        const point = over?.point ?? under?.point;
        if (point == null) continue;
        const key = `${playerName}::${market.key}`;
        if (best.has(key)) continue; // already filled by a higher-priority book
        best.set(key, {
          playerName,
          market: market.key,
          point,
          overOdds: over?.price ?? null,
          underOdds: under?.price ?? null,
          bookmaker: book.key,
        });
      }
    }
  }
  return best;
}

async function probe() {
  const key = requireApiKey();
  const eventsUrl = `${BASE}/events?apiKey=${key}`;
  console.log(`Fetching events list: ${BASE}/events`);
  const { data: events, res: eventsRes, text: eventsText } = await getJson<OddsApiEvent[]>(eventsUrl);
  console.log(`  status: ${eventsRes.status} ${eventsRes.statusText}`);
  console.log(`  x-requests-remaining: ${eventsRes.headers.get("x-requests-remaining")}`);
  console.log(`  x-requests-used: ${eventsRes.headers.get("x-requests-used")}`);
  if (!events) {
    console.log(`  body (first 800 chars): ${eventsText.slice(0, 800)}`);
    return;
  }
  console.log(`  ${events.length} upcoming events. First 5:`);
  for (const e of events.slice(0, 5)) {
    console.log(`    ${e.id} — ${e.away_team} @ ${e.home_team} (${e.commence_time})`);
  }
  if (events.length === 0) {
    console.log("No upcoming events to probe props against.");
    return;
  }

  const eventId = events[0].id;
  const propsUrl =
    `${BASE}/events/${eventId}/odds?apiKey=${key}&regions=us&oddsFormat=american` +
    `&markets=${MARKETS.join(",")}`;
  console.log(`\nFetching player props for one event (${eventId}):`);
  const { data: eventOdds, res: propsRes, text: propsText } = await getJson<OddsApiEventOdds>(propsUrl);
  console.log(`  status: ${propsRes.status} ${propsRes.statusText}`);
  console.log(`  x-requests-remaining: ${propsRes.headers.get("x-requests-remaining")}`);
  console.log(`  x-requests-used: ${propsRes.headers.get("x-requests-used")}`);
  if (!eventOdds) {
    console.log(`  body (first 1500 chars): ${propsText.slice(0, 1500)}`);
    return;
  }
  console.log(`  bookmakers returned: ${eventOdds.bookmakers.map((b) => b.key).join(", ") || "(none)"}`);
  for (const book of eventOdds.bookmakers.slice(0, 3)) {
    console.log(`  --- ${book.key} ---`);
    for (const market of book.markets.slice(0, 3)) {
      console.log(`    market: ${market.key}`);
      console.log(`    sample outcomes: ${JSON.stringify(market.outcomes.slice(0, 4))}`);
    }
  }
  console.log(`\n  full first-bookmaker JSON (first 2000 chars): ${JSON.stringify(eventOdds.bookmakers[0]).slice(0, 2000)}`);
}

async function main() {
  if (PROBE) {
    await probe();
    return;
  }

  const key = requireApiKey();
  const { data: events } = await getJson<OddsApiEvent[]>(`${BASE}/events?apiKey=${key}`);
  if (!events) throw new Error("Could not fetch NFL events list.");

  // Only events within the next 8 days — the upcoming week's slate. The
  // Odds API only lists events it actually has odds coverage for anyway.
  const cutoff = Date.now() + 8 * 24 * 60 * 60 * 1000;
  const upcoming = events.filter((e) => new Date(e.commence_time).getTime() <= cutoff);
  console.log(`${upcoming.length} of ${events.length} listed events fall within the next 8 days.`);

  const playerMap = new Map<string, PlayerPropEntry>();
  for (const event of upcoming) {
    const url =
      `${BASE}/events/${event.id}/odds?apiKey=${key}&regions=us&oddsFormat=american` +
      `&markets=${MARKETS.join(",")}`;
    const { data: eventOdds } = await getJson<OddsApiEventOdds>(url);
    if (!eventOdds) {
      console.log(`  no odds for ${event.away_team} @ ${event.home_team} — skipping.`);
      continue;
    }
    const bestLines = pickBestLines(eventOdds.bookmakers);
    for (const { playerName, ...line } of bestLines.values()) {
      const entry = playerMap.get(playerName) ?? {
        name: playerName,
        team: null,
        opponent: null,
        kickoff: event.commence_time,
        props: [],
      };
      entry.props.push(line);
      playerMap.set(playerName, entry);
    }
    console.log(`  ${event.away_team} @ ${event.home_team}: ${bestLines.size} prop lines from ${eventOdds.bookmakers.length} book(s).`);
  }

  const snapshot: PlayerPropsSnapshot = {
    updatedAt: new Date().toISOString(),
    source: "the-odds-api",
    bookmakersRequested: BOOKMAKER_PRIORITY,
    week: null,
    season: null,
    players: [...playerMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };

  console.log(`\n${snapshot.players.length} players with at least one prop line.`);

  if (DRY_RUN) {
    console.log("--dry-run: not writing file.");
    return;
  }

  await fs.writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error("Player props fetch failed:", err instanceof Error ? err.message : err);
  console.error("Leaving existing src/data/player-props.json untouched.");
  process.exitCode = 1;
});
