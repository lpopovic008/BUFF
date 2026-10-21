/**
 * Read-only study: how much more a side has to give when it trades several smaller pieces for fewer bigger
 * ones. Every two-team trade in the commissioner's dynasty leagues, valued as it was made (see
 * src/lib/league-trades.ts), is taken as roughly fair to the people who made it; each candidate formula's
 * setting is the one that best balances them. Trades undone soon after (the same pieces back between the
 * same teams), trades with FAAB in them, and trades with a piece KTC has no value for are left out.
 *
 *   npx tsx scripts/fit-trade-adjustment.ts
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { COMMISH_SLEEPER_USERNAME, defaultSeason } from "../src/lib/app-defaults";
import { getUserByUsername, getUserLeagues } from "../src/lib/sleeper";
import { loadLeagueTrades } from "../src/lib/league-trades";
import { AnalyzedTrade } from "../src/lib/trades";
import { ValueHistory } from "../src/lib/value-history";

const DAY = 86_400_000;

// A piece by its name — a pick's "whose" tag changes as it changes hands, so it's left out.
const key = (a: { label: string }) => a.label;

/** Trades undone soon after: the same two teams swapping the same pieces straight back. */
function undone(trades: AnalyzedTrade[]): Set<string> {
  const out = new Set<string>();
  const sorted = [...trades].sort((a, b) => a.at - b.at);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.sides.length !== 2) continue;
    const got = (side: AnalyzedTrade["sides"][number]) => side.got.map(key).sort().join(",");
    for (let j = i + 1; j < sorted.length && sorted[j].at - t.at < 30 * DAY; j++) {
      const u = sorted[j];
      if (u.sides.length !== 2) continue;
      const tBy = new Map(t.sides.map((s) => [s.rosterId, got(s)]));
      const uBy = new Map(u.sides.map((s) => [s.rosterId, got(s)]));
      const [a, b] = t.sides.map((s) => s.rosterId);
      if (uBy.get(a) === tBy.get(b) && uBy.get(b) === tBy.get(a)) {
        out.add(t.id);
        out.add(u.id);
      }
    }
  }
  return out;
}

type Model = { name: string; param: string; values: number[]; effective: (vs: number[], x: number) => number };
const MODELS: Model[] = [
  { name: "power: Σ 9999·(v/9999)^p", param: "p", values: range(1, 4, 0.05), effective: (vs, p) => vs.reduce((t, v) => t + 9999 * (v / 9999) ** p, 0) },
  {
    name: "diminishing: pieces biggest first, the i-th weighed d^(i−1)",
    param: "d",
    values: range(0.3, 1, 0.01),
    effective: (vs, d) => [...vs].sort((a, b) => b - a).reduce((t, v, i) => t + v * d ** i, 0),
  },
  { name: "top piece: Σv + k·max(v)", param: "k", values: range(0, 8, 0.05), effective: (vs, k) => vs.reduce((t, v) => t + v, 0) + k * Math.max(...vs) },
];
// Weighed against the trade's best piece: each piece v counts v·(v/T)^q, T the best piece on either side.
const relative = (q: number) => (vs: number[], top: number) => vs.reduce((t, v) => t + v * (v / top) ** q, 0);

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let x = from; x <= to + 1e-9; x += step) out.push(Math.round(x * 1000) / 1000);
  return out;
}

