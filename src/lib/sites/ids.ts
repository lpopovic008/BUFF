// Leagues on other fantasy sites than Sleeper — ESPN, Yahoo, MyFantasyLeague and Fleaflicker — go through the app as
// Sleeper's do, under an id of their own that says which site, which season and the site's own league id:
// "espn-2025-123456". Sleeper's own ids are only digits, so the two never clash. A league's draft is the league's id
// with "~draft" after it.

export type Site = "sleeper" | "espn" | "yahoo" | "mfl" | "fleaflicker";
export type OtherSite = Exclude<Site, "sleeper">;

export const SITE_LABEL: Record<Site, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
  mfl: "MFL",
  fleaflicker: "Fleaflicker",
};

/** A league on another site: which, the season, and the site's own id for it (Yahoo's league key, "449.l.12345"). */
export interface SiteLeagueRef {
  site: OtherSite;
  season: string;
  id: string;
}

/** The season of a league known only by its link, no league in it to read (see sites/readable): "espn-0000-…". */
export const LINK_ONLY_SEASON = "0000";

const PATTERN = /^(espn|yahoo|mfl|fleaflicker)-(\d{4})-(.+)$/;
const DRAFT = "~draft";

export function siteLeagueId(ref: SiteLeagueRef): string {
  return `${ref.site}-${ref.season}-${ref.id}`;
}

/** The league an id names on another site — null for one of Sleeper's. */
export function parseSiteLeagueId(leagueId: string): SiteLeagueRef | null {
  const m = PATTERN.exec(leagueId);
  return m ? { site: m[1] as OtherSite, season: m[2], id: m[3] } : null;
}

/** Which site a league's on. */
export function siteOf(leagueId: string): Site {
  return parseSiteLeagueId(leagueId)?.site ?? "sleeper";
}

export function siteDraftId(leagueId: string): string {
  return `${leagueId}${DRAFT}`;
}

/** The league whose draft a draft id is, if it's another site's. */
export function parseSiteDraftId(draftId: string): SiteLeagueRef | null {
  return draftId.endsWith(DRAFT) ? parseSiteLeagueId(draftId.slice(0, -DRAFT.length)) : null;
}

/** The same league a season earlier, where the site keeps one id for a league from season to season. */
export function previousSeasonId(ref: SiteLeagueRef): string {
  return siteLeagueId({ ...ref, season: String(Number(ref.season) - 1) });
}

/** Team abbreviations as Sleeper writes them, from the ways the other sites do. */
const TEAM_ALIASES: Record<string, string> = {
  WSH: "WAS",
  JAC: "JAX",
  KCC: "KC",
  GBP: "GB",
  NEP: "NE",
  NOS: "NO",
  SFO: "SF",
  TBB: "TB",
  LVR: "LV",
  OAK: "LV",
  SD: "LAC",
  SDC: "LAC",
  STL: "LAR",
  LA: "LAR",
  ARZ: "ARI",
  BLT: "BAL",
  CLV: "CLE",
  HST: "HOU",
};

export function sleeperTeam(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const up = abbr.toUpperCase();
  return TEAM_ALIASES[up] ?? up;
}
