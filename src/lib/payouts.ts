import { SleeperMatchup } from "./sleeper";
import { LeagueProfile, PayoutRules } from "./league-config";

export interface WeekResult {
  week: number;
  rosterId: number;
  points: number;
  won: boolean;
  tied: boolean;
  isHighScorer: boolean;
  payout: number;
}

export interface ManagerLedger {
  rosterId: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  highScoreWeeks: number[];
  /** week number → payout for that week (0 when they earned nothing). */
  weekly: Record<number, number>;
  weeklyTotal: number;
  finalBonus: number;
  total: number;
}

export interface PotReconciliation {
  pot: number;
  /** Committed to weekly commission across a full regular season. */
  projectedWeekly: number;
  /** Committed to end-of-season placements. */
  finalTotal: number;
  /** pot − projectedWeekly − finalTotal. Non-zero means the rules don't balance. */
  unallocated: number;
  balances: boolean;
}

export interface PayoutLedger {
  managers: ManagerLedger[];
  results: WeekResult[];
  weeksPlayed: number[];
  paidToDate: number;
  reconciliation: PotReconciliation;
}

/** Games that actually happened: a week counts only once both teams have scored. */
function pairWeek(matchups: SleeperMatchup[]): SleeperMatchup[][] {
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    if (m.matchup_id == null) continue;
    const list = byId.get(m.matchup_id) ?? [];
    list.push(m);
    byId.set(m.matchup_id, list);
  }
  return Array.from(byId.values()).filter((pair) => pair.length === 2);
}

function weekHasBeenPlayed(matchups: SleeperMatchup[]): boolean {
  return matchups.some((m) => m.points > 0);
}

export function computePayoutLedger({
  matchupsByWeek,
  rosterNames,
  profile,
  teamCount,
}: {
  matchupsByWeek: Map<number, SleeperMatchup[]>;
  rosterNames: Map<number, string>;
  profile: LeagueProfile;
  teamCount: number;
}): PayoutLedger {
  const rules = profile.payouts;
  const ledgers = new Map<number, ManagerLedger>();
  const ensure = (rosterId: number): ManagerLedger => {
    let l = ledgers.get(rosterId);
    if (!l) {
      l = {
        rosterId,
        name: profile.managerNamesByRosterId[rosterId] ?? rosterNames.get(rosterId) ?? `Roster ${rosterId}`,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        highScoreWeeks: [],
        weekly: {},
        weeklyTotal: 0,
        finalBonus: 0,
        total: 0,
      };
      ledgers.set(rosterId, l);
    }
    return l;
  };
  for (const rosterId of rosterNames.keys()) ensure(rosterId);

  const results: WeekResult[] = [];
  const weeksPlayed: number[] = [];

  for (let week = 1; week <= rules.regularSeasonWeeks; week++) {
    const matchups = matchupsByWeek.get(week) ?? [];
    if (!weekHasBeenPlayed(matchups)) continue;
    weeksPlayed.push(week);

    const games = pairWeek(matchups);
    if (games.length === 0) continue;

    // Highest score across everyone who played this week.
    const scored = games.flat();
    const topPoints = Math.max(...scored.map((m) => m.points));

    for (const [a, b] of games) {
      for (const [team, opp] of [
        [a, b],
        [b, a],
      ] as const) {
        const ledger = ensure(team.roster_id);
        const won = team.points > opp.points;
        const tied = team.points === opp.points;
        const isHighScorer = team.points === topPoints;

        let payout = 0;
        if (won) payout += rules.perWin;
        if (isHighScorer) {
          payout = rules.highScoreStacks
            ? payout + rules.weeklyHighScore
            : Math.max(payout, rules.weeklyHighScore);
        }

        ledger.pointsFor += team.points;
        if (won) ledger.wins += 1;
        else if (tied) ledger.ties += 1;
        else ledger.losses += 1;
        if (isHighScorer) ledger.highScoreWeeks.push(week);
        ledger.weekly[week] = payout;
        ledger.weeklyTotal += payout;

        results.push({
          week,
          rosterId: team.roster_id,
          points: team.points,
          won,
          tied,
          isHighScorer,
          payout,
        });
      }
    }
  }

  for (const ledger of ledgers.values()) {
    ledger.total = ledger.weeklyTotal + ledger.finalBonus;
  }

  const managers = Array.from(ledgers.values()).sort(
    (x, y) => y.total - x.total || y.pointsFor - x.pointsFor
  );
  const paidToDate = managers.reduce((sum, m) => sum + m.total, 0);

  return {
    managers,
    results,
    weeksPlayed,
    paidToDate,
    reconciliation: reconcilePot(rules, teamCount),
  };
}

