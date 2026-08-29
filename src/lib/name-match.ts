// Shared name normalization for matching a player's identity across sources
// that share no common id — Sleeper, KeepTradeCut, and yafsb's ADP data all
// spell names slightly differently (accents, punctuation, suffixes), so
// every name-based cross-reference in this app (KTC-to-Sleeper-roster in
// matchup-players.ts, ADP-to-Sleeper-id in players.ts) normalizes through
// this one function first.

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (e.g. "e" + combining acute -> "e")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // drop punctuation (periods, apostrophes, hyphens)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "") // suffixes are inconsistent between sources
    .replace(/\s+/g, " ")
    .trim();
}
