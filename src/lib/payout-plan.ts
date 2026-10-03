// A league's money, set up by the commish: what each manager buys in for,
// and any number of payout rules ("$15 to every matchup winner, weeks 1–14",
// "40% of the pot to the champion", "the rest of the pot to the runner-up").
// computePlanLedger plays a season's results through the rules.

import { SleeperMatchup } from "./sleeper";
import { LeagueProfile } from "./league-config";

/** What a rule pays each of its recipients. */
export type AmountKind =
  /** A fixed dollar amount. */
  | "dollars"
  /** A percentage of the whole pot. */
  | "percent"
  /** Whatever the other rules leave in the pot, shared among this rule's payouts. */
  | "remainder";

/** Who a rule pays — some judged each week, some once the season is over. */
export type AwardKind =
  // Each week
  | "weekHighScore"
  | "weekLowScore"
  | "matchupWinner"
  | "matchupLoser"
  | "biggestWin"
  | "closestWin"
  | "highScoreInLoss"
  | "lowScoreInWin"
  // End of season
  | "finalPlace"
  | "regularSeasonPlace"
  | "seasonPoints"
  | "seasonPointsAgainst"
  | "mostHighScores";

/**
 * Which of an award's ranked teams get paid: exactly the `n`th ("place"),
 * each of the top `n` ("top"), or each of the bottom `n` ("bottom" —
 * `n` = 1 is last place). Matchup winners/losers aren't ranked: each one is paid.
 */
export interface RankSpec {
  mode: "place" | "top" | "bottom";
  n: number;
}

export interface PayoutRule {
  id: string;
  award: AwardKind;
  rank: RankSpec;
  amountKind: AmountKind;
  /** Dollars, or percent of the pot; unused for "remainder". */
  amount: number;
  /** For weekly awards: the weeks it pays, inclusive. */
  fromWeek: number;
  toWeek: number;
  /** Teams tied for a paid spot: split that spot's money, or each get the full amount. */
  ties: "split" | "each";
  /**
   * No double-dipping: anyone an earlier rule already paid (that week, for a
   * weekly award; at season's end, for a season award) is passed over, and a
   * ranked award goes to the next team in line.
   */
  skipIfPaid: boolean;
}

export interface PayoutPlan {
  version: 1;
  /** roster_id → that manager's buy-in. */
  buyIns: Record<number, number>;
  /** Applied in order — which matters for skipIfPaid. */
  rules: PayoutRule[];
}

export interface AwardInfo {
  kind: AwardKind;
  /** Short name for the picker. */
  label: string;
  timing: "weekly" | "season";
  /** Whether it ranks teams (and so takes a RankSpec) or pays everyone who qualifies. */
  ranked: boolean;
  /** Which rank modes make sense for it. */
  modes: RankSpec["mode"][];
}

export const AWARDS: AwardInfo[] = [
  { kind: "weekHighScore", label: "Highest score of the week", timing: "weekly", ranked: true, modes: ["place", "top"] },
  { kind: "weekLowScore", label: "Lowest score of the week", timing: "weekly", ranked: true, modes: ["place", "top"] },
  { kind: "matchupWinner", label: "Every matchup winner", timing: "weekly", ranked: false, modes: [] },
  { kind: "matchupLoser", label: "Every matchup loser", timing: "weekly", ranked: false, modes: [] },
  { kind: "biggestWin", label: "Biggest blowout (margin of victory)", timing: "weekly", ranked: true, modes: ["place", "top"] },
  { kind: "closestWin", label: "Narrowest win", timing: "weekly", ranked: true, modes: ["place", "top"] },
  { kind: "highScoreInLoss", label: "Highest score in a loss", timing: "weekly", ranked: true, modes: ["place", "top"] },
  { kind: "lowScoreInWin", label: "Lowest score in a win", timing: "weekly", ranked: true, modes: ["place", "top"] },
  { kind: "finalPlace", label: "Final finish (after the playoffs)", timing: "season", ranked: true, modes: ["place", "top", "bottom"] },
  { kind: "regularSeasonPlace", label: "Regular-season standings", timing: "season", ranked: true, modes: ["place", "top", "bottom"] },
  { kind: "seasonPoints", label: "Points scored, regular season", timing: "season", ranked: true, modes: ["place", "top", "bottom"] },
  { kind: "seasonPointsAgainst", label: "Points against, regular season", timing: "season", ranked: true, modes: ["place", "top", "bottom"] },
  { kind: "mostHighScores", label: "Weekly high scores, regular season", timing: "season", ranked: true, modes: ["place", "top"] },
];

