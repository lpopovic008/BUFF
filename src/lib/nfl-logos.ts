// Official NFL team logos, served from ESPN's image CDN (the same source as
// the schedule data). Sleeper and ESPN share team abbreviations except
// Washington.

const ESPN_CODE: Record<string, string> = { WAS: "wsh" };

/** A team's logo, sized down by ESPN's image combiner. */
export function nflLogoUrl(team: string, px = 64): string {
  const code = ESPN_CODE[team] ?? team.toLowerCase();
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${code}.png&w=${px}&h=${px}`;
}
