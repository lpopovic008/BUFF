// Temporary: prints the blended lineup rank against real Sleeper names.
import { positionBlendRankIndexFor, valuesByPlayerId } from "../../src/lib/matchup-players";
import { normalizeName } from "../../src/lib/name-match";
import { seasonPointsFor } from "../../src/lib/player-stats";
import stats from "../../src/data/player-stats.json";
import values from "../../src/data/player-values.json";

const res = await fetch("https://api.sleeper.app/v1/players/nfl");
const players: Record<string, { full_name?: string; position?: string }> = await res.json();
const idIndex = new Map<string, string>();
for (const [id, r] of Object.entries(players)) if (r.full_name && r.position) idIndex.set(`${r.position}-${normalizeName(r.full_name)}`, id);
const snap = stats as never;
const dyn = valuesByPlayerId(values as never, { listType: "dynasty", format: "superflex", tep: "standard" }, idIndex);
const redraft = positionBlendRankIndexFor(snap);
const dynasty = positionBlendRankIndexFor(snap, undefined, dyn);
console.log(`matched values: ${dyn.size}`);
for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"]) {
  const lines = (stats.players as { playerId: string; position: string; gamesPlayed: number; ptsPpr: number; ptsHalfPpr: number; ptsStd: number }[])
    .filter((l) => l.position === pos && l.gamesPlayed > 0)
    .sort((a, b) => b.ptsPpr - a.ptsPpr);
  const ptsRank = new Map(lines.map((l, i) => [l.playerId, i + 1]));
  const top = [...lines].sort((a, b) => (dynasty.get(a.playerId) ?? 999) - (dynasty.get(b.playerId) ?? 999)).slice(0, 25);
  console.log(`\n== ${pos}  (dyn | redraft | pts) name gp pts ppg value`);
  for (const l of top) {
    const pts = seasonPointsFor(l);
    console.log(
      `${String(dynasty.get(l.playerId)).padStart(3)} | ${String(redraft.get(l.playerId)).padStart(3)} | ${String(ptsRank.get(l.playerId)).padStart(3)}  ${(players[l.playerId]?.full_name ?? l.playerId).padEnd(24)} ${l.gamesPlayed} ${pts.toFixed(1).padStart(6)} ${(pts / l.gamesPlayed).toFixed(1).padStart(5)} ${dyn.get(l.playerId) ?? "-"}`
    );
  }
}