export function awardInfo(kind: AwardKind): AwardInfo {
  return AWARDS.find((a) => a.kind === kind) ?? AWARDS[0];
}

export function emptyPlan(): PayoutPlan {
  return { version: 1, buyIns: {}, rules: [] };
}

let idCounter = 0;
export function newRuleId(): string {
  idCounter += 1;
  return `r${Date.now().toString(36)}${idCounter}`;
}

/** A sensible first rule: the week's high scorer, every regular-season week. */
export function defaultRule(regularSeasonWeeks: number): PayoutRule {
  return {
    id: newRuleId(),
    award: "weekHighScore",
    rank: { mode: "place", n: 1 },
    amountKind: "dollars",
    amount: 10,
    fromWeek: 1,
    toWeek: regularSeasonWeeks,
    ties: "split",
    skipIfPaid: false,
  };
}

/**
 * The plan matching a league's hand-configured commissioner rules (see
 * league-config.ts), so a league that had them starts from what it already
 * pays rather than from nothing.
 */
export function planFromProfile(profile: LeagueProfile, rosterIds: number[]): PayoutPlan {
  const r = profile.payouts;
  const weeks = { fromWeek: 1, toWeek: r.regularSeasonWeeks };
  const rules: PayoutRule[] = [];
  if (r.weeklyHighScore > 0) {
    rules.push({ id: newRuleId(), award: "weekHighScore", rank: { mode: "place", n: 1 }, amountKind: "dollars", amount: r.weeklyHighScore, ...weeks, ties: "split", skipIfPaid: false });
  }
  if (r.perWin > 0) {
    rules.push({
      id: newRuleId(),
      award: "matchupWinner",
      rank: { mode: "place", n: 1 },
      amountKind: "dollars",
      amount: r.perWin,
      ...weeks,
      ties: "each",
      // "Instead of the win, never both" — the high scorer is paid by the rule above.
      skipIfPaid: !r.highScoreStacks && r.weeklyHighScore > 0,
    });
  }
  for (const p of r.finalPayouts) {
    rules.push({ id: newRuleId(), award: "finalPlace", rank: { mode: "place", n: p.place }, amountKind: "dollars", amount: p.amount, fromWeek: 1, toWeek: r.regularSeasonWeeks, ties: "split", skipIfPaid: false });
  }
  return { version: 1, buyIns: Object.fromEntries(rosterIds.map((id) => [id, r.buyIn])), rules };
}

// ---- Words ---------------------------------------------------------------

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

/** Who a rule pays, in words: "the week's highest scorer", "each of the top 3 finishers". */
export function describeRecipients(rule: PayoutRule): string {
  const { mode, n } = rule.rank;
  const one = mode === "place" && n === 1;
  const nth = ordinal(n);
  switch (rule.award) {
    case "weekHighScore":
      return mode === "top" ? `each of the week's top ${n} scorers` : one ? "the week's highest scorer" : `the week's ${nth}-highest scorer`;
    case "weekLowScore":
      return mode === "top" ? `each of the week's ${n} lowest scorers` : one ? "the week's lowest scorer" : `the week's ${nth}-lowest scorer`;
    case "matchupWinner":
      return "every matchup winner";
    case "matchupLoser":
      return "every matchup loser";
    case "biggestWin":
      return mode === "top" ? `each of the week's ${n} biggest blowouts` : one ? "the week's biggest blowout" : `the week's ${nth}-biggest blowout`;
    case "closestWin":
      return mode === "top" ? `each of the week's ${n} narrowest wins` : one ? "the week's narrowest win" : `the week's ${nth}-narrowest win`;
    case "highScoreInLoss":
      return mode === "top" ? `each of the ${n} highest scores in a loss` : one ? "the highest score in a loss" : `the ${nth}-highest score in a loss`;
    case "lowScoreInWin":
      return mode === "top" ? `each of the ${n} lowest scores in a win` : one ? "the lowest score in a win" : `the ${nth}-lowest score in a win`;
    case "finalPlace":
      if (mode === "top") return `each of the top ${n} finishers`;
      if (mode === "bottom") return n === 1 ? "the last-place finisher" : `each of the bottom ${n} finishers`;
      return n === 1 ? "the champion" : n === 2 ? "the runner-up" : `the ${nth}-place finisher`;
    case "regularSeasonPlace":
      if (mode === "top") return `each of the top ${n} in the regular-season standings`;
      if (mode === "bottom") return n === 1 ? "the worst regular-season record" : `each of the bottom ${n} in the regular-season standings`;
      return n === 1 ? "the best regular-season record" : `the ${nth} seed after the regular season`;
    case "seasonPoints":
      if (mode === "top") return `each of the top ${n} in points scored`;
      if (mode === "bottom") return n === 1 ? "whoever scored the fewest points" : `each of the bottom ${n} in points scored`;
      return n === 1 ? "whoever scored the most points" : `the ${nth}-most points scored`;
    case "seasonPointsAgainst":
      if (mode === "top") return `each of the top ${n} in points against`;
      if (mode === "bottom") return n === 1 ? "whoever had the fewest points scored against them" : `each of the bottom ${n} in points against`;
      return n === 1 ? "whoever had the most points scored against them" : `the ${nth}-most points against`;
    case "mostHighScores":
      return mode === "top" ? `each of the top ${n} in weekly high scores` : one ? "whoever had the most weekly high scores" : `the ${nth}-most weekly high scores`;
  }
}

