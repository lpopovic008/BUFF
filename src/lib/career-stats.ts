// A player's career, season by season, from the same undocumented Sleeper stats endpoints as the weekly lines
// (see sleeper.ts's getWeeklyPlayerLines) — one player, one season's totals at a time — for the lineups' player
// card: each season's stat line, the team he ended it with, his fantasy points under the league's own scoring and
// his rank at his position.

import { weighProjection } from "./sleeper";

/** One season of a player's: the team he ended it on, and his regular season's totals in Sleeper's stat keys. */
export interface CareerSeason {
  season: string;
  team: string | null;
  stats: Record<string, number>;
}

interface SeasonEntry {
  team?: string | null;
  stats?: Record<string, number> | null;
  player?: { years_exp?: number | null; metadata?: { rookie_year?: string | null } | null } | null;
}

const STATS_BASE = "https://api.sleeper.app/stats/nfl/player";
const cache = new Map<string, Promise<CareerSeason[]>>();

async function seasonOf(playerId: string, season: number): Promise<SeasonEntry | null> {
  try {
    const res = await fetch(`${STATS_BASE}/${encodeURIComponent(playerId)}?season_type=regular&season=${season}&grouping=season`);
    if (!res.ok) return null;
    return (await res.json()) as SeasonEntry | null;
  } catch {
    return null;
  }
}

/** The most seasons back a career is looked for, when Sleeper doesn't say when it began. */
const MOST_SEASONS = 20;

/**
 * Every regular season a player's played, oldest first, through `throughSeason` — from his rookie year (Sleeper's,
 * or counted back from his years in the league). Seasons he didn't play are left out. Fetched once a tab.
 */
export function getCareer(playerId: string, throughSeason: number): Promise<CareerSeason[]> {
  const key = `${playerId}-${throughSeason}`;
  if (!cache.has(key)) {
    const promise = (async () => {
      const latest = await seasonOf(playerId, throughSeason);
      const rookie = Number(latest?.player?.metadata?.rookie_year);
      const exp = latest?.player?.years_exp;
      const first = rookie > 0 ? rookie : typeof exp === "number" ? throughSeason - exp : throughSeason - MOST_SEASONS;
      const from = Math.max(first, throughSeason - MOST_SEASONS);
      const years = Array.from({ length: Math.max(0, throughSeason - from) }, (_, i) => from + i);
      const earlier = await Promise.all(years.map((y) => seasonOf(playerId, y)));
      const all = [...years.map((y, i) => [y, earlier[i]] as const), [throughSeason, latest] as const];
      return all.flatMap(([season, e]) => (e?.stats && (e.stats.gp ?? 0) > 0 ? [{ season: String(season), team: e.team ?? null, stats: e.stats }] : []));
    })();
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key)!;
}

/** A column of the career table: its heading, and its value from a season's (or the career's) stats. */
export interface CareerColumn {
  label: string;
  /** What the heading's short for. */
  title: string;
  value: (stats: Record<string, number>) => string;
}

const n = (stats: Record<string, number>, key: string) => stats[key] ?? 0;
const whole = (key: string, label: string, title: string): CareerColumn => ({ label, title, value: (s) => String(Math.round(n(s, key))) });
const of = (made: string, tried: string, label: string, title: string): CareerColumn => ({
  label,
  title,
  value: (s) => `${Math.round(n(s, made))}/${Math.round(n(s, tried))}`,
});
const per = (top: string, bottom: string, label: string, title: string): CareerColumn => ({
  label,
  title,
  value: (s) => (n(s, bottom) > 0 ? (n(s, top) / n(s, bottom)).toFixed(1) : "–"),
});

const PASSING = [
  of("pass_cmp", "pass_att", "CMP", "Completions / attempts"),
  whole("pass_yd", "YDS", "Passing yards"),
  whole("pass_td", "TD", "Passing touchdowns"),
  whole("pass_int", "INT", "Interceptions thrown"),
];
const RUSHING = [whole("rush_att", "CAR", "Carries"), whole("rush_yd", "YDS", "Rushing yards"), per("rush_yd", "rush_att", "Y/C", "Yards a carry"), whole("rush_td", "TD", "Rushing touchdowns")];
const RECEIVING = [
  of("rec", "rec_tgt", "REC", "Catches / targets"),
  whole("rec_yd", "YDS", "Receiving yards"),
  per("rec_yd", "rec", "Y/R", "Yards a catch"),
  whole("rec_td", "TD", "Receiving touchdowns"),
];

/** The table's stat columns for a position, in groups (passing, rushing, receiving…), its main job first. */
export function careerColumns(position: string): { group: string; columns: CareerColumn[] }[] {
  if (position === "QB") return [{ group: "Passing", columns: PASSING }, { group: "Rushing", columns: RUSHING.filter((c) => c.label !== "Y/C") }];
  if (position === "RB") return [{ group: "Rushing", columns: RUSHING }, { group: "Receiving", columns: RECEIVING }];
  if (position === "K")
    return [
      {
        group: "Kicking",
        columns: [of("fgm", "fga", "FG", "Field goals made / tried"), whole("fgm_50p", "50+", "Field goals from 50 yards or more"), of("xpm", "xpa", "XP", "Extra points made / tried")],
      },
    ];
  if (position === "DEF")
    return [
      {
        group: "Defense",
        columns: [
          whole("sack", "SCK", "Sacks"),
          whole("int", "INT", "Interceptions"),
          whole("fum_rec", "FR", "Fumbles recovered"),
          whole("def_td", "TD", "Touchdowns"),
          whole("pts_allow", "PA", "Points allowed"),
        ],
      },
    ];
  return [{ group: "Receiving", columns: RECEIVING }, { group: "Rushing", columns: RUSHING }];
}

/** A season's fantasy points under a league's scoring (or Sleeper's PPR without it). */
export function seasonPoints(stats: Record<string, number>, scoring?: Record<string, number>): number {
  return weighProjection(stats, scoring) ?? 0;
}

/** His rank at his position that season, by the league's reception scoring — null when Sleeper doesn't say. */
export function seasonRank(stats: Record<string, number>, scoring?: Record<string, number>): number | null {
  const rec = scoring?.rec ?? 1;
  const rank = rec >= 1 ? stats.pos_rank_ppr : rec > 0 ? stats.pos_rank_half_ppr : stats.pos_rank_std;
  return typeof rank === "number" && rank > 0 ? rank : null;
}

/** Every season's stats added up — counts only, so a rank or a rate isn't summed (rates are worked out again). */
export function careerTotals(seasons: CareerSeason[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { stats } of seasons) {
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value !== "number" || /rank|_lng|_pct|_rtg|_ypa|_ypc|_ypr|_ypt|cmp_pct/.test(key)) continue;
      out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
}
