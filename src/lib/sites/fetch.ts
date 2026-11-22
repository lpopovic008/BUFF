// Reading another fantasy site's data from the visitor's browser. ESPN's league feed can be read straight from here
// (it says any website may), and MyFantasyLeague's and Fleaflicker's are tried that way first; what can't be — a
// private ESPN league (its login cookies have to go with the request, and a browser won't send another site's), a
// feed that turns out not to allow it, and all of Yahoo (a sign-in held by a server) — goes by way of this app's
// own small function on its Supabase project, `league-sites` (see supabase/functions/league-sites), which asks the
// site for it and passes back what it says. Each answer is kept a while (as long as each caller says), so the same
// view drawn again doesn't ask again.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Whether the app's league-sites function is there to go by (a dev checkout may have no Supabase project). */
export const relayConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Asks the league-sites function to do something (see its own file for what each `op` takes). */
export async function relay<T>(body: Record<string, unknown>): Promise<{ status: number; json: T | null }> {
  if (!relayConfigured) return { status: 0, json: null };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/league-sites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { status?: number; body?: T } | T | null;
  // A relayed request comes back as the site's own status and body.
  if (body.op === "fetch" && json && typeof json === "object" && "status" in json) {
    const relayed = json as { status: number; body?: T };
    return { status: relayed.status, json: relayed.body ?? null };
  }
  return { status: res.status, json: json as T | null };
}

const kept = new Map<string, { at: number; promise: Promise<unknown> }>();

/** Something worked out once, kept `ttlSeconds` (a failure's not kept). */
export function keep<T>(key: string, ttlSeconds: number, work: () => Promise<T>): Promise<T> {
  const was = kept.get(key);
  if (was && Date.now() - was.at < ttlSeconds * 1000) return was.promise as Promise<T>;
  const promise = work();
  kept.set(key, { at: Date.now(), promise });
  promise.catch(() => kept.delete(key));
  return promise;
}

/** Forgets everything kept (a login's changed: what was read without it, or with the last one, may differ now). */
export function forgetKept(): void {
  kept.clear();
}

export interface SiteRequest {
  url: string;
  /** Cookies to send with it: only by way of the relay. */
  cookies?: Record<string, string>;
  /** Straight from the browser first (the site allows it, or may), else only by way of the relay. */
  direct?: boolean;
}

/**
 * A site's JSON for `url`, kept `ttlSeconds` — null when there's none to be had (no such league, a private one with no
 * login for it, the site or the relay down). Never throws.
 */
export function siteJson<T>(req: SiteRequest, ttlSeconds: number): Promise<T | null> {
  const key = `${req.url}|${req.cookies ? Object.values(req.cookies).join("|") : ""}`;
  return keep(key, ttlSeconds, async () => {
    if (req.direct !== false && !req.cookies) {
      try {
        const res = await fetch(req.url);
        if (res.ok) return (await res.json()) as T;
        // Turned away (a private league, say): the relay won't do better without a login.
        if (res.status === 404 || res.status === 401 || res.status === 403) return null;
      } catch {
        // Not allowed to read it from here (or the network's down): try the relay.
      }
    }
    try {
      const { status, json } = await relay<T>({ op: "fetch", url: req.url, cookies: req.cookies });
      return status >= 200 && status < 300 ? json : null;
    } catch {
      return null;
    }
  }).catch(() => null);
}

/** Many of a site's answers come as one thing where there's one and a list where there are more: always a list. */
export function asList<T>(v: T | T[] | null | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** A number from a site's string or number, 0 where there's none. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Sleeper's split of a season's points into whole points and hundredths. */
export function pointsSettings(total: number): { whole: number; decimal: number } {
  const whole = Math.floor(total);
  return { whole, decimal: Math.round((total - whole) * 100) };
}

/**
 * The NFL week a moment falls in, for a site that dates its transactions but doesn't say which week: weeks run
 * Wednesday to Tuesday from the one holding the season's first Thursday game (the Thursday after Labor Day, the
 * first Monday of September). Before it, week 1.
 */
export function nflWeekAt(at: number, season: string): number {
  const year = Number(season);
  const sept1 = new Date(Date.UTC(year, 8, 1));
  const laborDay = 1 + ((8 - sept1.getUTCDay()) % 7);
  // The Wednesday before the season's first game (Labor Day + 2 days), and a few hours' slack into Thursday for
  // anything time-zoned west.
  const start = Date.UTC(year, 8, laborDay + 2, 8);
  if (at < start) return 1;
  return Math.min(18, Math.floor((at - start) / (7 * 86400000)) + 1);
}
