// Standard PPR fantasy points for a single play, read from ESPN's play-by-play
// line — what each Red Zone row shows. Uses Sleeper's default PPR scoring.
// ESPN's lines are the only per-play source there is, so this is the same
// shorthand a person would read ("J.Allen pass short right to K.Coleman for
// 8 yards"), parsed per role. Points allowed by a defense come from the final
// score, not from any one play, so they aren't counted here; nor are kick and
// punt return touchdowns.

import { FeedCandidate, GamePlay, playTextNamePattern } from "./play-by-play";

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

/**
 * What one player did on one play, read from its line: passes thrown and
 * completed, yards and touchdowns, carries, catches, kicks — or, for a team
 * defense, its sacks and takeaways. Nothing for a play wiped out by a penalty
 * ("No Play") or one the player wasn't credited with anything on.
 */
export function statsForPlay(play: GamePlay, player: FeedCandidate): PlayStats {
  // Tacklers and other defenders, in parentheses and brackets, never earn anything.
  const text = play.text.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s+/g, " ");
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
      add(stats, "pass_yd", yardsAfter(main, pass.index) ?? play.yards);
      if (offenseTd) add(stats, "pass_td");
    }
  }

  // Catching.
  const catchMatch = new RegExp(`pass(?: (?:short|deep))?(?: (?:left|middle|right))? to ${name}`).exec(main);
  if (catchMatch) {
    add(stats, "rec");
    add(stats, "rec_yd", yardsAfter(main, catchMatch.index) ?? play.yards);
    if (offenseTd) add(stats, "rec_td");
  }

  // Running: the line opens with the runner, doing anything but passing, being sacked or kicking.
  const run = new RegExp(`^${name} (?!pass|sacked|kicks|punts|\\d+ yard field goal|extra point|spiked)`).exec(main.trim());
  if (run && !pass) {
    add(stats, "rush_att");
    add(stats, "rush_yd", yardsAfter(main.trim(), 0) ?? play.yards);
    if (offenseTd) add(stats, "rush_td");
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
