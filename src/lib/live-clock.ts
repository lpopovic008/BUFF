// One shared clock for everything that follows live scoring — Sleeper's
// matchups, ESPN's scoreboard, the Red Zone feed. Every subscriber reloads on
// the same tick, so the ticker, the lineups and the feed all move together,
// and one tick asks each source once however many components show it.
//
// The pace follows the games themselves (from ESPN's scoreboard): fast while
// any game is being played, slower when the next kickoff is close, and close
// to still when nothing is on. A hidden tab doesn't tick at all; it catches up
// the moment it's shown again. When ESPN's score changes in a game, the next
// tick comes early, since Sleeper's points for that play are usually right
// behind it.

import { getTodaysGames, NFLGame } from "./nfl-schedule";

export type LiveMode = "live" | "soon" | "idle";

/** How long to wait between ticks in each mode. */
export const LIVE_INTERVAL_MS: Record<LiveMode, number> = {
  live: 15_000,
  soon: 60_000,
  idle: 300_000,
};

/** Within this long of a kickoff, the clock wakes up to the "soon" pace. */
const SOON_WINDOW_MS = 30 * 60_000;
/** The early follow-up after ESPN shows a score change. */
const SCORE_CHANGE_FOLLOW_UP_MS = 5_000;

/**
 * How fresh a cached response must be for a tick to reuse it: long enough for
 * every subscriber reloading on one tick to share a single request, and well
 * short of the fastest tick, so the next tick always asks again.
 */
export const LIVE_TTL_SECONDS = 5;

/** The pace a set of games calls for: any game being played is "live"; a kickoff within half an hour (or one that's late starting) is "soon". */
export function liveModeFor(games: NFLGame[], now: number): LiveMode {
  if (games.some((g) => g.state === "in")) return "live";
  const soon = games.some((g) => {
    if (g.state !== "pre") return false;
    const kickoff = Date.parse(g.kickoff);
    return Number.isFinite(kickoff) && kickoff - now <= SOON_WINDOW_MS;
  });
  return soon ? "soon" : "idle";
}

/** How long until the next tick: the mode's pace, but never sleeping through the start of a kickoff's "soon" window. */
export function nextTickDelay(games: NFLGame[], now: number): number {
  const mode = liveModeFor(games, now);
  let delay = LIVE_INTERVAL_MS[mode];
  if (mode === "idle") {
    for (const g of games) {
      if (g.state !== "pre") continue;
      const kickoff = Date.parse(g.kickoff);
      if (!Number.isFinite(kickoff)) continue;
      const wake = kickoff - SOON_WINDOW_MS - now;
      if (wake > 0) delay = Math.min(delay, wake);
    }
  }
  return Math.max(1_000, delay);
}

/** Whether any game's score moved between two scoreboard reads (games missing from either side don't count). */
export function scoresChanged(before: NFLGame[], after: NFLGame[]): boolean {
  const prev = new Map(before.map((g) => [g.id, g]));
  return after.some((g) => {
    const p = prev.get(g.id);
    return !!p && (p.homeScore !== g.homeScore || p.awayScore !== g.awayScore);
  });
}

let tick = 0;
let mode: LiveMode = "soon";
let games: NFLGame[] = [];
let lastTickAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(fire, delay);
}

function fire() {
  timer = null;
  if (listeners.size === 0) return;
  // Hidden: stop here; the visibility listener picks it back up.
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  tick += 1;
  lastTickAt = Date.now();
  for (const listener of listeners) listener();
  // Until the scoreboard answers, assume the current pace.
  schedule(LIVE_INTERVAL_MS[mode]);
  void refreshPace();
}

async function refreshPace() {
  const fetched = await getTodaysGames();
  if (fetched.length === 0) return; // a failed read keeps the current pace
  const changed = scoresChanged(games, fetched);
  games = fetched;
  const now = Date.now();
  const nextMode = liveModeFor(fetched, now);
  const modeChanged = nextMode !== mode;
  mode = nextMode;
  if (modeChanged) for (const listener of listeners) listener();
  if (listeners.size === 0 || timer === null) return;
  const sinceTick = now - lastTickAt;
  const delay = changed && mode === "live" ? SCORE_CHANGE_FOLLOW_UP_MS : nextTickDelay(fetched, now);
  schedule(Math.max(1_000, delay - sinceTick));
}

function onVisibilityChange() {
  if (document.visibilityState !== "visible" || listeners.size === 0) return;
  const overdue = Date.now() - lastTickAt >= LIVE_INTERVAL_MS[mode];
  if (overdue) fire();
  else if (!timer) schedule(LIVE_INTERVAL_MS[mode] - (Date.now() - lastTickAt));
}

/** Subscribes to the clock; the first subscriber starts it, the last one out stops it. */
export function subscribeLiveClock(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    // A fresh page has loaded its data already; the first tick is one pace away.
    if (!lastTickAt) lastTickAt = Date.now();
    if (!timer) schedule(Math.max(1_000, LIVE_INTERVAL_MS[mode] - (Date.now() - lastTickAt)));
    void refreshPace();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

/** How many times the clock has ticked — reload whatever depends on live data when it changes. */
export function liveTick(): number {
  return tick;
}

/** The clock's current pace. */
export function liveMode(): LiveMode {
  return mode;
}
