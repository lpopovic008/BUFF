// Each NFL team's current official logo (full-color SVG, from the ISC-licensed
// nfl-team-logos package; the Bears keep their primary "C"), served from the
// site itself.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Bumped whenever the logo files change, so browsers holding an older copy
// under the same path (the black-and-white ones did for a while) fetch fresh.
const LOGO_VERSION = "color-2";

/** A team's logo, by Sleeper's team abbreviation. */
export function nflLogoUrl(team: string): string {
  return `${basePath}/team-logos/${team}.svg?v=${LOGO_VERSION}`;
}