/** When a rule pays, in words. */
export function describeTiming(rule: PayoutRule, regularSeasonWeeks: number): string {
  const info = awardInfo(rule.award);
  if (info.timing === "season") {
    return rule.award === "finalPlace" ? "once the playoffs are over" : "once the regular season is over";
  }
  if (rule.fromWeek === rule.toWeek) return `in week ${rule.fromWeek} only`;
  if (rule.fromWeek === 1 && rule.toWeek === regularSeasonWeeks) return `every regular-season week (1–${regularSeasonWeeks})`;
  return `every week from week ${rule.fromWeek} to ${rule.toWeek}`;
}

// ---- The season's results -----------------------------------------------

export interface SeasonResults {
  rosterIds: number[];
  names: Map<number, string>;
  matchupsByWeek: Map<number, SleeperMatchup[]>;
  /** The last regular-season week (the week before the playoffs start). */
  regularSeasonWeeks: number;
  /** The season's final week (the championship). */
  lastWeek: number;
  /** Roster ids in final finishing order, once the season is decided; null until then. */
  finalOrder: number[] | null;
}

interface Game {
  rosterId: number;
  points: number;
  oppPoints: number;
}

/** A week's games (both teams scored), or null if it hasn't been played. */
function gamesOf(matchups: SleeperMatchup[] | undefined): Game[] | null {
  if (!matchups || !matchups.some((m) => m.points > 0)) return null;
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    if (m.matchup_id == null) continue;
    byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m]);
  }
  const games: Game[] = [];
  for (const pair of byId.values()) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    games.push({ rosterId: a.roster_id, points: a.points, oppPoints: b.points });
    games.push({ rosterId: b.roster_id, points: b.points, oppPoints: a.points });
  }
  return games.length ? games : null;
}

interface Ranked {
  rosterId: number;
  /** Sort key; entries with equal keys are tied. */
  key: number;
}

/** The paid positions (1-based) a rank spec covers among `count` ranked teams. */
function positions(rank: RankSpec, count: number): number[] {
  const n = Math.max(1, Math.floor(rank.n));
  if (rank.mode === "place") return n <= count ? [n] : [];
  if (rank.mode === "top") return Array.from({ length: Math.min(n, count) }, (_, i) => i + 1);
  return Array.from({ length: Math.min(n, count) }, (_, i) => count - i);
}

/** How many payouts a rule makes each time it pays, for budgeting. */
function slotsPer(rule: PayoutRule, teamCount: number): number {
  const info = awardInfo(rule.award);
  if (!info.ranked) return Math.floor(teamCount / 2);
  if (rule.rank.mode === "place") return 1;
  return Math.max(1, Math.floor(rule.rank.n));
}

/**
 * Splits money among ranked teams. `ordered` is best-first; teams with equal
 * keys tie and share the positions they span. Each covered position is worth
 * `perSlot`; with ties "split", a tied group shares the money for the
 * positions it covers; with "each", every team in a group that touches a
 * paid position gets the full `perSlot`.
 */
