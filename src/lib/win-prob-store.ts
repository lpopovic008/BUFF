// The win-probability lines recorded in this browser, one week per league.
// Sleeper keeps no history of win chances, so the league page records a
// point each time it refreshes during games and keeps them here, so a reload
// (or coming back later) picks the line up where it left off.
//
// Raw localStorage on purpose, outside localStore.ts: this is written every
// few seconds during games, and doesn't belong in the account sync (which
// pushes on every localStore write).

import { WinProbPoint } from "./win-probability";

const KEY = "commish:winprob";

/** Compact: [seconds since epoch, p × 10000, a × 100, b × 100]. */
type Packed = [number, number, number, number];

interface StoredWeek {
  /** "season-week" — another week's lines are dropped, not mixed in. */
  week: string;
  /** By matchup key (the two roster ids, low-high). */
  lines: Record<string, Packed[]>;
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

/** The two roster ids, low first, as one key — the same either way round. */
export function matchupKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** This league's recorded lines for the given week (empty for any other week). */
export function loadWinProbLines(leagueId: string, week: string): Record<string, WinProbPoint[]> {
  const stored = readAll()[leagueId];
  if (!stored || stored.week !== week || !stored.lines) return {};
  const out: Record<string, WinProbPoint[]> = {};
  for (const [key, packed] of Object.entries(stored.lines)) {
    if (!Array.isArray(packed)) continue;
    out[key] = packed.map(([t, p, a, b]) => ({ t: t * 1000, p: p / 10000, a: a / 100, b: b / 100 }));
  }
  return out;
}

/** Saves this league's lines for the week, replacing any older week's. */
export function saveWinProbLines(leagueId: string, week: string, lines: Record<string, WinProbPoint[]>): void {
  try {
    const all = readAll();
    const packed: Record<string, Packed[]> = {};
    for (const [key, points] of Object.entries(lines)) {
      packed[key] = points
        .filter((pt) => !pt.synthetic)
        .map((pt) => [Math.round(pt.t / 1000), Math.round(pt.p * 10000), Math.round(pt.a * 100), Math.round(pt.b * 100)]);
    }
    all[leagueId] = { week, lines: packed };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the line just won't outlive this page.
  }
}
