// The trade monitor's reading of a league: who's in the playoff picture (and so buying or selling), where each
// roster is strong or thin, which of your players to think about moving before their value goes, and the young
// stars and breakouts on other rosters to go after. Pure — the loading is useTradeMonitor.ts.

/** A rostered player as the monitor weighs them. */
export interface MonitorPlayer {
  id: string;
  name: string;
  position: string;
  /** NFL team. */
  team: string | null;
  /** Years, decimals and all (KTC's) — null when unknown. */
  age: number | null;
  /** KTC value now, as the league plays (dynasty or redraft, 1QB or superflex) — null if KTC doesn't list them. */
  value: number | null;
  /** Rank at their position by that value, 1 the best. */
  valueRank: number | null;
  /** How their value has moved over the last few months, as a share (-0.2 is down a fifth) — null without a history. */
  trend: number | null;
  /** Rank at their position by this season's points under the league's scoring, and their points a game. */
  seasonRank: number | null;
  ppg: number | null;
}

/** A team as the monitor reads it. */
export interface MonitorTeam {
  rosterId: number;
  name: string;
  mine: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  /** Standings place, 1 first. */
  rank: number;
  players: string[];
}

export const MONITOR_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type MonitorPosition = (typeof MONITOR_POSITIONS)[number];

// ---------- The playoff picture ----------

/** Where a team stands against the playoff line, and so which way it's likely to trade. */
export interface PlayoffStanding {
  rosterId: number;
  status: "clinched" | "in" | "bubble" | "out" | "eliminated";
  /** Games ahead of the first team out (in) or behind the last team in (out); half a game a tie. */
  games: number;
  /** In the hunt, buying for now; out of it, selling for later; on the bubble, either. */
  mode: "buying" | "selling" | "either";
}

const winsOf = (t: MonitorTeam) => t.wins + t.ties / 2;

/**
 * Every team against the playoff line: the top `playoffTeams` in, the rest out — within a game of the line either
 * way, on the bubble — and, with `gamesLeft` known, those that can't be caught clinched and those that can't catch
 * up eliminated.
 */
export function playoffPicture(teams: MonitorTeam[], playoffTeams: number, gamesLeft: number): PlayoffStanding[] {
  const sorted = [...teams].sort((a, b) => a.rank - b.rank);
  const lastIn = sorted[playoffTeams - 1];
  const firstOut = sorted[playoffTeams];
  return sorted.map((t, i) => {
    const inside = i < playoffTeams;
    const games = inside ? (firstOut ? winsOf(t) - winsOf(firstOut) : gamesLeft + 1) : lastIn ? winsOf(lastIn) - winsOf(t) : 0;
    let status: PlayoffStanding["status"] = inside ? (games <= 1 ? "bubble" : "in") : games <= 1 ? "bubble" : "out";
    if (inside && games > gamesLeft) status = "clinched";
    if (!inside && games > gamesLeft) status = "eliminated";
    const mode = status === "clinched" || status === "in" ? "buying" : status === "out" || status === "eliminated" ? "selling" : "either";
    return { rosterId: t.rosterId, status, games, mode };
  });
}

// ---------- Where each roster is strong or thin ----------

/** How many at each position a team plays: its own slots, plus a share of the flex spots it could fill. */
export function startersByPosition(rosterPositions: string[] | undefined): Record<MonitorPosition, number> {
  const slots = rosterPositions ?? [];
  const count = (slot: string) => slots.filter((s) => s === slot).length;
  const flex = count("FLEX");
  const superflex = count("SUPER_FLEX");
  const wrte = count("WRRB_FLEX") + count("REC_FLEX");
  return {
    QB: count("QB") + superflex,
    RB: count("RB") + flex / 2,
    WR: count("WR") + flex / 2 + wrte,
    TE: count("TE"),
  };
}

/** One team at one position: its starters' value added up, its place among the league's (1 the best), and against the middle. */
export interface PositionStrength {
  value: number;
  rank: number;
  /** Its value over the league's median at the position, as a share (-0.3 is 30% under). */
  vsMedian: number;
}

