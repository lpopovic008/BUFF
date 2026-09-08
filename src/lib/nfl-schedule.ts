// Real-time NFL schedule/scores for the Territory Map's "today's games" dots
// and click-through rosters. Sleeper's public API has no schedule endpoint
// at all — this hits ESPN's public scoreboard endpoint directly instead.
// It's undocumented but long-stable and widely used by other hobby projects
// straight from the browser (CORS-open, no auth). Defensive throughout: any
// unexpected response shape or network failure returns an empty list rather
// than throwing, same as every other best-effort fetch in this app.

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

// ESPN's team abbreviations mostly match Sleeper's (and TEAM_CITIES' keys);
// Washington is the one known mismatch.
const ESPN_TO_SLEEPER_TEAM: Record<string, string> = {
  WSH: "WAS",
};

function normalizeTeam(abbr: string): string {
  return ESPN_TO_SLEEPER_TEAM[abbr] ?? abbr;
}

export interface GameVenue {
  name: string | null;
  city: string | null;
  /** Absent for venues outside the US, which is part of how they're spotted. */
  state: string | null;
  /** ESPN spells the United States "USA". */
  country: string | null;
}

export interface NFLGame {
  id: string;
  homeTeam: string;
  awayTeam: string;
  /** ISO kickoff time, straight from ESPN. */
  kickoff: string;
  state: "pre" | "in" | "post";
  homeScore: number;
  awayScore: number;
  venue: GameVenue | null;
  /** True when neither team is really at home — the international series, mostly. */
  neutralSite: boolean;
}

// ESPN writes "USA"; the others are here so a spelling change doesn't silently
// exile every game to the "outside the US" list.
const US_COUNTRIES = new Set(["USA", "US", "UNITED STATES"]);

/**
 * Whether this game is being played outside the United States — the London,
 * Munich, Dublin, São Paulo and Melbourne games. Those can't be plotted on a
 * US map, so they get listed separately. A game with no venue data is assumed
 * domestic: the home team's stadium is the far likelier answer, and guessing
 * "abroad" would drop a real dot off the map.
 */
export function isOutsideUS(game: NFLGame): boolean {
  const country = game.venue?.country;
  if (!country) return false;
  return !US_COUNTRIES.has(country.trim().toUpperCase());
}

/** Parses ESPN's scoreboard JSON shape into our own type, tolerating any missing/unexpected field. Exported separately so it's unit-testable without a network call. */
export function parseScoreboard(data: unknown): NFLGame[] {
  const events = isRecord(data) && Array.isArray(data.events) ? data.events : [];
  const games: NFLGame[] = [];
  for (const event of events) {
    if (!isRecord(event)) continue;
    const competitions = Array.isArray(event.competitions) ? event.competitions : [];
    const comp = competitions[0];
    if (!isRecord(comp)) continue;
    const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
    if (competitors.length !== 2) continue;
    const home = competitors.find((c) => isRecord(c) && c.homeAway === "home");
    const away = competitors.find((c) => isRecord(c) && c.homeAway === "away");
    const homeAbbr = teamAbbr(home);
    const awayAbbr = teamAbbr(away);
    if (!homeAbbr || !awayAbbr) continue;
    const status = isRecord(comp.status) ? comp.status : null;
    const statusType = status && isRecord(status.type) ? status.type : null;
    const state = statusType?.state;
    games.push({
      id: typeof event.id === "string" || typeof event.id === "number" ? String(event.id) : `${homeAbbr}-${awayAbbr}`,
      homeTeam: normalizeTeam(homeAbbr),
      awayTeam: normalizeTeam(awayAbbr),
      kickoff: typeof comp.date === "string" ? comp.date : typeof event.date === "string" ? event.date : "",
      state: state === "in" || state === "post" ? state : "pre",
      homeScore: scoreOf(home),
      awayScore: scoreOf(away),
      venue: parseVenue(comp.venue),
      neutralSite: comp.neutralSite === true,
    });
  }
  return games;
}

function parseVenue(raw: unknown): GameVenue | null {
  if (!isRecord(raw)) return null;
  const address = isRecord(raw.address) ? raw.address : null;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    name: str(raw.fullName),
    city: address ? str(address.city) : null,
    state: address ? str(address.state) : null,
    country: address ? str(address.country) : null,
  };
}

async function fetchGames(url: string): Promise<NFLGame[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return parseScoreboard(data);
  } catch {
    return [];
  }
}

/** Today's NFL games (ESPN's scoreboard defaults to "today" with no date param). Never throws. */
export async function getTodaysGames(): Promise<NFLGame[]> {
  return fetchGames(ESPN_SCOREBOARD_URL);
}

/**
 * Every game of one regular-season week — the whole Thursday-through-Monday
 * slate, not just today's. `season` is the year the season started in, the
 * same string Sleeper reports. Never throws.
 */
export async function getWeekGames(season: string, week: number): Promise<NFLGame[]> {
  const url = `${ESPN_SCOREBOARD_URL}?seasontype=2&week=${week}&dates=${encodeURIComponent(season)}`;
  return fetchGames(url);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function teamAbbr(competitor: unknown): string | null {
  if (!isRecord(competitor)) return null;
  const team = competitor.team;
  if (!isRecord(team)) return null;
  return typeof team.abbreviation === "string" ? team.abbreviation : null;
}

function scoreOf(competitor: unknown): number {
  if (!isRecord(competitor)) return 0;
  const n = Number(competitor.score);
  return Number.isFinite(n) ? n : 0;
}
