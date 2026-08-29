// Pure lineup-selection logic for the Draft Room's post-draft roster
// summary — kept free of React so it's unit-testable without rendering
// anything. See DraftRoom.tsx for how a team's drafted AdpEntry list and
// each player's projected season points feed into this.

/** The minimum starters required at each position — "at least one QB, at least one tight end, at least two running backs, and at least two wide receivers." */
export const REQUIRED_STARTER_MINIMUMS: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };

/** Only these positions ever start — K/DST/IDP don't count toward the minimums or the flex slots. */
const STARTER_ELIGIBLE_POSITIONS = new Set(Object.keys(REQUIRED_STARTER_MINIMUMS));

/** The Draft Settings "START" field can't go below this — the required minimums alone already add up to it. */
export const MIN_START = Object.values(REQUIRED_STARTER_MINIMUMS).reduce((sum, n) => sum + n, 0);
export const MAX_START = 16;
/** The 6 required minimums plus one flex spot — a standard skill-position starting lineup. */
export const DEFAULT_START = 7;

export interface RosterPlayer {
  key: string;
  position: string;
  projectedPoints: number;
}

export interface StartingLineup {
  starterKeys: Set<string>;
  pointsTotal: number;
}

/**
 * Picks a team's starting lineup out of its full drafted roster: the
 * required minimum at QB/RB/WR/TE first (best projected points within each
 * position), then fills any remaining slots up to `startSize` with the
 * next-best eligible players regardless of position — a flex-style bonus
 * slot, same as a real lineup's RB/WR/TE flex. Kickers/DST/IDP are never
 * starters. A team short on players at a required position just starts
 * everyone it has there instead of failing.
 */
export function pickStartingLineup(roster: RosterPlayer[], startSize: number): StartingLineup {
  const eligible = roster.filter((p) => STARTER_ELIGIBLE_POSITIONS.has(p.position));

  const byPosition = new Map<string, RosterPlayer[]>();
  for (const p of eligible) {
    const list = byPosition.get(p.position);
    if (list) list.push(p);
    else byPosition.set(p.position, [p]);
  }
  for (const list of byPosition.values()) list.sort((a, b) => b.projectedPoints - a.projectedPoints);

  const starters: RosterPlayer[] = [];
  const used = new Set<string>();
  for (const [position, minimum] of Object.entries(REQUIRED_STARTER_MINIMUMS)) {
    for (const p of (byPosition.get(position) ?? []).slice(0, minimum)) {
      starters.push(p);
      used.add(p.key);
    }
  }

  if (starters.length < startSize) {
    const remaining = eligible
      .filter((p) => !used.has(p.key))
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    for (const p of remaining) {
      if (starters.length >= startSize) break;
      starters.push(p);
      used.add(p.key);
    }
  }

  return {
    starterKeys: new Set(starters.map((p) => p.key)),
    pointsTotal: starters.reduce((sum, p) => sum + p.projectedPoints, 0),
  };
}
