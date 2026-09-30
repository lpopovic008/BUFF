// Each NFL team's primary brand colour — used to soft-highlight a game
// matchup title so the away and home team read at a glance, the same idea
// as the map/league colour tokens elsewhere but tied to a real team instead
// of a palette slot. Keys match the abbreviations in warroom-team-cities.ts.

export const NFL_TEAM_COLORS: Record<string, string> = {
  ARI: "#97233F",
  ATL: "#A71930",
  BAL: "#241773",
  BUF: "#00338D",
  CAR: "#0085CA",
  CHI: "#0B162A",
  CIN: "#FB4F14",
  CLE: "#311D00",
  DAL: "#041E42",
  DEN: "#FB4F14",
  DET: "#0076B6",
  GB: "#203731",
  HOU: "#03202F",
  IND: "#002C5F",
  JAX: "#101820",
  KC: "#E31837",
  LAC: "#0080C6",
  LAR: "#003594",
  LV: "#000000",
  MIA: "#008E97",
  MIN: "#4F2683",
  NE: "#002244",
  NO: "#D3BC8D",
  NYG: "#0B2265",
  NYJ: "#125740",
  PHI: "#004C54",
  PIT: "#FFB612",
  SEA: "#002244",
  SF: "#AA0000",
  TB: "#D50A0A",
  TEN: "#4B92DB",
  WAS: "#5A1414",
};

/** A team's brand colour, or a neutral grey for anything unrecognised. */
export function teamColor(team: string | null): string {
  return (team && NFL_TEAM_COLORS[team]) || "var(--ink-muted)";
}

/** The same colour at low opacity, for softly tinting a team's half of a matchup title. */
export function teamTint(team: string | null, percent = 16): string {
  return `color-mix(in srgb, ${teamColor(team)} ${percent}%, transparent)`;
}
