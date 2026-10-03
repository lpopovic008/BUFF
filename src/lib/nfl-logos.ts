// Each NFL team's official logo (full-color SVG), served from the site itself.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Bumped whenever the logo files change, so browsers holding an older copy
// under the same path (the black-and-white ones did for a while) fetch fresh.
const LOGO_VERSION = "color-1";

/** A team's logo, by Sleeper's team abbreviation. */
export function nflLogoUrl(team: string): string {
  return `${basePath}/team-logos/${team}.svg?v=${LOGO_VERSION}`;
}
