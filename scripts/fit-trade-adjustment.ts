/**
 * Read-only study: how much more a side has to give when it trades several smaller pieces for fewer bigger
 * ones. Pieces are paired up across the trade — players with players, picks with picks, biggest with
 * biggest, what's left of one kind then with what's left of the other — and the pieces left over on the side
 * with more (its additional pieces) count for only part of their value, more the closer each is to the
 * trade's best piece; picks can count for more or less than KTC has them. Every two-team trade in the commissioner's dynasty leagues, valued as it was made (see
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

interface Piece {
  v: number;
  pick: boolean;
}

/** The additional pieces on each side: what's left once pieces are paired across the trade (see the top). */
export function additional(a: Piece[], b: Piece[]): [Piece[], Piece[]] {
  const desc = (ps: Piece[]) => [...ps].sort((x, y) => y.v - x.v);
  const pairOff = (x: Piece[], y: Piece[]): [Piece[], Piece[]] => {
    const n = Math.min(x.length, y.length);
    return [x.slice(n), y.slice(n)];
  };
  const [ap, bp] = pairOff(desc(a.filter((p) => !p.pick)), desc(b.filter((p) => !p.pick)));
  const [ak, bk] = pairOff(desc(a.filter((p) => p.pick)), desc(b.filter((p) => p.pick)));
  return pairOff(desc([...ap, ...ak]), desc([...bp, ...bk]));
}

/** A side's trade value: picks at m× KTC; each additional piece at a·(v/T)^q of its value (at most all of it), T the trade's best piece. */
function tradeValues(a: Piece[], b: Piece[], m: number, w: number, q: number): [number, number] {
  const scale = (ps: Piece[]) => ps.map((p) => ({ ...p, v: p.pick ? p.v * m : p.v }));
  const [sa, sb] = [scale(a), scale(b)];
  const top = Math.max(...sa.map((p) => p.v), ...sb.map((p) => p.v));
  const [xa, xb] = additional(sa, sb);
  const value = (all: Piece[], extra: Piece[]) =>
    all.reduce((t, p) => t + p.v, 0) - extra.reduce((t, p) => t + p.v * (1 - Math.min(1, w * (p.v / top) ** q)), 0);
  return [value(sa, xa), value(sb, xb)];
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let x = from; x <= to + 1e-9; x += step) out.push(Math.round(x * 1000) / 1000);
  return out;
}

interface Fitted {
  league: string;
  date: string;
  a: Piece[];
  b: Piece[];
  labels: string;
}

/** How unbalanced the trades read under a valuation: mean squared log ratio of the sides, and the median gap. */
function score(trades: Fitted[], values: (t: Fitted) => [number, number]) {
  const logs = trades.map((t) => {
    const [x, y] = values(t);
    return Math.log(x / y);
  });
  const mse = logs.reduce((t, l) => t + l * l, 0) / logs.length;
  const gaps = logs.map((l) => Math.exp(Math.abs(l)) - 1).sort((x, y) => x - y);
  return { mse, median: gaps[Math.floor(gaps.length / 2)] };
}

const plain = (t: Fitted): [number, number] => [t.a.reduce((s, p) => s + p.v, 0), t.b.reduce((s, p) => s + p.v, 0)];
const topPlus18 = (t: Fitted): [number, number] =>
  [t.a, t.b].map((ps) => {
    const vs = ps.map((p) => p.v);
    const top = Math.max(...vs);
    return top + 0.18 * (vs.reduce((s, v) => s + v, 0) - top);
  }) as [number, number];

/** The settings that best balance some trades. */
function fit(trades: Fitted[]) {
  let best = { m: 1, w: 1, q: 0, mse: Infinity, median: 0 };
  for (const m of range(0.6, 1.6, 0.05))
    for (const w of range(0, 1.5, 0.05))
      for (const q of range(0, 3, 0.25)) {
        const s = score(trades, (t) => tradeValues(t.a, t.b, m, w, q));
        if (s.mse < best.mse) best = { m, w, q, ...s };
      }
  return best;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function main() {
  const history = JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", "value-history.json"), "utf8")) as ValueHistory;
  const user = await getUserByUsername(COMMISH_SLEEPER_USERNAME);
  if (!user) throw new Error("no such user");
  const trades: Fitted[] = [];
  for (const league of await getUserLeagues(user.user_id, defaultSeason())) {
    if (league.settings.type !== 2) continue;
    const data = await loadLeagueTrades(league.league_id, user.user_id, history);
    if (!data) continue;
    const skip = undone(data.trades);
    const dropped = { undone: 0, teams: 0, faab: 0, unvalued: 0 };
    let kept = 0;
    for (const t of data.trades) {
      if (skip.has(t.id)) dropped.undone++;
      else if (t.sides.length !== 2) dropped.teams++;
      else if (t.sides.some((s) => s.faab > 0)) dropped.faab++;
      else if (t.sides.some((s) => s.got.length === 0 || s.got.some((g) => g.then === null || g.then <= 0))) dropped.unvalued++;
      else {
        kept++;
        const [a, b] = t.sides.map((s) => s.got.map((g) => ({ v: g.then!, pick: g.position === "PICK" })));
        trades.push({ league: league.name, date: new Date(t.at).toISOString().slice(0, 10), a, b, labels: t.sides.map((s) => s.got.map((g) => g.label).join(" + ")).join("  for  ") });
      }
    }
    console.log(`${league.name}: ${data.trades.length} trades — ${kept} kept; left out ${JSON.stringify(dropped)}`);
  }
  const leagues = [...new Set(trades.map((t) => t.league))];
  console.log(`\n${trades.length} trades to fit.`);
  for (const [name, f] of [["plain sums", plain], ["best piece + 18% of the rest", topPlus18]] as const) {
    const s = score(trades, f);
    console.log(`${name}: mean sq. log gap ${s.mse.toFixed(4)}, median gap ${pct(s.median)}`);
  }
  const best = fit(trades);
  console.log(`paired, additional pieces weighed: picks ×${best.m}, each additional piece at ${best.w}·(v/T)^${best.q} — mean sq. log gap ${best.mse.toFixed(4)}, median gap ${pct(best.median)}`);
  console.log(`  an additional piece's share, by its value as a share of the best piece: ${[0.2, 0.4, 0.6, 0.8, 1].map((r) => `${r * 100}% → ${pct(Math.min(1, best.w * r ** best.q))}`).join(", ")}`);
  for (const league of leagues) {
    const mine = trades.filter((t) => t.league === league);
    const others = trades.filter((t) => t.league !== league);
    const own = fit(others);
    console.log(
      `  ${league}: ${mine.length} trades — median gap plain ${pct(score(mine, plain).median)}, at the overall fit ${pct(score(mine, (t) => tradeValues(t.a, t.b, best.m, best.w, best.q)).median)}, fitted on the other league alone (picks ×${own.m}, ${own.w}·(v/T)^${own.q}) ${pct(score(mine, (t) => tradeValues(t.a, t.b, own.m, own.w, own.q)).median)}`
    );
  }
  console.log("\nSome trades — plain totals, then trade values:");
  for (const t of trades.slice(0, 24)) {
    const [pa, pb] = plain(t);
    const [ea, eb] = tradeValues(t.a, t.b, best.m, best.w, best.q);
    console.log(`  ${t.date} ${Math.round(pa)} vs ${Math.round(pb)} → ${Math.round(ea)} vs ${Math.round(eb)}   ${t.labels.slice(0, 110)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
