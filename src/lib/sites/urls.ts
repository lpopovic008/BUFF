// A league's link on ESPN, Yahoo, MyFantasyLeague or Fleaflicker, read for the league it's to (and, where the link's
// to a team's page, the team) — what Settings adds a league from.

import { OtherSite, siteLeagueId } from "./ids";

export interface LinkedLeague {
  site: OtherSite;
  /** The league's id here (see sites/ids). */
  leagueId: string;
  url: string;
  /** The team the link's to, where it's to one (its roster id here): taken as yours. */
  team?: string;
}

/** Yahoo's NFL game for each past season — part of a league's key ("449.l.12345"); this season's is just "nfl". */
const YAHOO_GAME: Record<string, string> = {
  "2018": "380",
  "2019": "390",
  "2020": "399",
  "2021": "406",
  "2022": "414",
  "2023": "423",
  "2024": "449",
  "2025": "461",
};

/** A Yahoo league's key, from its number and season (`current` the season it is now). */
export function yahooLeagueKey(id: string, season: string, current: string): string {
  return `${season === current ? "nfl" : (YAHOO_GAME[season] ?? "nfl")}.l.${id}`;
}

/**
 * The league a link's to — null if it's not a league link on one of these sites. `season`: the season it is now, for a
 * link that doesn't say.
 */
export function parseLeagueLink(raw: string, season: string): LinkedLeague | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\d*\./, "");
  const href = url.toString();

  if (host.endsWith("espn.com")) {
    // fantasy.espn.com/football/league?leagueId=123&seasonId=2025 (or …/team?leagueId=123&teamId=4)
    const id = url.searchParams.get("leagueId");
    if (!id || !/^\d+$/.test(id)) return null;
    const s = url.searchParams.get("seasonId") ?? season;
    return { site: "espn", leagueId: siteLeagueId({ site: "espn", season: s, id }), url: href, team: url.searchParams.get("teamId") ?? undefined };
  }

  if (host.endsWith("yahoo.com")) {
    // football.fantasysports.yahoo.com/f1/123456 (or …/f1/123456/4, team 4); a past season's: …/2024/f1/123456
    const parts = url.pathname.split("/").filter(Boolean);
    const f = parts.findIndex((p) => /^f\d$/.test(p));
    const id = f >= 0 ? parts[f + 1] : parts.find((p) => /^\d{3,}$/.test(p));
    if (!id || !/^\d+$/.test(id)) return null;
    const s = parts.find((p) => /^20\d\d$/.test(p)) ?? season;
    const team = f >= 0 && /^\d+$/.test(parts[f + 2] ?? "") ? parts[f + 2] : undefined;
    return { site: "yahoo", leagueId: siteLeagueId({ site: "yahoo", season: s, id: yahooLeagueKey(id, s, season) }), url: href, team };
  }

  if (host.endsWith("myfantasyleague.com")) {
    // www45.myfantasyleague.com/2025/home/12345, or …/2025/options?L=12345&F=0003 (franchise 3)
    const s = url.pathname.match(/\/(20\d\d)\//)?.[1] ?? season;
    const id = url.searchParams.get("L") ?? url.pathname.match(/\/home\/(\d+)/)?.[1];
    if (!id || !/^\d+$/.test(id)) return null;
    const franchise = url.searchParams.get("F");
    return { site: "mfl", leagueId: siteLeagueId({ site: "mfl", season: s, id }), url: href, team: franchise ? String(parseInt(franchise, 10)) : undefined };
  }

  if (host.endsWith("fleaflicker.com")) {
    // www.fleaflicker.com/nfl/leagues/123456 (or …/leagues/123456/teams/789)
    const m = url.pathname.match(/\/leagues\/(\d+)(?:\/teams\/(\d+))?/);
    if (!m) return null;
    const s = url.searchParams.get("season") ?? season;
    return { site: "fleaflicker", leagueId: siteLeagueId({ site: "fleaflicker", season: s, id: m[1] }), url: href, team: m[2] };
  }

  return null;
}
