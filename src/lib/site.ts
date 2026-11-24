// The site's own address, in full — its domain (see next.config.ts's SITE_DOMAIN), or its github.io address until it
// has one — for what has to name it whole: a shared link's preview, the sitemap, robots.txt.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://lpopovic008.github.io/BUFF").replace(/\/+$/, "");

export const SITE_NAME = "Commi$h";
export const SITE_DESCRIPTION =
  "Every fantasy football league you play in, on one screen — Sleeper, ESPN, Yahoo, MyFantasyLeague and Fleaflicker. Live scoring and plays, standings, trades, player values, and the commissioner's weekly write-up.";