async function main() {
  const history = JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", "value-history.json"), "utf8")) as ValueHistory;
  const user = await getUserByUsername(COMMISH_SLEEPER_USERNAME);
  if (!user) throw new Error("no such user");
  const pairs: { league: string; date: string; a: number[]; b: number[]; labels: string }[] = [];
  for (const league of await getUserLeagues(user.user_id, defaultSeason())) {
    if (league.settings.type !== 2) continue;
    const data = await loadLeagueTrades(league.league_id, user.user_id, history);
    if (!data) continue;
    const skip = undone(data.trades);
    let kept = 0;
    const dropped = { undone: 0, teams: 0, faab: 0, unvalued: 0 };
    for (const t of data.trades) {
      if (skip.has(t.id)) {
        dropped.undone++;
        continue;
      }
      if (t.sides.length !== 2) {
        dropped.teams++;
        continue;
      }
      if (t.sides.some((s) => s.faab > 0)) {
        dropped.faab++;
        continue;
      }
      const values = t.sides.map((s) => s.got.map((g) => g.then));
      if (values.some((vs) => vs.length === 0 || vs.some((v) => v === null || v <= 0))) {
        dropped.unvalued++;
        continue;
      }
      kept++;
      pairs.push({
        league: league.name,
        date: new Date(t.at).toISOString().slice(0, 10),
        a: values[0] as number[],
        b: values[1] as number[],
        labels: t.sides.map((s) => s.got.map((g) => g.label).join(" + ")).join("  for  "),
      });
    }
    console.log(`${league.name}: ${data.trades.length} trades — ${kept} kept; left out ${JSON.stringify(dropped)}`);
    if (skip.size) console.log(`  undone pairs: ${data.trades.filter((t) => skip.has(t.id)).map((t) => `${new Date(t.at).toISOString().slice(0, 10)} ${t.sides.map((s) => s.got.map((g) => g.label).join("+")).join(" ⇄ ")}`).join(" | ")}`);
  }
  console.log(`\n${pairs.length} trades to fit.`);
  // How unbalanced the trades read: mean squared log ratio of the two sides, and the median gap as a share.
  const score = (eff: (vs: number[]) => number) => {
    const logs = pairs.map((p) => Math.log(eff(p.a) / eff(p.b)));
    const mse = logs.reduce((t, l) => t + l * l, 0) / logs.length;
    const gaps = logs.map((l) => Math.abs(Math.exp(Math.abs(l)) - 1)).sort((x, y) => x - y);
    return { mse, median: gaps[Math.floor(gaps.length / 2)] };
  };
  const raw = score((vs) => vs.reduce((t, v) => t + v, 0));
  console.log(`plain sums: mean sq. log gap ${raw.mse.toFixed(4)}, median gap ${(raw.median * 100).toFixed(1)}%`);
  for (const m of MODELS) {
    let best = { x: m.values[0], mse: Infinity, median: 0 };
    for (const x of m.values) {
      const s = score((vs) => m.effective(vs, x));
      if (s.mse < best.mse) best = { x, ...s };
    }
    console.log(`${m.name}: best ${m.param} = ${best.x} — mean sq. log gap ${best.mse.toFixed(4)}, median gap ${(best.median * 100).toFixed(1)}%`);
  }
  {
    let best = { q: 0, mse: Infinity, median: 0 };
    for (const q of range(0, 4, 0.05)) {
      const logs = pairs.map((p) => {
        const top = Math.max(...p.a, ...p.b);
        return Math.log(relative(q)(p.a, top) / relative(q)(p.b, top));
      });
      const mse = logs.reduce((t, l) => t + l * l, 0) / logs.length;
      const gaps = logs.map((l) => Math.exp(Math.abs(l)) - 1).sort((x, y) => x - y);
      if (mse < best.mse) best = { q, mse, median: gaps[Math.floor(gaps.length / 2)] };
    }
    console.log(`relative: Σ v·(v/T)^q, T the trade's best piece: best q = ${best.q} — mean sq. log gap ${best.mse.toFixed(4)}, median gap ${(best.median * 100).toFixed(1)}%`);
  }
  // Uneven trades by piece count — where a premium would show.
  const uneven = pairs.filter((p) => p.a.length !== p.b.length);
  console.log(`\n${uneven.length} trades with more pieces on one side. Side with fewer pieces, its plain total as a share of the other's:`);
  const shares = uneven.map((p) => {
    const [few, many] = p.a.length < p.b.length ? [p.a, p.b] : [p.b, p.a];
    return few.reduce((t, v) => t + v, 0) / many.reduce((t, v) => t + v, 0);
  });
  shares.sort((x, y) => x - y);
  console.log(`  median ${(shares[Math.floor(shares.length / 2)] * 100).toFixed(0)}%, quartiles ${(shares[Math.floor(shares.length / 4)] * 100).toFixed(0)}%–${(shares[Math.floor((shares.length * 3) / 4)] * 100).toFixed(0)}%`);
  for (const p of pairs.slice(0, 40)) console.log(`  ${p.date} ${p.league.slice(0, 12)}: [${p.a.join(", ")}] vs [${p.b.join(", ")}]  ${p.labels.slice(0, 120)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
