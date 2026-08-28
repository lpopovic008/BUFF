// Turns a pasted ESPN/Yahoo league URL into a stored ExternalLeague — best
// effort only. If a league id (and, for ESPN, a season) can't be picked out
// of the URL, the entry still saves with just the raw link; it just won't
// get a live ESPN preview (see EspnLeaguePreview).

export type ExternalPlatform = "espn" | "yahoo";

export interface ParsedExternalLeague {
  platform: ExternalPlatform;
  url: string;
  leagueId?: string;
  season?: string;
}

export function detectPlatform(url: URL): ExternalPlatform | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host.endsWith("espn.com")) return "espn";
  if (host.endsWith("yahoo.com")) return "yahoo";
  return null;
}

/** Returns null if the text isn't a parseable http(s) URL on espn.com or yahoo.com. */
export function parseExternalLeagueUrl(raw: string): ParsedExternalLeague | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const platform = detectPlatform(url);
  if (!platform) return null;

  if (platform === "espn") {
    const leagueId = url.searchParams.get("leagueId") ?? undefined;
    const season = url.searchParams.get("seasonId") ?? extractYearFromPath(url) ?? undefined;
    return { platform, url: url.toString(), leagueId, season };
  }

  // Yahoo league URLs are like https://football.fantasysports.yahoo.com/f1/123456
  // (optionally with a trailing /<teamId>) — the league id is the first
  // numeric path segment after the sport code.
  const leagueId = url.pathname.split("/").find((seg) => /^\d+$/.test(seg));
  return { platform, url: url.toString(), leagueId };
}

function extractYearFromPath(url: URL): string | undefined {
  const match = url.pathname.match(/\/(20\d{2})\//);
  return match?.[1];
}
