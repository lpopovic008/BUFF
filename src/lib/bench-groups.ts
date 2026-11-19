// Your bench, each player once, most projected first — or looked through by what's worth knowing about it (see the
// League page's bench, RoomBench): the best matchups, who could outscore a starter, who's hottest, who's on bye.

/** A bench player as the list weighs him: his position, projection, matchup (the share of points his opponent's
 * defense gives up to his position — higher, easier), whether he's on bye, and his points a game. */
export interface BenchCandidate {
  id: string;
  name: string;
  position: string;
  projected: number | null;
  matchup: number | null;
  opponent: string | null;
  bye: boolean;
  ppg: number | null;
}

/** A starter in his slot, and his projection. */
export interface StarterInSlot {
  slot: string;
  id: string;
  name: string;
  projected: number | null;
}

/** Which positions each of Sleeper's flex slots takes (a slot not here takes just its own position). */
const FLEX: Record<string, string[]> = {
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  REC_FLEX: ["WR", "TE"],
  WRRB_FLEX: ["WR", "RB"],
  IDP_FLEX: ["DL", "LB", "DB"],
};

/** Whether a player at `position` could start in `slot`. */
export function canFill(slot: string, position: string): boolean {
  return (FLEX[slot] ?? [slot]).includes(position);
}

const points = (n: number) => n.toFixed(1);
/** "J. Allen" — a starter named short beside a bench player's. */
const short = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
};

/** What the bench can be looked through by: everyone by projection (as it opens), and narrowed or ordered otherwise. */
export type BenchFilterKey = "projected" | "matchup" | "outscore" | "hot" | "bye";
export interface BenchFilter {
  key: BenchFilterKey;
  label: string;
}
const FILTERS: BenchFilter[] = [
  { key: "projected", label: "Projected" },
  { key: "matchup", label: "Matchup" },
  { key: "outscore", label: "Can outscore" },
  { key: "hot", label: "Hottest" },
  { key: "bye", label: "On bye" },
];

/** A bench player in the list, and what puts him where he is (shown beside his name). */
export interface BenchEntry {
  id: string;
  note: string | null;
}

/**
 * Your bench, each player once, looked through by `key`:
 * - projected: everyone, most projected first (those without a projection last, as the bench has them);
 * - matchup: everyone not on bye with a matchup, the easiest first;
 * - outscore: who's projected above a starter in a slot he could fill, by how much (over the lowest such starter);
 * - hot: everyone with points a game, most first;
 * - bye: who's on bye.
 */
export function benchList(bench: BenchCandidate[], starters: StarterInSlot[], key: BenchFilterKey): BenchEntry[] {
  const by = (value: (p: BenchCandidate) => number | null, note: (p: BenchCandidate) => string | null, keep: (p: BenchCandidate) => boolean = () => true) =>
    bench
      .filter((p) => value(p) !== null && keep(p))
      .sort((a, b) => value(b)! - value(a)!)
      .map((p) => ({ id: p.id, note: note(p) }));
  if (key === "projected") {
    const projected = by((p) => p.projected, (p) => (p.bye ? "bye" : `${points(p.projected!)} proj`));
    const rest = bench.filter((p) => p.projected === null).map((p) => ({ id: p.id, note: p.bye ? "bye" : null }));
    return [...projected, ...rest];
  }
  if (key === "matchup") return by((p) => p.matchup, (p) => (p.opponent ? `vs ${p.opponent}` : null), (p) => !p.bye);
  if (key === "hot") return by((p) => p.ppg, (p) => `${points(p.ppg!)} a game`);
  if (key === "bye") return bench.filter((p) => p.bye).map((p) => ({ id: p.id, note: null }));
  return bench
    .flatMap((p) => {
      if (p.projected === null || p.bye) return [];
      const beaten = starters
        .filter((s) => s.projected !== null && canFill(s.slot, p.position) && s.projected < p.projected!)
        .sort((a, b) => a.projected! - b.projected!)[0];
      return beaten ? [{ id: p.id, margin: p.projected - beaten.projected!, note: `+${points(p.projected - beaten.projected!)} over ${short(beaten.name)}` }] : [];
    })
    .sort((a, b) => b.margin - a.margin)
    .map(({ id, note }) => ({ id, note }));
}

/** The ways the bench can be looked through that have anyone in them — by projection always. */
export function benchFilters(bench: BenchCandidate[], starters: StarterInSlot[]): BenchFilter[] {
  return FILTERS.filter((f) => f.key === "projected" || benchList(bench, starters, f.key).length > 0);
}
