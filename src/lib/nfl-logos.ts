// Each NFL team's official logo (full-color SVG), served from the site itself.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** A team's logo, by Sleeper's team abbreviation. */
export function nflLogoUrl(team: string): string {
  return `${basePath}/team-logos/${team}.svg`;
}
