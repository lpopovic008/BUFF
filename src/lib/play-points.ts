// Standard PPR fantasy points for a single play, read from ESPN's play-by-play
// line — what each Red Zone row shows. Uses Sleeper's default PPR scoring.
// ESPN's lines are the only per-play source there is, so this is the same
// shorthand a person would read ("J.Allen pass short right to K.Coleman for
// 8 yards"), parsed per role. Points allowed by a defense come from the final
// score, not from any one play, so they aren't counted here; nor are kick and
// punt return touchdowns.

import { FeedCandidate, GamePlay, playAction, playTextNamePattern } from "./play-by-play";

/** Sleeper's default PPR scoring, the parts a single play can earn. */
export const PPR = {
  passYd: 0.04,
  passTd: 4,
  passInt: -1,
  rushYd: 0.1,
  rushTd: 6,
  rec: 1,
  recYd: 0.1,
  recTd: 6,
  twoPt: 2,
  fumLost: -2,
  /** By distance: under 40, 40–49, 50+. */
  fg: (yards: number) => (yards >= 50 ? 5 : yards >= 40 ? 4 : 3),
  fgMiss: -1,
  xp: 1,
  xpMiss: -1,
  defSack: 1,
  defInt: 2,
  defFumRec: 2,
  defTd: 6,
  defSafety: 2,
  defBlock: 2,
} as const;

/** "for 8 yards" / "for -3 yards" / "for no gain", the first one at or after `from`. */
function yardsAfter(text: string, from: number): number | null {
  const m = /for (-?\d+) yards?|for no gain/i.exec(text.slice(from));
  if (!m) return null;
  return m[1] !== undefined ? Number(m[1]) : 0;
}

/** Rounds away floating-point dust: 0.04 × 28 + 4 is 5.12, not 5.120000000000001. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One play's stats for one player, in Sleeper's stat names (only the ones it earned). */
export type PlayStats = Record<string, number>;

function add(stats: PlayStats, key: string, n = 1) {
  stats[key] = (stats[key] ?? 0) + n;
}

function defenseStats(play: GamePlay, text: string): PlayStats {
  const stats: PlayStats = {};
  if (/sacked/i.test(text)) add(stats, "sack");
  if (/INTERCEPTED/.test(text)) add(stats, "int");
  else if (play.turnover && /FUMBLES/i.test(text)) add(stats, "fum_rec");
  if (play.turnover && /TOUCHDOWN/.test(text)) add(stats, "def_td");
  if (/SAFETY/.test(text)) add(stats, "safe");
  if (/BLOCKED/i.test(text)) add(stats, "blk_kick");
  return stats;
}

/** Whether a gain of `yards` (or a touchdown) moved the chains, from the down and distance it was snapped on. */
function firstDown(play: GamePlay, yards: number, touchdown: boolean): boolean {
  if (touchdown) return true;
  const toGo = /&\s*(\d+)/.exec(play.downDistance ?? "");
  return toGo !== null && yards >= Number(toGo[1]);
}

/**
 * The stats some leagues pay extra for, in Sleeper's names: a first down
 * ("rec_fd"), a 40-yard-plus play ("rec_40p"), a 40-yard-plus touchdown
 * ("rec_td_40p") — "pass_cmp_40p" for a long completion.
 */
function bonusStats(stats: PlayStats, kind: "pass" | "rush" | "rec", yards: number, touchdown: boolean, moved: boolean) {
  if (moved) add(stats, `${kind}_fd`);
  if (yards >= 40) {
    add(stats, kind === "pass" ? "pass_cmp_40p" : `${kind}_40p`);
    if (touchdown) add(stats, `${kind}_td_40p`);
  }
}

/**
 * What one player did on one play, read from its line: passes thrown and
 * completed, yards and touchdowns, carries, catches, kicks — or, for a team
 * defense, its sacks and takeaways. Nothing for a play wiped out by a penalty
 * ("No Play") or one the player wasn't credited with anything on.
 */