function payRanked(ordered: Ranked[], rule: PayoutRule, perSlot: number): Map<number, number> {
  const paid = new Map<number, number>();
  const wanted = new Set(positions(rule.rank, ordered.length));
  let i = 0;
  while (i < ordered.length) {
    let j = i;
    while (j + 1 < ordered.length && ordered[j + 1].key === ordered[i].key) j++;
    const groupPositions = Array.from({ length: j - i + 1 }, (_, k) => i + k + 1);
    const covered = groupPositions.filter((p) => wanted.has(p)).length;
    if (covered > 0) {
      const group = ordered.slice(i, j + 1);
      const each = rule.ties === "each" ? perSlot : (perSlot * covered) / group.length;
      for (const g of group) paid.set(g.rosterId, (paid.get(g.rosterId) ?? 0) + each);
    }
    i = j + 1;
  }
  return paid;
}

function weeklyCandidates(rule: PayoutRule, games: Game[]): Ranked[] | null {
  const winners = games.filter((g) => g.points > g.oppPoints);
  const losers = games.filter((g) => g.points < g.oppPoints);
  switch (rule.award) {
    case "weekHighScore":
      return games.map((g) => ({ rosterId: g.rosterId, key: -g.points }));
    case "weekLowScore":
      return games.map((g) => ({ rosterId: g.rosterId, key: g.points }));
    case "biggestWin":
      return winners.map((g) => ({ rosterId: g.rosterId, key: -(g.points - g.oppPoints) }));
    case "closestWin":
      return winners.map((g) => ({ rosterId: g.rosterId, key: g.points - g.oppPoints }));
    case "highScoreInLoss":
      return losers.map((g) => ({ rosterId: g.rosterId, key: -g.points }));
    case "lowScoreInWin":
      return winners.map((g) => ({ rosterId: g.rosterId, key: g.points }));
    default:
      return null;
  }
}

// ---- The ledger ------------------------------------------------------------

export interface RulePayment {
  ruleId: string;
  amount: number;
}

export interface PlanManager {
  rosterId: number;
  name: string;
  buyIn: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  highScoreWeeks: number[];
  /** week → total paid that week. */
  weekly: Record<number, number>;
  /** week → what each rule paid that week. */
  weeklyDetail: Record<number, RulePayment[]>;
  weeklyTotal: number;
  /** Paid by end-of-season awards (once they're decided). */
  seasonEnd: number;
  seasonDetail: RulePayment[];
  total: number;
  /** total − buyIn. */
  net: number;
}

export interface RuleBudget {
  ruleId: string;
  /** What one payout under the rule is worth. */
  perPayout: number;
  /** About what the rule pays over a whole season. */
  projected: number;
  /** What it has actually paid so far. */
  paid: number;
}

export interface PlanLedger {
  managers: PlanManager[];
  /** Columns for the week grid: every week some weekly rule (or the regular season) covers. */
  weeks: number[];
  weeksPlayed: number[];
  pot: number;
  paidToDate: number;
  /** About what all the rules pay over a whole season. */
  committed: number;
  /** pot − committed: what nothing pays out (negative when the rules overspend). */
  unallocated: number;
  budgets: RuleBudget[];
  regularSeasonOver: boolean;
  seasonOver: boolean;
}

/** The weeks a weekly rule covers, clipped to the season. */
function ruleWeeks(rule: PayoutRule, lastWeek: number): number[] {
  const from = Math.max(1, Math.floor(rule.fromWeek));
  const to = Math.min(lastWeek, Math.floor(rule.toWeek));
  return to >= from ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [];
}

/**
 * Roughly how many payouts a rule makes over a season. A matchup-winner (or
 * loser) rule with no double-dipping pays one fewer team for every earlier
 * weekly award that, in practice, nearly always lands on a winner (or loser) —
 * so a "$10 a win, $20 to the high scorer instead" setup budgets correctly.
 */
function projectedPayouts(rule: PayoutRule, index: number, rules: PayoutRule[], teamCount: number, lastWeek: number): number {
  const info = awardInfo(rule.award);
  if (info.timing === "season") return slotsPer(rule, teamCount);
  let slots = slotsPer(rule, teamCount);
  if (!info.ranked && rule.skipIfPaid) {
    const winnerish: AwardKind[] = ["weekHighScore", "biggestWin", "lowScoreInWin", "closestWin"];
    const loserish: AwardKind[] = ["weekLowScore", "highScoreInLoss"];
    const overlapping = rule.award === "matchupWinner" ? winnerish : loserish;
    for (const earlier of rules.slice(0, index)) {
      if (awardInfo(earlier.award).timing === "weekly" && overlapping.includes(earlier.award)) slots -= slotsPer(earlier, teamCount);
    }
    slots = Math.max(0, slots);
  }
  return slots * ruleWeeks(rule, lastWeek).length;
}