export interface TeamNeeds {
  rosterId: number;
  positions: Record<MonitorPosition, PositionStrength>;
  /** Where it's among the league's weakest third, and its strongest third. */
  needs: MonitorPosition[];
  surplus: MonitorPosition[];
}

/**
 * Each team's strength at each position: the value of the players it would start there (and one more for depth —
 * half a player for a half-share of a flex), ranked against every other team's. A team's needs are where it sits in
 * the bottom third; its surplus, the top third.
 */
export function positionalNeeds(teams: MonitorTeam[], players: Map<string, MonitorPlayer>, starters: Record<MonitorPosition, number>): TeamNeeds[] {
  const strength = (team: MonitorTeam, position: MonitorPosition) => {
    const values = team.players
      .map((id) => players.get(id))
      .filter((p): p is MonitorPlayer => !!p && p.position === position)
      .map((p) => p.value ?? 0)
      .sort((a, b) => b - a);
    // The starters and one more for depth, a fraction counting that much of the next.
    let left = starters[position] + 1;
    let sum = 0;
    for (const v of values) {
      if (left <= 0) break;
      sum += v * Math.min(1, left);
      left -= 1;
    }
    return sum;
  };
  const table = teams.map((t) => ({ rosterId: t.rosterId, values: Object.fromEntries(MONITOR_POSITIONS.map((p) => [p, strength(t, p)])) as Record<MonitorPosition, number> }));
  const third = teams.length / 3;
  return table.map((row) => {
    const positions = Object.fromEntries(
      MONITOR_POSITIONS.map((p) => {
        const all = table.map((r) => r.values[p]).sort((a, b) => b - a);
        const median = all.length % 2 ? all[(all.length - 1) / 2] : (all[all.length / 2 - 1] + all[all.length / 2]) / 2;
        return [p, { value: row.values[p], rank: all.indexOf(row.values[p]) + 1, vsMedian: median > 0 ? row.values[p] / median - 1 : 0 }];
      })
    ) as Record<MonitorPosition, PositionStrength>;
    return {
      rosterId: row.rosterId,
      positions,
      needs: MONITOR_POSITIONS.filter((p) => positions[p].rank > teams.length - third),
      surplus: MONITOR_POSITIONS.filter((p) => positions[p].rank <= third),
    };
  });
}

/** A team worth trading with: what it has that you need, and what it needs that you have. */
export interface TradePartner {
  rosterId: number;
  gives: MonitorPosition[];
  takes: MonitorPosition[];
}

/** The teams whose strengths cover your needs and whose needs your strengths cover — the best fits first. */
export function tradePartners(mine: TeamNeeds, others: TeamNeeds[]): TradePartner[] {
  return others
    .map((o) => ({ rosterId: o.rosterId, gives: mine.needs.filter((p) => o.surplus.includes(p)), takes: mine.surplus.filter((p) => o.needs.includes(p)) }))
    .filter((p) => p.gives.length > 0 && p.takes.length > 0)
    .sort((a, b) => b.gives.length + b.takes.length - (a.gives.length + a.takes.length));
}

// ---------- Players to think about moving ----------

/** The age each position's value usually starts to fall from. */
export const AGE_CLIFF: Record<string, number> = { QB: 33, RB: 26, WR: 29, TE: 30 };
// A value drop, over the trend's months, worth flagging; and how far a player's production can trail his value.
const FALLING = -0.1;
const PRODUCTION_GAP = 12;
// The least a player's worth for selling him — or chasing his breakout — to matter.
const WORTH_TRADING = 1500;

/** Why a player's on a list, in a few words, and how much it counts. */
export interface Reason {
  text: string;
  weight: number;
}

export interface Candidate {
  player: MonitorPlayer;
  reasons: Reason[];
  score: number;
}

/**
 * Your players worth thinking about moving in a dynasty league, before their value goes: those past (or a year off)
 * their position's age cliff, those whose value has been falling, and those producing well under what they're
 * valued at — a role shrinking. Only players worth enough for it to matter, the strongest cases first.
 */
