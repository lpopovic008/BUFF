// College logos for the players' cards, ESPN's: the schools NFL players most often come from by ESPN's own ids (no
// lookup), and any other from ESPN's college football teams (the same ESPN as the live scores — see nfl-schedule.ts),
// every FBS and FCS team's names and logo, fetched once a tab — a player's college (as Sleeper names it) matched to one.

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

/** ESPN's ids for the schools NFL players most often come from, by name — their logos with no lookup at all. */
const ESPN_IDS: Record<string, number> = {
  "Alabama": 333,
  "Ohio State": 194,
  "Georgia": 61,
  "LSU": 99,
  "Michigan": 130,
  "Clemson": 228,
  "Texas": 251,
  "Oklahoma": 201,
  "USC": 30,
  "Notre Dame": 87,
  "Florida": 57,
  "Florida State": 52,
  "Miami": 2390,
  "Penn State": 213,
  "Oregon": 2483,
  "Wisconsin": 275,
  "Iowa": 2294,
  "Auburn": 2,
  "Tennessee": 2633,
  "Texas A&M": 245,
  "Texas Tech": 2641,
  "Washington": 264,
  "Stanford": 24,
  "UCLA": 26,
  "Utah": 254,
  "TCU": 2628,
  "Baylor": 239,
  "Oklahoma State": 197,
  "Kentucky": 96,
  "Ole Miss": 145,
  "Mississippi State": 344,
  "Arkansas": 8,
  "South Carolina": 2579,
  "Missouri": 142,
  "Vanderbilt": 238,
  "Minnesota": 135,
  "Nebraska": 158,
  "Purdue": 2509,
  "Illinois": 356,
  "Indiana": 84,
  "Michigan State": 127,
  "Northwestern": 77,
  "Maryland": 120,
  "Rutgers": 164,
  "Pittsburgh": 221,
  "Louisville": 97,
  "NC State": 152,
  "North Carolina": 153,
  "Duke": 150,
  "Virginia": 258,
  "Virginia Tech": 259,
  "Boston College": 103,
  "Syracuse": 183,
  "Wake Forest": 154,
  "Georgia Tech": 59,
  "West Virginia": 277,
  "Kansas State": 2306,
  "Kansas": 2305,
  "Iowa State": 66,
  "Cincinnati": 2132,
  "UCF": 2116,
  "Houston": 248,
  "BYU": 252,
  "Colorado": 38,
  "Arizona": 12,
  "Arizona State": 9,
  "California": 25,
  "Oregon State": 204,
  "Washington State": 265,
  "Boise State": 68,
  "Memphis": 235,
  "SMU": 2567,
  "Tulane": 2655,
  "Toledo": 2649,
  "Western Michigan": 2711,
  "Central Michigan": 2117,
  "Fresno State": 278,
  "San Diego State": 21,
  "Utah State": 328,
  "Wyoming": 2751,
  "Appalachian State": 2026,
  "Marshall": 276,
  "North Dakota State": 2449,
  "Buffalo": 2084,
  "Temple": 218,
  "Navy": 2426,
  "UConn": 41,
  "UAB": 5,
  "Louisiana Tech": 2348,
  "Nevada": 2440,
  "Northern Illinois": 2459,
  "South Dakota State": 2571,
  "Montana": 149,
  "Delaware": 48,
  "Western Kentucky": 98,
  "Troy": 2653,
  "Southern Miss": 2572,
  "East Carolina": 151,
  "Tulsa": 202,
  "Ohio": 195,
  "Miami (OH)": 193,
  "Ball State": 2050,
  "Kent State": 2309,
  "Bowling Green": 189,
  "Hawaii": 62,
  "Colorado State": 36,
  "San Jose State": 23,
  "Rice": 242,
  "North Texas": 249,
  "South Florida": 58,
  "Louisiana": 309,
  "Arkansas State": 2032,
  "Liberty": 2335,
  "Coastal Carolina": 324,
  "Georgia Southern": 290,
  "James Madison": 256,
  "Jackson State": 2296,
  "Grambling": 2755,
  "Youngstown State": 2754,
  "Northern Iowa": 2460,
  "Eastern Washington": 331,
  "Villanova": 222,
  "Princeton": 163,
  "Harvard": 108,
  "Yale": 43,
  "Air Force": 2005,
  "Army": 349,
};
/** The same, by key (see collegeKey). */
const ID_BY_KEY = new Map(Object.entries(ESPN_IDS).map(([name, id]) => [collegeKey(name), id]));

/** ESPN's logo for a school, by its id. */
export const espnCollegeLogo = (id: number) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;

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
  const key = collegeKey(college);
  // One of the schools we know: no lookup.
  const known = ID_BY_KEY.get(ALIASES[key] ?? key) ?? ID_BY_KEY.get(key);
  if (known) return espnCollegeLogo(known);
  const byName = await loadTeams();
  return byName.get(ALIASES[key] ?? key) ?? byName.get(key) ?? null;
}
