// How a game yet to kick off lists its players in the starters list, under its two teams.

import type { GroupedStarter } from "./my-starters";

/** A player's first initial and full last name ("P. Mahomes", "A. St. Brown") — a team defense's name as it is. */
export function shortName(name: string, position: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  return position === "DEF" || rest.length === 0 ? name : `${first[0]}. ${rest.join(" ")}`;
}

// The order positions line up in across a game yet to kick off, under ALL.
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

/**
 * A game's players under ALL before kickoff, lined up by position across the two teams: each position's players
 * best projection first, row for row — the away team's WR1 straight across from the home team's WR1 — QBs first,
 * then RBs, WRs, TEs, kickers and defenses (anything else after). A row one team has no one for is left open on
 * its side.
 */
export function positionRows(players: GroupedStarter[], home: string): [GroupedStarter | null, GroupedStarter | null][] {
  const rank = (position: string) => (POSITION_ORDER.includes(position) ? POSITION_ORDER.indexOf(position) : POSITION_ORDER.length);
  const positions = [...new Set(players.map((p) => p.position))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const best = (list: GroupedStarter[]) => list.sort((a, b) => (b.projected ?? -1) - (a.projected ?? -1));
  return positions.flatMap((position) => {
    const at = players.filter((p) => p.position === position);
    const [away, homeSide] = [best(at.filter((p) => p.team !== home)), best(at.filter((p) => p.team === home))];
    return Array.from({ length: Math.max(away.length, homeSide.length) }, (_, i): [GroupedStarter | null, GroupedStarter | null] => [away[i] ?? null, homeSide[i] ?? null]);
  });
}
