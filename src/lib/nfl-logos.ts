// Each NFL team's current primary logo (full-color SVG, shown in black and
// white through --logo-filter), served from the site itself. Most come from the ISC-licensed nfl-team-logos package; the Bears'
// bear head, the Jets' and the Titans' 2026 logos are from their Wikipedia
// articles, and the Rams' 2026 logo is traced from ESPN's.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Bumped whenever the logo files change, so browsers holding an older copy
// under the same path (the black-and-white ones did for a while) fetch fresh.
const LOGO_VERSION = "color-4";

/** A team's logo, by Sleeper's team abbreviation. */
export function nflLogoUrl(team: string): string {
  return `${basePath}/team-logos/${team}.svg?v=${LOGO_VERSION}`;
}
