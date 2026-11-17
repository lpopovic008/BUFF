/**
 * A team's color — its home jersey's (see HOME), by Sleeper's team abbreviation — tinting its side of a game's header
 * in the starters list (see .team-bar in globals.css, which lifts the darkest toward white on a dark page so they still
 * show). The page's ink, for a team it doesn't know.
 */
export function teamColor(team: string): string {
  return HOME[team]?.[1] ?? "var(--ink-primary)";
}

// Each team's home uniform as of the 2026 season: its helmet, its colored jersey and the numbers on it, and its pants.
// On the road, the jersey's white and its numbers the team's color.
const HOME: Record<string, [helmet: string, jersey: string, numbers: string, pants: string]> = {
  ARI: ["#ffffff", "#97233f", "#ffffff", "#ffffff"],
  // 2026: back to red at home, under the black helmet.
  ATL: ["#101820", "#a71930", "#ffffff", "#ffffff"],
  BAL: ["#101820", "#241773", "#ffffff", "#ffffff"],
  BUF: ["#ffffff", "#00338d", "#ffffff", "#ffffff"],
  CAR: ["#a5acaf", "#101820", "#ffffff", "#ffffff"],
  CHI: ["#0b162a", "#0b162a", "#ffffff", "#ffffff"],
  CIN: ["#fb4f14", "#101820", "#ffffff", "#ffffff"],
  CLE: ["#ff3c00", "#311d00", "#ff3c00", "#ffffff"],
  DAL: ["#869397", "#003594", "#ffffff", "#869397"],
  DEN: ["#002244", "#fb4f14", "#002244", "#ffffff"],
  DET: ["#b0b7bc", "#0076b6", "#ffffff", "#b0b7bc"],
  GB: ["#ffb612", "#203731", "#ffffff", "#ffb612"],
  HOU: ["#03202f", "#03202f", "#ffffff", "#ffffff"],
  IND: ["#ffffff", "#002c5f", "#ffffff", "#ffffff"],
  JAX: ["#101820", "#006778", "#ffffff", "#ffffff"],
  KC: ["#e31837", "#e31837", "#ffffff", "#ffffff"],
  LAC: ["#ffffff", "#0080c6", "#ffffff", "#ffffff"],
  LAR: ["#003594", "#003594", "#ffd100", "#ffffff"],
  LV: ["#a5acaf", "#101820", "#ffffff", "#a5acaf"],
  MIA: ["#ffffff", "#008e97", "#ffffff", "#ffffff"],
  MIN: ["#4f2683", "#4f2683", "#ffffff", "#ffffff"],
  NE: ["#b0b7bc", "#002244", "#ffffff", "#ffffff"],
  NO: ["#d3bc8d", "#101820", "#d3bc8d", "#d3bc8d"],
  NYG: ["#0b2265", "#0b2265", "#ffffff", "#a5acaf"],
  NYJ: ["#ffffff", "#125740", "#ffffff", "#ffffff"],
  PHI: ["#004c54", "#004c54", "#ffffff", "#ffffff"],
  PIT: ["#101820", "#101820", "#ffb612", "#ffb612"],
  SEA: ["#002244", "#002244", "#ffffff", "#a5acaf"],
  SF: ["#b3995d", "#aa0000", "#ffffff", "#b3995d"],
  TB: ["#34302b", "#d50a0a", "#ffffff", "#34302b"],
  // 2026: the Oilers-inspired look — a white helmet, light "Titans blue" at home.
  TEN: ["#ffffff", "#4b92db", "#ffffff", "#ffffff"],
  WAS: ["#5a1414", "#5a1414", "#ffb612", "#ffb612"],
};


/** Each team's name, as painted in its end zone (see FloorFields), by Sleeper's team abbreviation. */
const NAMES: Record<string, string> = {
  ARI: "Cardinals",
  ATL: "Falcons",
  BAL: "Ravens",
  BUF: "Bills",
  CAR: "Panthers",
  CHI: "Bears",
  CIN: "Bengals",
  CLE: "Browns",
  DAL: "Cowboys",
  DEN: "Broncos",
  DET: "Lions",
  GB: "Packers",
  HOU: "Texans",
  IND: "Colts",
  JAX: "Jaguars",
  KC: "Chiefs",
  LAC: "Chargers",
  LAR: "Rams",
  LV: "Raiders",
  MIA: "Dolphins",
  MIN: "Vikings",
  NE: "Patriots",
  NO: "Saints",
  NYG: "Giants",
  NYJ: "Jets",
  PHI: "Eagles",
  PIT: "Steelers",
  SEA: "Seahawks",
  SF: "49ers",
  TB: "Buccaneers",
  TEN: "Titans",
  WAS: "Commanders",
};

/** A team's name ("Bears") — its abbreviation, for a team it doesn't know. */
export function teamName(team: string): string {
  return NAMES[team] ?? team;
}

// Each team's secondary color: the one beside its main color in its marks and its end zones (a gold, a silver, an
// orange) — striping its end zone either side of its name (see FloorFields).
const SECONDARY: Record<string, string> = {
  ARI: "#ffb612",
  ATL: "#a5acaf",
  BAL: "#9e7c0c",
  BUF: "#c60c30",
  CAR: "#0085ca",
  CHI: "#c83803",
  CIN: "#000000",
  CLE: "#ff3c00",
  DAL: "#869397",
  DEN: "#002244",
  DET: "#b0b7bc",
  GB: "#ffb612",
  HOU: "#a71930",
  IND: "#a2aaad",
  JAX: "#d7a22a",
  KC: "#ffb81c",
  LAC: "#ffc20e",
  LAR: "#ffd100",
  LV: "#a5acaf",
  MIA: "#fc4c02",
  MIN: "#ffc62f",
  NE: "#c60c30",
  NO: "#d3bc8d",
  NYG: "#a71930",
  NYJ: "#ffffff",
  PHI: "#a5acaf",
  PIT: "#ffb612",
  SEA: "#69be28",
  SF: "#b3995d",
  TB: "#ff7900",
  TEN: "#0c2340",
  WAS: "#ffb612",
};

/** A team's secondary color (see SECONDARY) — its main one (teamColor), for a team it doesn't know. */
export function teamSecondary(team: string): string {
  return SECONDARY[team] ?? teamColor(team);
}
