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

export interface NFLGame {
  id: string;
  homeTeam: string;
  awayTeam: string;
  /** ISO kickoff time, straight from ESPN. */
  kickoff: string;
  state: "pre" | "in" | "post";
  homeScore: number;
  awayScore: number;
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
    });
  }
  return games;
}

/** Today's NFL games (ESPN's scoreboard defaults to "today" with no date param). Never throws. */
export async function getTodaysGames(): Promise<NFLGame[]> {
  try {
    const res = await fetch(ESPN_SCOREBOARD_URL);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return parseScoreboard(data);
  } catch {
    return [];
  }
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