export function statsForPlay(play: GamePlay, player: FeedCandidate): PlayStats {
  // Tacklers and other defenders, in parentheses and brackets, never earn anything.
  // From where the play starts: no tacklers, and not the lineman who reported in as eligible.
  const text = playAction(play.text);
  if (/No Play/i.test(text)) return {};
  if (player.position === "DEF") return defenseStats(play, text);

  const pattern = playTextNamePattern(player.name);
  if (!pattern) return {};
  const name = pattern.source;
  const stats: PlayStats = {};

  // A two-point try is its own sentence at the end of a touchdown's line.
  const split = text.search(/TWO-POINT CONVERSION ATTEMPT/i);
  const main = split >= 0 ? text.slice(0, split) : text;
  const twoPt = split >= 0 ? text.slice(split) : "";

  const offenseTd = /TOUCHDOWN/.test(main) && !play.turnover;

  // Kicking.
  const fg = new RegExp(`${name} (\\d+) yard field goal is (GOOD|No Good|BLOCKED)`, "i").exec(main);
  if (fg) {
    add(stats, "fga");
    if (/GOOD/.test(fg[2])) {
      const yards = Number(fg[1]);
      add(stats, "fgm");
      add(stats, yards >= 50 ? "fgm_50p" : yards >= 40 ? "fgm_40_49" : "fgm_0_39");
      // Sleeper's own distance buckets, which a league's scoring is written in.
      if (yards < 40) add(stats, yards < 20 ? "fgm_0_19" : yards < 30 ? "fgm_20_29" : "fgm_30_39");
      if (yards >= 50) add(stats, yards >= 60 ? "fgm_60p" : "fgm_50_59");
      add(stats, "fgm_yds", yards);
    }
  }
  const xp = new RegExp(`${name} extra point is (GOOD|No Good|Blocked)`, "i").exec(text);
  if (xp) {
    add(stats, "xpa");
    if (/GOOD/.test(xp[1])) add(stats, "xpm");
  }

  // Passing.
  const pass = new RegExp(`${name} pass`).exec(main);
  if (pass) {
    add(stats, "pass_att");
    if (/INTERCEPTED/.test(main)) add(stats, "pass_int");
    else if (!/pass incomplete/i.test(main.slice(pass.index))) {
      add(stats, "pass_cmp");
      const yards = yardsAfter(main, pass.index) ?? play.yards;
      add(stats, "pass_yd", yards);
      if (offenseTd) add(stats, "pass_td");
      bonusStats(stats, "pass", yards, offenseTd, firstDown(play, yards, offenseTd));
    }
  }

  // Targets: thrown to, caught or not — or picked off on the way.
  if (new RegExp(`pass(?: incomplete)?(?: (?:short|deep))?(?: (?:left|middle|right))? (?:to|intended for) ${name}`).test(main)) add(stats, "rec_tgt");

  // Catching.
  const catchMatch = new RegExp(`pass(?: (?:short|deep))?(?: (?:left|middle|right))? to ${name}`).exec(main);
  if (catchMatch) {
    add(stats, "rec");
    const yards = yardsAfter(main, catchMatch.index) ?? play.yards;
    add(stats, "rec_yd", yards);
    if (offenseTd) add(stats, "rec_td");
    bonusStats(stats, "rec", yards, offenseTd, firstDown(play, yards, offenseTd));
  }

  // Running: the line opens with the runner, doing anything but passing, being sacked or kicking.
  const run = new RegExp(`^${name} (?!pass|sacked|kicks|punts|\\d+ yard field goal|extra point|spiked)`).exec(main.trim());
  if (run && !pass) {
    add(stats, "rush_att");
    const yards = yardsAfter(main.trim(), 0) ?? play.yards;
    add(stats, "rush_yd", yards);
    if (offenseTd) add(stats, "rush_td");
    bonusStats(stats, "rush", yards, offenseTd, firstDown(play, yards, offenseTd));
  }

  // Losing the ball: whoever ESPN names fumbling, or else whoever had it — the
  // receiver on a catch, otherwise the runner or the sacked passer.
  if (play.turnover && /FUMBLES/.test(main)) {
    const named = /(\S+\.\S+(?: \S+)?) FUMBLES/.exec(main);
    const fumbler = named
      ? new RegExp(name).test(named[1])
      : catchMatch
        ? true
        : !!run || new RegExp(`^${name} sacked`).test(main.trim());
    const someoneElseCaught = !named && !catchMatch && /pass(?: (?:short|deep))?(?: (?:left|middle|right))? to /.test(main);
    if (fumbler && !someoneElseCaught) add(stats, "fum_lost");
  }

  // The two-point try: whoever threw, caught or ran it in.
  if (twoPt && /ATTEMPT SUCCEEDS/i.test(twoPt)) {
    if (new RegExp(`${name} pass`).test(twoPt)) add(stats, "pass_2pt");
    if (new RegExp(`to ${name}`).test(twoPt)) add(stats, "rec_2pt");
    if (new RegExp(`ATTEMPT\\.\\s*${name} (?!pass)`, "i").test(twoPt)) add(stats, "rush_2pt");
  }

  return stats;
}

/** Standard PPR points for a stat line. */
export function pprPoints(stats: PlayStats): number {
  const n = (key: string) => stats[key] ?? 0;
  return round2(
    n("pass_yd") * PPR.passYd +
      n("pass_td") * PPR.passTd +
      n("pass_int") * PPR.passInt +
      n("rush_yd") * PPR.rushYd +
      n("rush_td") * PPR.rushTd +
      n("rec") * PPR.rec +
      n("rec_yd") * PPR.recYd +
      n("rec_td") * PPR.recTd +
      (n("pass_2pt") + n("rec_2pt") + n("rush_2pt")) * PPR.twoPt +
      n("fum_lost") * PPR.fumLost +
      n("fgm_0_39") * PPR.fg(0) +
      n("fgm_40_49") * PPR.fg(40) +
      n("fgm_50p") * PPR.fg(50) +
      (n("fga") - n("fgm")) * PPR.fgMiss +
      n("xpm") * PPR.xp +
      (n("xpa") - n("xpm")) * PPR.xpMiss +
      n("sack") * PPR.defSack +
      n("int") * PPR.defInt +
      n("fum_rec") * PPR.defFumRec +
      n("def_td") * PPR.defTd +
      n("safe") * PPR.defSafety +
      n("blk_kick") * PPR.defBlock
  );
}

