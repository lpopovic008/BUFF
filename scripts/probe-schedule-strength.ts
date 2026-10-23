/**
 * Diagnostic, read-only: points each defense has allowed each position, against how good the players it faced were
 * by KTC (redraft, superflex) — each game, the opposing QB, top 2 RBs, top 3 WRs and top TE by KTC value among
 * those who played; points expected from that across the league (a straight line, per position); and each
 * defense's points allowed a game above or below expected.
 *
 *   npx tsx scripts/probe-schedule-strength.ts
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeName } from "../src/lib/name-match";
import type { PlayerStatsSnapshot } from "../src/lib/player-stats";
import type { PlayerValuesSnapshot } from "../src/lib/player-values";

const TOP: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1 };

interface Entry {
  player_id: string;
  team?: string | null;
  opponent?: string | null;
  stats?: Record<string, number> | null;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function main() {
  const stats = JSON.parse(await fs.readFile(path.join("src", "data", "player-stats.json"), "utf8")) as PlayerStatsSnapshot;
  const values = JSON.parse(await fs.readFile(path.join("src", "data", "player-values.json"), "utf8")) as PlayerValuesSnapshot;
  const season = stats.season;
  const weeks = stats.throughWeek ?? 0;
  const players = await json<Record<string, { full_name?: string; position?: string }>>("https://api.sleeper.app/v1/players/nfl");
  const ktc = new Map(values.fantasy.map((p) => [`${p.position}-${normalizeName(p.name)}`, p.values.superflexStandard]));
  const valueOf = (id: string) => {
    const p = players[id];
    return p?.full_name && p.position ? (ktc.get(`${p.position}-${normalizeName(p.full_name)}`) ?? 0) : 0;
  };
  const nameOf = (id: string) => players[id]?.full_name ?? id;

  // Each defense's games against each position: points allowed, and the players faced.
  type Game = { week: number; points: number; faced: { id: string; value: number }[] };
  const games = new Map<string, Game[]>();
  for (let week = 1; week <= weeks; week++) {
    const url = `https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=regular&` + Object.keys(TOP).map((p) => `position[]=${p}`).join("&");
    const entries = await json<Entry[]>(url);
    const byGame = new Map<string, { points: number; played: { id: string; value: number }[] }>();
    for (const e of entries) {
      const position = players[e.player_id]?.position;
      if (!position || !TOP[position] || !e.opponent || !e.stats?.gp) continue;
      const key = `${e.opponent}|${position}`;
      const g = byGame.get(key) ?? { points: 0, played: [] };
      g.points += e.stats.pts_ppr ?? 0;
      g.played.push({ id: e.player_id, value: valueOf(e.player_id) });
      byGame.set(key, g);
    }
    for (const [key, g] of byGame) {
      const position = key.split("|")[1];
      const faced = g.played.sort((a, b) => b.value - a.value).slice(0, TOP[position]);
      games.set(key, [...(games.get(key) ?? []), { week, points: g.points, faced }]);
    }
  }

  for (const position of Object.keys(TOP)) {
    const rows = [...games].filter(([k]) => k.endsWith(`|${position}`)).map(([k, gs]) => ({ team: k.split("|")[0], gs }));
    // Expected points from the average KTC value faced, fitted across every game in the league.
    const samples = rows.flatMap((r) => r.gs.map((g) => ({ x: g.faced.reduce((t, f) => t + f.value, 0) / Math.max(1, g.faced.length), y: g.points })));
    const mx = samples.reduce((t, s) => t + s.x, 0) / samples.length;
    const my = samples.reduce((t, s) => t + s.y, 0) / samples.length;
    const b = samples.reduce((t, s) => t + (s.x - mx) * (s.y - my), 0) / samples.reduce((t, s) => t + (s.x - mx) ** 2, 0);
    const a = my - b * mx;
    const table = rows.map((r) => {
      const n = r.gs.length;
      const allowed = r.gs.reduce((t, g) => t + g.points, 0) / n;
      const faced = r.gs.reduce((t, g) => t + g.faced.reduce((u, f) => u + f.value, 0) / Math.max(1, g.faced.length), 0) / n;
      const expected = a + b * faced;
      const names = position === "QB" ? r.gs.map((g) => nameOf(g.faced[0]?.id ?? "?").split(" ").slice(-1)[0]).join(", ") : "";
      return { team: r.team, n, allowed, faced, expected, over: allowed - expected, names };
    });
    const byAllowed = [...table].sort((x, y) => x.allowed - y.allowed);
    const byOver = [...table].sort((x, y) => x.over - y.over);
    console.log(`\n=== ${position} — expected = ${a.toFixed(1)} + ${(b * 1000).toFixed(2)} per 1,000 KTC; league average faced ${mx.toFixed(0)}`);
    console.log("team | games | allowed/g (rank) | avg KTC faced | expected/g | over expected (adj rank)" + (position === "QB" ? " | QBs faced" : ""));
    for (const r of byOver)
      console.log(
        [r.team, r.n, `${r.allowed.toFixed(1)} (${byAllowed.indexOf(r) + 1})`, r.faced.toFixed(0), r.expected.toFixed(1), `${r.over >= 0 ? "+" : ""}${r.over.toFixed(1)} (${byOver.indexOf(r) + 1})`, r.names]
          .filter((c) => c !== "")
          .join(" | ")
      );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