export function sellCandidates(roster: MonitorPlayer[]): Candidate[] {
  return roster
    .filter((p) => (p.value ?? 0) >= WORTH_TRADING && p.position in AGE_CLIFF)
    .map((p) => {
      const reasons: Reason[] = [];
      const cliff = AGE_CLIFF[p.position];
      if (p.age != null && p.age >= cliff) reasons.push({ text: `Age ${Math.floor(p.age)}: ${p.position}s fall off from ${cliff}`, weight: 2 + (p.age - cliff) * 0.5 });
      else if (p.age != null && p.age >= cliff - 1) reasons.push({ text: `Age ${Math.floor(p.age)}: a year from the ${p.position} age cliff`, weight: 1 });
      if (p.trend != null && p.trend <= FALLING) reasons.push({ text: `Value down ${Math.round(-p.trend * 100)}% in 3 months`, weight: 1 + -p.trend * 4 });
      if (p.seasonRank != null && p.valueRank != null && p.seasonRank - p.valueRank >= PRODUCTION_GAP)
        reasons.push({ text: `Scoring like ${p.position}${p.seasonRank}, valued as ${p.position}${p.valueRank}`, weight: 1 + (p.seasonRank - p.valueRank) / 24 });
      return { player: p, reasons, score: reasons.reduce((s, r) => s + r.weight, 0) };
    })
    .filter((c) => c.reasons.length > 0)
    .sort((a, b) => b.score - a.score || (b.player.value ?? 0) - (a.player.value ?? 0));
}

// ---------- Players to go after ----------

/** The oldest a player can be and still count as young, by position. */
export const YOUNG: Record<string, number> = { QB: 26, RB: 24, WR: 25, TE: 25 };
// The value rank that makes a young player a star, by position; and the rise or overproduction that flags a breakout.
const STAR_RANK: Record<string, number> = { QB: 12, RB: 15, WR: 20, TE: 8 };
const RISING = 0.1;

export interface Target extends Candidate {
  /** The roster he's on. */
  rosterId: number;
}

/**
 * Players on other rosters to go after: young stars — young for their position and already among its best by
 * value — and breakout candidates — young, not yet there but worth something already, and rising in value or
 * outscoring what they're valued at.
 * Each list best first; `needs` (your weakest positions) moves those who'd fill them up.
 */
export function tradeTargets(
  others: { rosterId: number; players: MonitorPlayer[] }[],
  needs: MonitorPosition[]
): { stars: Target[]; breakouts: Target[] } {
  const stars: Target[] = [];
  const breakouts: Target[] = [];
  for (const { rosterId, players } of others) {
    for (const p of players) {
      if (!(p.position in YOUNG) || p.age == null || p.age > YOUNG[p.position] || p.valueRank == null) continue;
      const fits = (needs as string[]).includes(p.position);
      const fit = fits ? [{ text: `Fills your ${p.position} need`, weight: 1 }] : [];
      if (p.valueRank <= STAR_RANK[p.position]) {
        const reasons = [{ text: `${p.position}${p.valueRank} by value at ${Math.floor(p.age)}`, weight: 2 }, ...fit];
        stars.push({ player: p, rosterId, reasons, score: (p.value ?? 0) / 1000 + (fits ? 2 : 0) });
        continue;
      }
      if ((p.value ?? 0) < WORTH_TRADING) continue;
      const reasons: Reason[] = [];
      if (p.trend != null && p.trend >= RISING) reasons.push({ text: `Value up ${Math.round(p.trend * 100)}% in 3 months`, weight: 1 + p.trend * 4 });
      if (p.seasonRank != null && p.valueRank - p.seasonRank >= PRODUCTION_GAP)
        reasons.push({ text: `Scoring like ${p.position}${p.seasonRank}, valued as ${p.position}${p.valueRank}`, weight: 1 + (p.valueRank - p.seasonRank) / 24 });
      if (reasons.length === 0) continue;
      reasons.push(...fit);
      breakouts.push({ player: p, rosterId, reasons, score: reasons.reduce((s, r) => s + r.weight, 0) });
    }
  }
  stars.sort((a, b) => b.score - a.score);
  breakouts.sort((a, b) => b.score - a.score);
  return { stars, breakouts };
}
