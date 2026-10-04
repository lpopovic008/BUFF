// Where a league's win-probability lines are kept:
//
// - In this browser: the league page records a point each time it refreshes
//   during games, so a reload picks the line up where it left off. Raw
//   localStorage on purpose, outside localStore.ts: it's written every few
//   seconds during games, and doesn't belong in the account sync (which
//   pushes on every localStore write).
// - On the game-day recorder's branch: scripts/record-win-prob.ts records
//   every matchup in the commish's leagues every 5 minutes while games are
//   on, so the line is whole even when nobody had the page open. Served
//   straight from the public repo's `winprob-data` branch.

import { mergeLines, PackedPoint, packLine, unpackLine, WinProbPoint } from "./win-probability";

export { matchupKey } from "./win-probability";

const KEY = "commish:winprob";
const RECORDED_URL = "https://raw.githubusercontent.com/lpopovic008/BUFF/winprob-data/winprob";

/** One league's lines for one week, as stored here and on the recorder's branch. */
export interface StoredWeek {
  /** "season-week" — another week's lines are dropped, not mixed in. */
  week: string;
  /** By matchup key (the two roster ids, low-high). */
  lines: Record<string, PackedPoint[]>;
}

function readAll(): Record<string, StoredWeek> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, StoredWeek>) : {};
  } catch {
    return {};
  }
}

function unpackWeek(stored: StoredWeek | null | undefined, week: string): Record<string, WinProbPoint[]> {
  if (!stored || stored.week !== week || !stored.lines || typeof stored.lines !== "object") return {};
  return Object.fromEntries(Object.entries(stored.lines).map(([key, packed]) => [key, unpackLine(packed)]));
}

/** This league's lines recorded in this browser for the given week (empty for any other week). */
export function loadWinProbLines(leagueId: string, week: string): Record<string, WinProbPoint[]> {
  return unpackWeek(readAll()[leagueId], week);
}

/** Saves this league's lines for the week, replacing any older week's. */
export function saveWinProbLines(leagueId: string, week: string, lines: Record<string, WinProbPoint[]>): void {
  try {
    const all = readAll();
    all[leagueId] = { week, lines: Object.fromEntries(Object.entries(lines).map(([key, points]) => [key, packLine(points)])) };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the line just won't outlive this page.
  }
}

// The recorder writes every 5 minutes; no point asking GitHub more often.
const RECORDED_MAX_AGE_MS = 2 * 60_000;
const recordedCache = new Map<string, { at: number; promise: Promise<StoredWeek | null> }>();

/** The game-day recorder's lines for this league and week (empty if it hasn't recorded this league, or not this week). Never throws. */
export async function fetchRecordedLines(leagueId: string, week: string): Promise<Record<string, WinProbPoint[]>> {
  let cached = recordedCache.get(leagueId);
  if (!cached || Date.now() - cached.at > RECORDED_MAX_AGE_MS) {
    const promise = fetch(`${RECORDED_URL}/${leagueId}.json`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<StoredWeek>) : null))
      .catch(() => null);
    cached = { at: Date.now(), promise };
    recordedCache.set(leagueId, cached);
  }
  return unpackWeek(await cached.promise, week);
}

/** This browser's lines with the recorder's merged in, by matchup key. */
export function mergeRecorded(local: Record<string, WinProbPoint[]>, recorded: Record<string, WinProbPoint[]>): Record<string, WinProbPoint[]> {
  const out = { ...local };
  for (const [key, line] of Object.entries(recorded)) out[key] = mergeLines(out[key] ?? [], line);
  return out;
}