export function computePlanLedger(plan: PayoutPlan, season: SeasonResults): PlanLedger {
  const teamCount = season.rosterIds.length;
  const pot = season.rosterIds.reduce((sum, id) => sum + (plan.buyIns[id] ?? 0), 0);

  // Weekly results, and the record/points that season awards are judged on.
  const gamesByWeek = new Map<number, Game[]>();
  for (let w = 1; w <= season.lastWeek; w++) {
    const g = gamesOf(season.matchupsByWeek.get(w));
    if (g) gamesByWeek.set(w, g);
  }
  const weeksPlayed = [...gamesByWeek.keys()].sort((a, b) => a - b);
  const regularSeasonOver = weeksPlayed.some((w) => w >= season.regularSeasonWeeks);
  const seasonOver = season.finalOrder !== null;

  const managers = new Map<number, PlanManager>(
    season.rosterIds.map((id) => [
      id,
      {
        rosterId: id,
        name: season.names.get(id) ?? `Roster ${id}`,
        buyIn: plan.buyIns[id] ?? 0,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        highScoreWeeks: [],
        weekly: {},
        weeklyDetail: {},
        weeklyTotal: 0,
        seasonEnd: 0,
        seasonDetail: [],
        total: 0,
        net: 0,
      },
    ])
  );
  for (const [week, games] of gamesByWeek) {
    if (week > season.regularSeasonWeeks) continue;
    const top = Math.max(...games.map((g) => g.points));
    for (const g of games) {
      const m = managers.get(g.rosterId);
      if (!m) continue;
      m.pointsFor += g.points;
      m.pointsAgainst += g.oppPoints;
      if (g.points > g.oppPoints) m.wins++;
      else if (g.points < g.oppPoints) m.losses++;
      else m.ties++;
      if (g.points === top) m.highScoreWeeks.push(week);
    }
  }

  // What each payout under each rule is worth. "The rest of the pot" is
  // shared out from whatever the other rules are expected to leave over.
  const projected = plan.rules.map((r, i) => projectedPayouts(r, i, plan.rules, teamCount, season.lastWeek));
  const fixedPer = (r: PayoutRule) => (r.amountKind === "percent" ? (pot * r.amount) / 100 : r.amountKind === "dollars" ? r.amount : 0);
  const fixedCommitted = plan.rules.reduce((sum, r, i) => sum + (r.amountKind === "remainder" ? 0 : fixedPer(r) * projected[i]), 0);
  const remainderRules = plan.rules.filter((r) => r.amountKind === "remainder");
  const perPayoutFor = (leftover: number) =>
    plan.rules.map((r, i) => {
      if (r.amountKind !== "remainder") return fixedPer(r);
      const share = Math.max(0, leftover) / Math.max(1, remainderRules.length);
      return projected[i] > 0 ? share / projected[i] : 0;
    });

  const run = (perPayout: number[]) => {
    const weekly = new Map<number, Map<number, RulePayment[]>>(); // week → roster → payments
    const seasonEnd = new Map<number, RulePayment[]>();
    const paidByRule = plan.rules.map(() => 0);

    for (const [week, games] of gamesByWeek) {
      const paidThisWeek = new Set<number>();
      const forWeek = new Map<number, RulePayment[]>();
      plan.rules.forEach((rule, i) => {
        const info = awardInfo(rule.award);
        if (info.timing !== "weekly" || week < rule.fromWeek || week > rule.toWeek) return;
        const eligible = rule.skipIfPaid ? games.filter((g) => !paidThisWeek.has(g.rosterId)) : games;
        let pay: Map<number, number>;
        if (!info.ranked) {
          const want = rule.award === "matchupWinner" ? (g: Game) => g.points > g.oppPoints : (g: Game) => g.points < g.oppPoints;
          pay = new Map(eligible.filter(want).map((g) => [g.rosterId, perPayout[i]]));
        } else {
          const ranked = (weeklyCandidates(rule, eligible) ?? []).sort((a, b) => a.key - b.key);
          pay = payRanked(ranked, rule, perPayout[i]);
        }
        for (const [rosterId, amount] of pay) {
          if (amount <= 0) continue;
          paidThisWeek.add(rosterId);
          paidByRule[i] += amount;
          forWeek.set(rosterId, [...(forWeek.get(rosterId) ?? []), { ruleId: rule.id, amount }]);
        }
      });
      weekly.set(week, forWeek);
    }

    // Season awards, once they're decided.
    const paidAtEnd = new Set<number>();
    const list = [...managers.values()];
    plan.rules.forEach((rule, i) => {
      const info = awardInfo(rule.award);
      if (info.timing !== "season") return;
      let ordered: Ranked[] | null = null;
      if (rule.award === "finalPlace") {
        if (season.finalOrder) ordered = season.finalOrder.map((id, k) => ({ rosterId: id, key: k }));
      } else if (regularSeasonOver) {
        const keyOf: Record<string, (m: PlanManager) => number> = {
          regularSeasonPlace: (m) => -((m.wins + m.ties / 2) * 1e6 + m.pointsFor),
          seasonPoints: (m) => -m.pointsFor,
          seasonPointsAgainst: (m) => -m.pointsAgainst,
          mostHighScores: (m) => -m.highScoreWeeks.length,
        };
        ordered = list.map((m) => ({ rosterId: m.rosterId, key: Math.round(keyOf[rule.award](m) * 100) / 100 }));
      }
      if (!ordered) return;
      if (rule.skipIfPaid) ordered = ordered.filter((o) => !paidAtEnd.has(o.rosterId));
      ordered.sort((a, b) => a.key - b.key);
      for (const [rosterId, amount] of payRanked(ordered, rule, perPayout[i])) {
        if (amount <= 0) continue;
        paidAtEnd.add(rosterId);
        paidByRule[i] += amount;
        seasonEnd.set(rosterId, [...(seasonEnd.get(rosterId) ?? []), { ruleId: rule.id, amount }]);
      }
    });
    return { weekly, seasonEnd, paidByRule };
  };

  let perPayout = perPayoutFor(pot - fixedCommitted);
  let result = run(perPayout);
  // Once the season is settled, "the rest of the pot" is exactly what's left
  // after everything else actually paid, not an estimate.
  if (seasonOver && remainderRules.length) {
    const fixedPaid = plan.rules.reduce((sum, r, i) => sum + (r.amountKind === "remainder" ? 0 : result.paidByRule[i]), 0);
    perPayout = perPayoutFor(pot - fixedPaid);
    result = run(perPayout);
  }

  for (const [week, byRoster] of result.weekly) {
    for (const [rosterId, payments] of byRoster) {
      const m = managers.get(rosterId);
      if (!m) continue;
      const amount = payments.reduce((s, p) => s + p.amount, 0);
      m.weekly[week] = amount;
      m.weeklyDetail[week] = payments;
      m.weeklyTotal += amount;
    }
  }
  for (const [rosterId, payments] of result.seasonEnd) {
    const m = managers.get(rosterId);
    if (!m) continue;
    m.seasonDetail = payments;
    m.seasonEnd = payments.reduce((s, p) => s + p.amount, 0);
  }
  for (const m of managers.values()) {
    m.total = m.weeklyTotal + m.seasonEnd;
    m.net = m.total - m.buyIn;
  }

  const budgets: RuleBudget[] = plan.rules.map((r, i) => ({
    ruleId: r.id,
    perPayout: perPayout[i],
    projected: perPayout[i] * projected[i],
    paid: result.paidByRule[i],
  }));
  const committed = budgets.reduce((s, b) => s + b.projected, 0);

  const lastRuleWeek = Math.max(
    season.regularSeasonWeeks,
    ...plan.rules.filter((r) => awardInfo(r.award).timing === "weekly").map((r) => Math.min(season.lastWeek, r.toWeek))
  );
  const sorted = [...managers.values()].sort((a, b) => b.total - a.total || b.pointsFor - a.pointsFor);

  return {
    managers: sorted,
    weeks: Array.from({ length: lastRuleWeek }, (_, i) => i + 1),
    weeksPlayed,
    pot,
    paidToDate: sorted.reduce((s, m) => s + m.total, 0),
    committed,
    unallocated: pot - committed,
    budgets,
    regularSeasonOver,
    seasonOver,
  };
}
