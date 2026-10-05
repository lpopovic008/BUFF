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

function defensePoints(play: GamePlay, text: string): number {
  let pts = 0;
  if (/sacked/i.test(text)) pts += PPR.defSack;
  if (/INTERCEPTED/.test(text)) pts += PPR.defInt;
  else if (play.turnover && /FUMBLES/i.test(text)) pts += PPR.defFumRec;
  if (play.turnover && /TOUCHDOWN/.test(text)) pts += PPR.defTd;
  if (/SAFETY/.test(text)) pts += PPR.defSafety;
  if (/BLOCKED/i.test(text)) pts += PPR.defBlock;
  return pts;
}

/**
 * The standard PPR points one starter earned on one play — 0 when the play
 * was wiped out by a penalty ("No Play") or the starter wasn't credited with
 * anything on it (an incompletion thrown their way, say).
 */
export function pprPointsForPlay(play: GamePlay, player: FeedCandidate): number {
  // Tacklers and other defenders, in parentheses and brackets, never earn anything.
  const text = play.text.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s+/g, " ");
  if (/No Play/i.test(text)) return 0;
  if (player.position === "DEF") return round2(defensePoints(play, text));

  const pattern = playTextNamePattern(player.name);
  if (!pattern) return 0;
  const name = pattern.source;

  // A two-point try is its own sentence at the end of a touchdown's line.
  const split = text.search(/TWO-POINT CONVERSION ATTEMPT/i);
  const main = split >= 0 ? text.slice(0, split) : text;
  const twoPt = split >= 0 ? text.slice(split) : "";

  const offenseTd = /TOUCHDOWN/.test(main) && !play.turnover;
  let pts = 0;

  // Kicking.
  const fg = new RegExp(`${name} (\\d+) yard field goal is (GOOD|No Good|BLOCKED)`, "i").exec(main);
  if (fg) pts += /GOOD/.test(fg[2]) ? PPR.fg(Number(fg[1])) : PPR.fgMiss;
  const xp = new RegExp(`${name} extra point is (GOOD|No Good|Blocked)`, "i").exec(text);
  if (xp) pts += /GOOD/.test(xp[1]) ? PPR.xp : PPR.xpMiss;

  // Passing.
  const pass = new RegExp(`${name} pass`).exec(main);
  if (pass) {
    if (/INTERCEPTED/.test(main)) pts += PPR.passInt;
    else if (!/pass incomplete/i.test(main.slice(pass.index))) {
      pts += (yardsAfter(main, pass.index) ?? play.yards) * PPR.passYd;
      if (offenseTd) pts += PPR.passTd;
    }
  }

  // Catching.
  const catchMatch = new RegExp(`pass(?: (?:short|deep))?(?: (?:left|middle|right))? to ${name}`).exec(main);
  if (catchMatch) {
    pts += PPR.rec + (yardsAfter(main, catchMatch.index) ?? play.yards) * PPR.recYd;
    if (offenseTd) pts += PPR.recTd;
  }

  // Running: the line opens with the runner, doing anything but passing, being sacked or kicking.
  const run = new RegExp(`^${name} (?!pass|sacked|kicks|punts|\\d+ yard field goal|extra point|spiked)`).exec(main.trim());
  if (run && !pass) {
    pts += (yardsAfter(main.trim(), 0) ?? play.yards) * PPR.rushYd;
    if (offenseTd) pts += PPR.rushTd;
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
    if (fumbler && !someoneElseCaught) pts += PPR.fumLost;
  }

  // The two-point try: whoever threw, caught or ran it in.
  if (twoPt && /ATTEMPT SUCCEEDS/i.test(twoPt)) {
    const passed = new RegExp(`${name} pass`).test(twoPt);
    const caught = new RegExp(`to ${name}`).test(twoPt);
    const ran = new RegExp(`ATTEMPT\\.\\s*${name} (?!pass)`, "i").test(twoPt);
    if (passed || caught || ran) pts += PPR.twoPt;
  }

  return round2(pts);
}

/** A delta for display: "+5.12", "-2", "0". */
export function formatPlayPoints(points: number): string {
  const s = String(round2(Math.abs(points)));
  return points > 0 ? `+${s}` : points < 0 ? `-${s}` : "0";
}
