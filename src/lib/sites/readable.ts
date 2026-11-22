// Whether a league can be read here — the rest of the app shows only those that can (see visibleLeagues). Every
// Sleeper league can, and any league on ESPN, MyFantasyLeague or Fleaflicker (one that turns out private just shows
// nothing); a Yahoo league only once you're signed in to Yahoo and the app's league-sites function is there to read
// it through. Any other's listed in Settings link only, to open on its site.

import { LINK_ONLY_SEASON, parseSiteLeagueId } from "./ids";
import { getLogins } from "./logins";
import { relayConfigured } from "./fetch";

export function leagueReadable(leagueId: string): boolean {
  const ref = parseSiteLeagueId(leagueId);
  if (!ref) return true;
  // A link that didn't say which league (kept from before leagues on other sites could be read): link only.
  if (ref.season === LINK_ONLY_SEASON) return false;
  if (ref.site === "yahoo") return relayConfigured && Boolean(getLogins().yahoo);
  return true;
}
