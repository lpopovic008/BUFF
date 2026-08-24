// Per-league commissioner settings: payout rules and real-name mapping.
//
// Matched by league *name* substring rather than league_id, because Sleeper
// mints a new league_id every season. A profile matched on the current season
// also applies to every earlier season in that league's previous_league_id
// chain, so history pages get the same rules and names.

export interface PayoutRules {
  /** Per-team entry fee. buyIn × teams = the total pot. */
  buyIn: number;
  /** Paid to each winning team, each regular-season week. */
  perWin: number;
  /** Paid to the single highest-scoring team, each regular-season week. */
  weeklyHighScore: number;
  /**
   * Whether the high-score bonus stacks on top of a win.
   *
   * false (Epstein Island): the week's high scorer collects `weeklyHighScore`
   * instead of `perWin` — never both. This is what the Dynasty sheet shows: no
   * cell is ever $30, and a winning high scorer is always exactly $20.
   *
   * Note this only changes anything in a week where the high scorer LOST. That
   * never happened across 2025's 14 weeks, so the sheet alone can't prove which
   * rule is in force — flip this to true if the intent is $10 + $10.
   */
  highScoreStacks: boolean;
  /** Weeks that pay weekly commission. Playoff weeks pay nothing. */
  regularSeasonWeeks: number;
  /** End-of-season payouts by final placement (1 = champion). */
  finalPayouts: { place: number; amount: number }[];
}

export interface LeagueProfile {
  /** Lowercase substrings; a league matches if its name contains any of them. */
  matchNames: string[];
  /** Short label for UI, in case the Sleeper league name is unwieldy. */
  label: string;
  /** Default rules — used for any season without an entry in payoutsBySeason. */
  payouts: PayoutRules;
  /**
   * Overrides for specific past seasons whose rules differed from the
   * default, keyed by Sleeper's `season` string (e.g. "2025"). Needed
   * because one LeagueProfile applies to every season in the league's
   * previous_league_id chain — without an override, a rule change made for
   * the current season would silently rewrite prior seasons' history too.
   */
  payoutsBySeason?: Record<string, PayoutRules>;
  /**
   * roster_id → the manager's real name. Roster IDs are stable within a season
   * and normally carry across seasons, which makes them a far better key than
   * team names — this league renames teams almost every week.
   */
  managerNamesByRosterId: Record<number, string>;
}

export const EPSTEIN_ISLAND: LeagueProfile = {
  matchNames: ["epstein island", "epstein", "pigskin pioneer"],
  label: "Epstein Island",
  // Current rules: buy-in went from $100 to $150 starting the 2026 season,
  // same structure scaled 1.5x throughout.
  payouts: {
    buyIn: 150,
    perWin: 15,
    weeklyHighScore: 30,
    highScoreStacks: false,
    regularSeasonWeeks: 14,
    finalPayouts: [
      { place: 1, amount: 127.5 },
      { place: 2, amount: 67.5 },
      { place: 3, amount: 45 },
    ],
  },
  payoutsBySeason: {
    // 2025 was played at the original $100 buy-in — pinned here so its
    // history stays accurate after the 2026 bump.
    "2025": {
      buyIn: 100,
      perWin: 10,
      weeklyHighScore: 20,
      highScoreStacks: false,
      regularSeasonWeeks: 14,
      finalPayouts: [
        { place: 1, amount: 85 },
        { place: 2, amount: 45 },
        { place: 3, amount: 30 },
      ],
    },
  },
  // Mapping taken from the Dynasty sheet's payout tables.
  managerNamesByRosterId: {
    1: "Luka",
    2: "Karan",
    3: "Sage",
    4: "Owen",
    5: "Alek",
    6: "Andres",
    7: "Matt Ly",
    8: "Matt Bj",
    9: "Colin",
    10: "Kye",
  },
};

export const LEAGUE_PROFILES: LeagueProfile[] = [EPSTEIN_ISLAND];

export function findLeagueProfile(leagueName: string | undefined): LeagueProfile | null {
  if (!leagueName) return null;
  const needle = leagueName.toLowerCase();
  return LEAGUE_PROFILES.find((p) => p.matchNames.some((m) => needle.includes(m))) ?? null;
}

/** The rules in force for a given season: its override if one exists, else the default. */
export function payoutsForSeason(profile: LeagueProfile, season: string): PayoutRules {
  return profile.payoutsBySeason?.[season] ?? profile.payouts;
}

/** Real name for a roster when the profile knows one, else the Sleeper team/display name. */
export function managerName(
  profile: LeagueProfile | null,
  rosterId: number,
  fallback: string
): string {
  return profile?.managerNamesByRosterId[rosterId] ?? fallback;
}
