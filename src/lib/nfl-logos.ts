// Each NFL team's current primary logo, repainted in black, grey and white,
// served from the site itself. Every team has a light-mode and a dark-mode
// file: the same painting, plus a thin border when the logo's outer edge
// would vanish into the background (black for a white edge on light, white
// for a black edge on dark).

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Bumped whenever the logo files change, so browsers holding an older copy
// under the same path fetch fresh.
const LOGO_VERSION = "paint-1";

/** A team's logo for light or dark mode, by Sleeper's team abbreviation. */
export function nflLogoUrl(team: string, mode: "light" | "dark"): string {
  return `${basePath}/team-logos/${mode}/${team}.svg?v=${LOGO_VERSION}`;
}
