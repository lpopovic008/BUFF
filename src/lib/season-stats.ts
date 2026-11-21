// Every player's raw season totals — attempts, carries, targets, yards, snaps
// and the rest — fetched server-side by scripts/fetch-player-stats.ts and
// written to public/data/season-stats.json, which the Values page fetches
// when its stat filters need it (it isn't bundled into the app). Player ids are
// Sleeper's, as everywhere else.

/** The file as written: each player's totals in `keys`' order (Sleeper's stat keys). */
export interface SeasonStatsFile {
  updatedAt: string | null;
  season: string | null;
  throughWeek: number | null;
  keys: string[];
  players: Record<string, number[]>;
}

/** A player's season totals, by Sleeper's stat key ("rush_att", "rec_yd"...) — 0 for any he hasn't any of. */
export type SeasonTotals = Record<string, number>;

export interface SeasonStats {
  season: string | null;
  throughWeek: number | null;
  byPlayer: Map<string, SeasonTotals>;
}

let load: Promise<SeasonStats | null> | null = null;

/** Every player's season totals — fetched once, null where there aren't any yet. */
export function loadSeasonStats(): Promise<SeasonStats | null> {
  load ??= fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/season-stats.json`)
    .then((res) => (res.ok ? (res.json() as Promise<SeasonStatsFile>) : null))
    .then((file) => (file ? readSeasonStats(file) : null))
    .catch(() => null);
  return load;
}

/** The file's rows as each player's totals by key. */
export function readSeasonStats(file: SeasonStatsFile): SeasonStats {
  const byPlayer = new Map<string, SeasonTotals>();
  for (const [id, row] of Object.entries(file.players)) {
    const totals: SeasonTotals = {};
    file.keys.forEach((key, i) => (totals[key] = row[i] ?? 0));
    byPlayer.set(id, totals);
  }
  return { season: file.season, throughWeek: file.throughWeek, byPlayer };
}

/** How a stat's shown: to a decimal, a whole number, or a percentage. */
type StatFormat = "decimal" | "whole" | "percent";

/** A stat worked out from a player's season totals, to filter and sort players by. */
export interface StatMetric {
  id: string;
  /** Spelled out, and short (on a card). */
  label: string;
  short: string;
  group: "Fantasy" | "Usage" | "Rushing" | "Receiving" | "Passing";
  format: StatFormat;
  /** The Sleeper keys it needs — it's offered only where some player has some of them. */
  needs: string[];
  /** Its value for a player — null where it doesn't apply (yards a carry with no carries). */
  of: (t: SeasonTotals) => number | null;
}

const get = (t: SeasonTotals, key: string) => t[key] ?? 0;
/** `a` over `b`, where there's any `b`. */
const per = (a: number, b: number) => (b > 0 ? a / b : null);
const perGame = (key: string) => (t: SeasonTotals) => per(get(t, key), get(t, "gp"));
const touches = (t: SeasonTotals) => get(t, "rush_att") + get(t, "rec");
const scrimmage = (t: SeasonTotals) => get(t, "rush_yd") + get(t, "rec_yd");
const metric = (m: StatMetric) => m;

/** Every stat to filter and sort by, grouped as they're offered. */
export const STAT_METRICS: StatMetric[] = [
  metric({ id: "ppg", label: "Fantasy points a game (PPR)", short: "PPG", group: "Fantasy", format: "decimal", needs: ["pts_ppr"], of: perGame("pts_ppr") }),
  metric({ id: "pts", label: "Fantasy points (PPR)", short: "PTS", group: "Fantasy", format: "whole", needs: ["pts_ppr"], of: (t) => get(t, "pts_ppr") }),
  metric({ id: "ppt", label: "Fantasy points a touch", short: "PTS/TCH", group: "Fantasy", format: "decimal", needs: ["pts_ppr", "rush_att", "rec"], of: (t) => per(get(t, "pts_ppr"), touches(t)) }),
  metric({ id: "gp", label: "Games played", short: "GP", group: "Usage", format: "whole", needs: ["gp"], of: (t) => get(t, "gp") }),
  metric({ id: "snaps", label: "Snap share", short: "SNAP%", group: "Usage", format: "percent", needs: ["off_snp", "tm_off_snp"], of: (t) => per(get(t, "off_snp"), get(t, "tm_off_snp")) }),
  metric({ id: "tpg", label: "Touches a game", short: "TCH/G", group: "Usage", format: "decimal", needs: ["rush_att", "rec"], of: (t) => per(touches(t), get(t, "gp")) }),
  metric({ id: "ypt", label: "Yards a touch", short: "YDS/TCH", group: "Usage", format: "decimal", needs: ["rush_yd", "rec_yd"], of: (t) => per(scrimmage(t), touches(t)) }),
  metric({ id: "scrim", label: "Scrimmage yards a game", short: "SCRIM/G", group: "Usage", format: "decimal", needs: ["rush_yd", "rec_yd"], of: (t) => per(scrimmage(t), get(t, "gp")) }),
  metric({ id: "tds", label: "Total touchdowns", short: "TD", group: "Usage", format: "whole", needs: ["rush_td", "rec_td"], of: (t) => get(t, "rush_td") + get(t, "rec_td") }),
  metric({ id: "apg", label: "Carries a game", short: "ATT/G", group: "Rushing", format: "decimal", needs: ["rush_att"], of: perGame("rush_att") }),
  metric({ id: "ypc", label: "Yards a carry", short: "YPC", group: "Rushing", format: "decimal", needs: ["rush_att", "rush_yd"], of: (t) => per(get(t, "rush_yd"), get(t, "rush_att")) }),
  metric({ id: "rypg", label: "Rushing yards a game", short: "RUSH/G", group: "Rushing", format: "decimal", needs: ["rush_yd"], of: perGame("rush_yd") }),
  metric({ id: "rtd", label: "Rushing touchdowns", short: "RUSH TD", group: "Rushing", format: "whole", needs: ["rush_td"], of: (t) => get(t, "rush_td") }),
  metric({ id: "rza", label: "Red-zone carries", short: "RZ ATT", group: "Rushing", format: "whole", needs: ["rush_rz_att"], of: (t) => get(t, "rush_rz_att") }),
  metric({ id: "tgpg", label: "Targets a game", short: "TGT/G", group: "Receiving", format: "decimal", needs: ["rec_tgt"], of: perGame("rec_tgt") }),
  metric({ id: "rpg", label: "Receptions a game", short: "REC/G", group: "Receiving", format: "decimal", needs: ["rec"], of: perGame("rec") }),
  metric({ id: "catch", label: "Catch rate", short: "CATCH%", group: "Receiving", format: "percent", needs: ["rec", "rec_tgt"], of: (t) => per(get(t, "rec"), get(t, "rec_tgt")) }),
  metric({ id: "recypg", label: "Receiving yards a game", short: "REC YDS/G", group: "Receiving", format: "decimal", needs: ["rec_yd"], of: perGame("rec_yd") }),
  metric({ id: "ypr", label: "Yards a reception", short: "YPR", group: "Receiving", format: "decimal", needs: ["rec", "rec_yd"], of: (t) => per(get(t, "rec_yd"), get(t, "rec")) }),
  metric({ id: "yptgt", label: "Yards a target", short: "YPT", group: "Receiving", format: "decimal", needs: ["rec_tgt", "rec_yd"], of: (t) => per(get(t, "rec_yd"), get(t, "rec_tgt")) }),
  metric({ id: "adot", label: "Average depth of target", short: "ADOT", group: "Receiving", format: "decimal", needs: ["rec_air_yd", "rec_tgt"], of: (t) => per(get(t, "rec_air_yd"), get(t, "rec_tgt")) }),
  metric({ id: "yac", label: "Yards after the catch a reception", short: "YAC/REC", group: "Receiving", format: "decimal", needs: ["rec_yar", "rec"], of: (t) => per(get(t, "rec_yar"), get(t, "rec")) }),
  metric({ id: "rectd", label: "Receiving touchdowns", short: "REC TD", group: "Receiving", format: "whole", needs: ["rec_td"], of: (t) => get(t, "rec_td") }),
  metric({ id: "rzt", label: "Red-zone targets", short: "RZ TGT", group: "Receiving", format: "whole", needs: ["rec_rz_tgt"], of: (t) => get(t, "rec_rz_tgt") }),
  metric({ id: "papg", label: "Pass attempts a game", short: "PASS ATT/G", group: "Passing", format: "decimal", needs: ["pass_att"], of: perGame("pass_att") }),
  metric({ id: "cmp", label: "Completion rate", short: "CMP%", group: "Passing", format: "percent", needs: ["pass_cmp", "pass_att"], of: (t) => per(get(t, "pass_cmp"), get(t, "pass_att")) }),
  metric({ id: "pypg", label: "Passing yards a game", short: "PASS/G", group: "Passing", format: "decimal", needs: ["pass_yd"], of: perGame("pass_yd") }),
  metric({ id: "ypa", label: "Yards an attempt", short: "Y/A", group: "Passing", format: "decimal", needs: ["pass_yd", "pass_att"], of: (t) => per(get(t, "pass_yd"), get(t, "pass_att")) }),
  metric({ id: "ptd", label: "Passing touchdowns", short: "PASS TD", group: "Passing", format: "whole", needs: ["pass_td"], of: (t) => get(t, "pass_td") }),
  metric({ id: "int", label: "Interceptions", short: "INT", group: "Passing", format: "whole", needs: ["pass_int"], of: (t) => get(t, "pass_int") }),
  metric({ id: "tdint", label: "Touchdowns an interception", short: "TD/INT", group: "Passing", format: "decimal", needs: ["pass_td", "pass_int"], of: (t) => (get(t, "pass_att") > 0 ? get(t, "pass_td") / Math.max(1, get(t, "pass_int")) : null) }),
];

/** The stats there's anything for in `stats` — a stat none of whose keys any player has isn't offered. */
export function offeredMetrics(stats: SeasonStats): StatMetric[] {
  const has = new Set<string>();
  for (const totals of stats.byPlayer.values()) for (const [key, v] of Object.entries(totals)) if (v) has.add(key);
  return STAT_METRICS.filter((m) => m.needs.every((key) => has.has(key)));
}

/** A stat's value as it's shown: "4.8", "62%", "11". */
export function formatStat(metric: StatMetric, value: number): string {
  if (metric.format === "percent") return `${Math.round(value * 100)}%`;
  if (metric.format === "whole") return `${Math.round(value)}`;
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

/** A filter on a stat: players at least (or at most) a value of it — given as it's shown (a percentage as 62). */
export interface StatFilter {
  metric: string;
  at: "least" | "most";
  value: number | null;
}

/** Whether a player's totals pass a filter — a filter with no value yet passes everyone with any of the stat. */
export function passesStatFilter(filter: StatFilter, metric: StatMetric, totals: SeasonTotals | undefined): boolean {
  const v = totals ? metric.of(totals) : null;
  if (v === null) return false;
  if (filter.value === null) return true;
  const shown = metric.format === "percent" ? v * 100 : v;
  return filter.at === "least" ? shown >= filter.value : shown <= filter.value;
}
