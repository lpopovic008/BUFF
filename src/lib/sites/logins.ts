// What it takes to read a private league on another site: ESPN's two login cookies (espn_s2 and SWID, copied out of
// the browser logged in there), and a Yahoo sign-in (see sites/yahoo). Kept in this browser only — never in the
// config that's synced to an account, nor in a backup file — and sent nowhere but the site's own servers, by way of
// this app's own league-sites function (see sites/fetch).

const KEY = "commish:site-logins";

export interface EspnLogin {
  s2: string;
  swid: string;
}

export interface YahooLogin {
  accessToken: string;
  refreshToken: string;
  /** When the access token runs out (ms since 1970). */
  expiresAt: number;
}

export interface SiteLogins {
  espn?: EspnLogin;
  yahoo?: YahooLogin;
}

const listeners = new Set<() => void>();

/** Told when a login's added, renewed or removed. */
export function onLoginsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLogins(): SiteLogins {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as SiteLogins;
  } catch {
    return {};
  }
}

export function setLogin<K extends keyof SiteLogins>(site: K, login: SiteLogins[K] | null): void {
  if (typeof window === "undefined") return;
  const next = { ...getLogins() };
  if (login) next[site] = login;
  else delete next[site];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // (Storage off: the login lasts as long as nothing — the leagues behind it just aren't read.)
  }
  for (const listener of listeners) listener();
}

/** ESPN's SWID as it's sent, in its braces. */
export function swidCookie(swid: string): string {
  const bare = swid.trim().replace(/^\{|\}$/g, "");
  return `{${bare}}`;
}
