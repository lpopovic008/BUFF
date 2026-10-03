// Each NFL team's official logo, redrawn in pure black and white
// (scripts/team-logos/), served from the site itself.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** A team's black-and-white logo, by Sleeper's team abbreviation. */
export function nflLogoUrl(team: string): string {
  return `${basePath}/team-logos/${team}.svg`;
}
