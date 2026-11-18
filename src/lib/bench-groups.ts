// Your bench sorted into what's worth knowing about it (see the League page's bench, RoomBench): who could outscore
// a starter, who's projected most, who has the best matchups, who's hottest, who's on bye — then everyone.

/** A bench player as the groups weigh him: his position, projection, matchup (the share of points his opponent's
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

export interface BenchGroup {
  key: "outscore" | "projected" | "matchup" | "hot" | "bye" | "all";
  label: string;
  /** Who's in it, best first, each with what puts him there (shown beside his name). */
  players: { id: string; note: string | null }[];
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

/**
 * Your bench in groups, each only if anyone's in it:
 * - who's projected above a starter in a slot he could fill (by how much, over the lowest such starter);
 * - the `top` most projected;
 * - the `top` with the easiest matchups (not on bye);
 * - the `top` hottest, by points a game;
 * - who's on bye;
 * - and everyone, as the bench has them.
 */
export function benchGroups(bench: BenchCandidate[], starters: StarterInSlot[], top = 3): BenchGroup[] {
  const groups: BenchGroup[] = [];
  const add = (key: BenchGroup["key"], label: string, players: BenchGroup["players"]) => {
    if (players.length > 0) groups.push({ key, label, players });
  };

  const outscore = bench.flatMap((p) => {
    if (p.projected === null || p.bye) return [];
    const beaten = starters
      .filter((s) => s.projected !== null && canFill(s.slot, p.position) && s.projected < p.projected!)
      .sort((a, b) => a.projected! - b.projected!)[0];
    return beaten ? [{ id: p.id, margin: p.projected - beaten.projected!, note: `+${points(p.projected - beaten.projected!)} over ${short(beaten.name)}` }] : [];
  });
  add(
    "outscore",
    "Could outscore a starter",
    outscore.sort((a, b) => b.margin - a.margin).map(({ id, note }) => ({ id, note }))
  );

  const best = (key: (p: BenchCandidate) => number | null, note: (p: BenchCandidate) => string, keep: (p: BenchCandidate) => boolean = () => true) =>
    bench
      .filter((p) => key(p) !== null && keep(p))
      .sort((a, b) => key(b)! - key(a)!)
      .slice(0, top)
      .map((p) => ({ id: p.id, note: note(p) }));
  add("projected", "Most projected", best((p) => (p.projected && p.projected > 0 ? p.projected : null), (p) => `${points(p.projected!)} proj`));
  add("matchup", "Best matchups", best((p) => p.matchup, (p) => (p.opponent ? `vs ${p.opponent}` : ""), (p) => !p.bye));
  add("hot", "Hottest", best((p) => p.ppg, (p) => `${points(p.ppg!)} a game`));
  add("bye", "On bye", bench.filter((p) => p.bye).map((p) => ({ id: p.id, note: null })));
  add("all", "Everyone", bench.map((p) => ({ id: p.id, note: null })));
  return groups;
}