/**
 * The standard PPR points one starter earned on one play — 0 when the play
 * was wiped out by a penalty ("No Play") or the starter wasn't credited with
 * anything on it (an incompletion thrown their way, say).
 */
export function pprPointsForPlay(play: GamePlay, player: FeedCandidate): number {
  return pprPoints(statsForPlay(play, player));
}

/** A delta for display: "+5.12", "-2", "0". */
export function formatPlayPoints(points: number): string {
  const s = String(round2(Math.abs(points)));
  return points > 0 ? `+${s}` : points < 0 ? `-${s}` : "0";
}

/** Sleeper's default PPR scoring, in its own stat names — the rules a graph falls back on when a player has no league's. */
export const PPR_SCORING: Record<string, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -1,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum_lost: -2,
  fgm_0_19: 3,
  fgm_20_29: 3,
  fgm_30_39: 3,
  fgm_40_49: 4,
  fgm_50p: 5,
  fgmiss: -1,
  xpm: 1,
  xpmiss: -1,
  sack: 1,
  int: 2,
  fum_rec: 2,
  def_td: 6,
  safe: 2,
  blk_kick: 2,
  pts_allow_0: 10,
  pts_allow_1_6: 7,
  pts_allow_7_13: 4,
  pts_allow_14_20: 1,
  pts_allow_21_27: 0,
  pts_allow_28_34: -1,
  pts_allow_35p: -4,
};

// A defense's points-allowed brackets, in Sleeper's names, by the most it can have allowed.
const POINTS_ALLOWED: [number, string][] = [
  [0, "pts_allow_0"],
  [6, "pts_allow_1_6"],
  [13, "pts_allow_7_13"],
  [20, "pts_allow_14_20"],
  [27, "pts_allow_21_27"],
  [34, "pts_allow_28_34"],
  [Infinity, "pts_allow_35p"],
];

// Stat lines past these marks earn some leagues a bonus, once each.
const THRESHOLDS: [string, (s: PlayStats) => number, number][] = [
  ["bonus_pass_yd_300", (s) => s.pass_yd ?? 0, 300],
  ["bonus_pass_yd_400", (s) => s.pass_yd ?? 0, 400],
  ["bonus_rush_yd_100", (s) => s.rush_yd ?? 0, 100],
  ["bonus_rush_yd_200", (s) => s.rush_yd ?? 0, 200],
  ["bonus_rec_yd_100", (s) => s.rec_yd ?? 0, 100],
  ["bonus_rec_yd_200", (s) => s.rec_yd ?? 0, 200],
  ["bonus_rush_rec_yd_100", (s) => (s.rush_yd ?? 0) + (s.rec_yd ?? 0), 100],
  ["bonus_rush_rec_yd_200", (s) => (s.rush_yd ?? 0) + (s.rec_yd ?? 0), 200],
  ["bonus_pass_cmp_25", (s) => s.pass_cmp ?? 0, 25],
  ["bonus_rush_att_20", (s) => s.rush_att ?? 0, 20],
];

/**
 * A stat line's points under a league's own scoring (Sleeper's
 * scoring_settings): every stat it pays for, misses at their own price, its
 * catch bonus by position (a TE premium), any yardage marks passed and — for
 * a defense with `pts_allow` in its line — the points-allowed bracket it's in.
 * Score a running total of a player's game and the bonuses land on the play
 * that crossed the mark.
 */
export function scoreStats(stats: PlayStats, scoring: Record<string, number>, position: string): number {
  let sum = 0;
  for (const [key, n] of Object.entries(stats)) {
    if (key === "pts_allow") continue;
    const weight = scoring[key];
    if (typeof weight === "number") sum += weight * n;
  }
  sum += (scoring.fgmiss ?? 0) * Math.max(0, (stats.fga ?? 0) - (stats.fgm ?? 0));
  sum += (scoring.xpmiss ?? 0) * Math.max(0, (stats.xpa ?? 0) - (stats.xpm ?? 0));
  const catchBonus = position === "TE" ? "bonus_rec_te" : position === "RB" ? "bonus_rec_rb" : position === "WR" ? "bonus_rec_wr" : null;
  if (catchBonus) sum += (scoring[catchBonus] ?? 0) * (stats.rec ?? 0);
  for (const [key, value, mark] of THRESHOLDS) if (value(stats) >= mark) sum += scoring[key] ?? 0;
  if (typeof stats.pts_allow === "number") {
    const bracket = POINTS_ALLOWED.find(([most]) => stats.pts_allow <= most)?.[1];
    if (bracket) sum += scoring[bracket] ?? 0;
  }
  return round2(sum);
}
