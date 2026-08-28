// Minimal read-only client for ESPN Fantasy Football's public league API.
// No login, no API key — this only works for leagues ESPN itself treats as
// public. A private league's data requires session cookies (espn_s2, SWID)
// that only the manager's own logged-in browser has, which this app never
// asks for or stores; those leagues just fall back to a plain outbound link.
//
// Confirmed live (via a GitHub Actions probe, since this domain isn't
// reachable from the dev sandbox) that this host sends a permissive
// Access-Control-Allow-Origin, so the fetch below works directly from the
// visitor's browser with no proxy.
const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

export interface EspnLeagueSummary {
  id: string;
  name: string;
  size: number;
  scoringType?: string;
}

interface EspnLeagueResponse {
  id?: number;
  settings?: {
    name?: string;
    size?: number;
    scoringSettings?: { scoringType?: string };
  };
  teams?: unknown[];
}

/** Never throws — a private league, a bad id, or a network/CORS failure should just mean "no preview," not a broken page. */
export async function getPublicLeague(leagueId: string, season: string): Promise<EspnLeagueSummary | null> {
  try {
    const res = await fetch(`${BASE}/${season}/segments/0/leagues/${leagueId}?view=mSettings`);
    if (!res.ok) return null;
    const data = (await res.json()) as EspnLeagueResponse;
    if (!data.settings?.name) return null;
    return {
      id: leagueId,
      name: data.settings.name,
      size: data.settings.size ?? data.teams?.length ?? 0,
      scoringType: data.settings.scoringSettings?.scoringType,
    };
  } catch {
    return null;
  }
}
