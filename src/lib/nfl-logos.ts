// Each NFL team's current primary logo (full-color SVG, shown in its own
// colors), served from the site itself. Most come from the ISC-licensed nfl-team-logos package; the Bears'
// bear head, the Jets' and the Titans' 2026 logos are from their Wikipedia
// articles, and the Rams' 2026 logo is traced from ESPN's.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Bumped whenever the logo files change, so browsers holding an older copy
// under the same path (the black-and-white ones did for a while) fetch fresh.
const LOGO_VERSION = "color-5";

/** A team's logo, by Sleeper's team abbreviation. */
export function nflLogoUrl(team: string): string {
  return `${basePath}/team-logos/${team}.svg?v=${LOGO_VERSION}`;
}

// Each logo file is cropped to its drawing; this is its width over height.
const LOGO_ASPECT: Record<string, number> = {
  ARI: 1.11,
  ATL: 1.05,
  BAL: 2.03,
  BUF: 1.48,
  CAR: 1.81,
  CHI: 1.01,
  CIN: 1.41,
  CLE: 1.31,
  DAL: 1.05,
  DEN: 1.68,
  DET: 1.3,
  GB: 1.51,
  HOU: 1.09,
  IND: 0.95,
  JAX: 1.33,
  KC: 1.56,
  LAC: 2.21,
  LAR: 1.37,
  LV: 0.94,
  MIA: 1.26,
  MIN: 0.82,
  NE: 2.03,
  NO: 0.82,
  NYG: 1.28,
  NYJ: 1.65,
  PHI: 1.44,
  PIT: 1,
  SEA: 2.21,
  SF: 1.67,
  TB: 1.12,
  TEN: 1,
  WAS: 1.81,
};

/**
 * A team logo's width and height in px, sized so every logo covers about
 * the same area as a `side`-px square: a wide one (the Chargers' bolt) runs
 * wider and shorter, a tall one (the Vikings) a little taller, so none looks
 * smaller than the rest just for its shape.
 */
export function nflLogoSize(team: string, side: number): { width: number; height: number } {
  const r = Math.sqrt(LOGO_ASPECT[team] ?? 1);
  return { width: Math.round(side * r * 10) / 10, height: Math.round((side / r) * 10) / 10 };
}

/** The widest any team's logo is drawn at `side` (see nflLogoSize) — a slot this wide fits every logo. */
export function nflLogoMaxWidth(side: number): number {
  return Math.max(...Object.keys(LOGO_ASPECT).map((team) => nflLogoSize(team, side).width), side);
}
