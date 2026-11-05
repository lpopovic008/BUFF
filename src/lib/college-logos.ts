// College logos for the players' cards, from ESPN's college football teams (the same ESPN as the live scores — see
// nfl-schedule.ts): every FBS and FCS team's names and logo, fetched once a tab, and a player's college (as Sleeper
// names it) matched to one of them.

const TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams";
/** ESPN's FBS and FCS groups. */
const GROUPS = [80, 81];

interface EspnTeam {
  location?: string;
  name?: string;
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
  logos?: { href?: string; rel?: string[] }[];
}

/** A name as it's compared: lowercase letters and digits only, "St." as "state", no "University (of)". */
export function collegeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\buniversity\b|\buniv\.?\b|\bof\b|\bthe\b/g, "")
    .replace(/\bst\.?(?=\s|$)/g, "state")
    .replace(/[^a-z0-9]/g, "");
}

/** Sleeper's names for schools that ESPN calls something else, both as keys (see collegeKey). */
const ALIASES: Record<string, string> = {
  miamifl: "miami",
  miamiflorida: "miami",
  mississippi: "olemiss",
  centralflorida: "ucf",
  southerncalifornia: "usc",
  louisianastate: "lsu",
  brighamyoung: "byu",
  texaschristian: "tcu",
  southernmethodist: "smu",
  northcarolinastate: "ncstate",
  texaselpaso: "utep",
  texassanantonio: "utsa",
  alabamabirmingham: "uab",
  nevadalasvegas: "unlv",
  louisianalafayette: "louisiana",
  louisianamonroe: "ulmonroe",
  middletennesseestate: "middletennessee",
  floridainternational: "fiu",
  connecticut: "uconn",
  massachusetts: "umass",
  pittsburgh: "pittsburgh",
  appalachianstate: "appstate",
  hawaii: "hawaii",
  ohio: "ohio",
};

let teams: Promise<Map<string, string>> | null = null;

/** Every team's logo, by each of its names (as keys). */
function loadTeams(): Promise<Map<string, string>> {
  teams ??= (async () => {
    const byName = new Map<string, string>();
    for (const group of GROUPS) {
      try {
        const res = await fetch(`${TEAMS_URL}?groups=${group}&limit=1000`);
        if (!res.ok) continue;
        const data = (await res.json()) as { sports?: { leagues?: { teams?: { team?: EspnTeam }[] }[] }[] };
        for (const entry of data.sports?.[0]?.leagues?.[0]?.teams ?? []) {
          const t = entry.team;
          const logo = t?.logos?.find((l) => l.rel?.includes("default"))?.href ?? t?.logos?.[0]?.href;
          if (!t || !logo) continue;
          // Its place name first, so a school's own name wins over another's nickname.
          for (const name of [t.location, t.shortDisplayName, t.abbreviation, t.displayName]) {
            const key = name ? collegeKey(name) : "";
            if (key && !byName.has(key)) byName.set(key, logo);
          }
        }
      } catch {
        // No logos from this group; the rest still match.
      }
    }
    return byName;
  })();
  return teams;
}

/** A player's college's logo — null when ESPN has none by that name (or can't be reached). */
export async function collegeLogo(college: string | null | undefined): Promise<string | null> {
  if (!college) return null;
  const byName = await loadTeams();
  const key = collegeKey(college);
  return byName.get(ALIASES[key] ?? key) ?? byName.get(key) ?? null;
}