/**
 * Checks the rules actually add up to the pot. A commish-facing sanity check:
 * change the team count, week count, or any amount and this says whether the
 * money still balances.
 */
export function reconcilePot(rules: PayoutRules, teamCount: number): PotReconciliation {
  const pot = rules.buyIn * teamCount;
  const winnersPerWeek = Math.floor(teamCount / 2);
  const perWeek = rules.highScoreStacks
    ? winnersPerWeek * rules.perWin + rules.weeklyHighScore
    : (winnersPerWeek - 1) * rules.perWin + rules.weeklyHighScore;
  const projectedWeekly = perWeek * rules.regularSeasonWeeks;
  const finalTotal = rules.finalPayouts.reduce((sum, p) => sum + p.amount, 0);
  const unallocated = pot - projectedWeekly - finalTotal;
  return {
    pot,
    projectedWeekly,
    finalTotal,
    unallocated,
    balances: unallocated === 0,
  };
}

export interface WeekMoneySummary {
  week: number;
  highScorer: { rosterId: number; name: string; points: number } | null;
  winners: { rosterId: number; name: string; points: number; payout: number }[];
  /** Everyone who played, richest score first, for the "Last week Results" block. */
  scoreboard: { rosterId: number; name: string; points: number; won: boolean }[];
}

export function summarizeWeek(ledger: PayoutLedger, week: number): WeekMoneySummary | null {
  const rows = ledger.results.filter((r) => r.week === week);
  if (rows.length === 0) return null;
  const nameFor = (rosterId: number) =>
    ledger.managers.find((m) => m.rosterId === rosterId)?.name ?? `Roster ${rosterId}`;

  const top = rows.find((r) => r.isHighScorer) ?? null;
  return {
    week,
    highScorer: top
      ? { rosterId: top.rosterId, name: nameFor(top.rosterId), points: top.points }
      : null,
    winners: rows
      .filter((r) => r.won)
      .sort((a, b) => b.points - a.points)
      .map((r) => ({
        rosterId: r.rosterId,
        name: nameFor(r.rosterId),
        points: r.points,
        payout: r.payout,
      })),
    scoreboard: rows
      .slice()
      .sort((a, b) => b.points - a.points)
      .map((r) => ({ rosterId: r.rosterId, name: nameFor(r.rosterId), points: r.points, won: r.won })),
  };
}

/** Running money totals through a given week, for the "Updated Standings" block. */
export function standingsThroughWeek(
  ledger: PayoutLedger,
  week: number
): { name: string; amount: number }[] {
  return ledger.managers
    .map((m) => {
      let amount = 0;
      for (const [w, v] of Object.entries(m.weekly)) {
        if (Number(w) <= week) amount += v;
      }
      return { name: m.name, amount };
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export interface CumulativeSeries {
  rosterId: number;
  name: string;
  /** One point per played week, running total through that week. */
  points: { week: number; amount: number }[];
  finalAmount: number;
}

/**
 * Each manager's running earnings by week — the line-chart equivalent of the
 * sheet's cumulative "Total" column. Sorted richest-final-total first, which
 * is also the order end-of-line labels should stack top to bottom.
 */
export function cumulativeSeriesByManager(ledger: PayoutLedger): CumulativeSeries[] {
  return ledger.managers
    .map((m) => {
      let running = 0;
      const points = ledger.weeksPlayed.map((week) => {
        running += m.weekly[week] ?? 0;
        return { week, amount: running };
      });
      return { rosterId: m.rosterId, name: m.name, points, finalAmount: running };
    })
    .sort((a, b) => b.finalAmount - a.finalAmount);
}
