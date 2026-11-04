/**
 * A team's color — its home jersey's (see HOME), by Sleeper's team abbreviation — tinting its side of a game's header
 * in the starters list (see .team-bar in globals.css, which lifts the darkest toward white on a dark page so they still
 * show). The page's ink, for a team it doesn't know.
 */
export function teamColor(team: string): string {
  return HOME[team]?.[1] ?? "var(--ink-primary)";
}

// Each team's primary and secondary colors, as the team itself lists them.
const PRIMARY_SECONDARY: Record<string, [primary: string, secondary: string]> = {
  ARI: ["#97233f", "#000000"],
  ATL: ["#a71930", "#000000"],
  BAL: ["#241773", "#000000"],
  BUF: ["#00338d", "#c60c30"],
  CAR: ["#0085ca", "#101820"],
  CHI: ["#0b162a", "#c83803"],
  CIN: ["#fb4f14", "#000000"],
  CLE: ["#311d00", "#ff3c00"],
  DAL: ["#041e42", "#869397"],
  DEN: ["#fb4f14", "#002244"],
  DET: ["#0076b6", "#b0b7bc"],
  GB: ["#203731", "#ffb612"],
  HOU: ["#03202f", "#a71930"],
  IND: ["#002c5f", "#a2aaad"],
  JAX: ["#101820", "#d7a22a"],
  KC: ["#e31837", "#ffb81c"],
  LAC: ["#0080c6", "#ffc20e"],
  LAR: ["#003594", "#ffa300"],
  LV: ["#000000", "#a5acaf"],
  MIA: ["#008e97", "#fc4c02"],
  MIN: ["#4f2683", "#ffc62f"],
  NE: ["#002244", "#c60c30"],
  NO: ["#d3bc8d", "#101820"],
  NYG: ["#0b2265", "#a71930"],
  NYJ: ["#125740", "#000000"],
  PHI: ["#004c54", "#a5acaf"],
  PIT: ["#ffb612", "#101820"],
  SF: ["#aa0000", "#b3995d"],
  SEA: ["#002244", "#69be28"],
  TB: ["#d50a0a", "#ff7900"],
  TEN: ["#0c2340", "#4b92db"],
  WAS: ["#5a1414", "#ffb612"],
};

/** A team's primary color (`fill`) and secondary (`outline`) — none for a team it doesn't know. */
export function jerseyNumberColors(team: string): { fill: string; outline: string } | null {
  const colors = PRIMARY_SECONDARY[team];
  return colors ? { fill: colors[0], outline: colors[1] } : null;
}

/** A team's uniform as a pixel player on the floor wears it (see FloorPlay): helmet, jersey, its numbers, pants, socks. */
export interface Uniform {
  helmet: string;
  jersey: string;
  numbers: string;
  pants: string;
  socks: string;
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

/** The uniform a team wears on the floor: its colors at home, white on the road (a team it doesn't know, gray). */
export function uniformFor(team: string, home: boolean): Uniform {
  const [helmet, jersey, numbers, pants] = HOME[team] ?? ["#8a8a8a", "#5a5a5a", "#ffffff", "#bdbdbd"];
  if (home) return { helmet, jersey, numbers, pants, socks: jersey };
  // On the road: a white jersey, the numbers in the home jersey's color (its numbers' color when the jersey's black).
  const dark = jersey === "#101820" || jersey === "#0b162a" || jersey === "#03202f";
  const away = dark && numbers !== "#ffffff" ? numbers : jersey;
  return { helmet, jersey: "#f2f2f2", numbers: away, pants, socks: away };
}
