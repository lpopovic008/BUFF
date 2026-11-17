// What a play was, read off ESPN's line for it — a pass, a run, a sack, a kick, a kneel, a flag — and who did it: told
// by the ball on a live game's field on the floor (see ball-flight), and in a few words in the Red Zone (playSummary).
// The offense is read as driving left to right.

import { normalizeTeam } from "./nfl-schedule";
import { cleanPlayText, GamePlay, playAction, SHORT_NAME } from "./play-by-play";

export type SceneKind =
  | "pass"
  | "incomplete"
  | "interception"
  | "run"
  | "sack"
  | "kneel"
  | "spike"
  | "fumble"
  | "fieldGoal"
  | "extraPoint"
  | "punt"
  | "kickoff"
  | "penalty";

/** A flag on a play: on whom (their team, and ESPN's shorthand for them when it names one), for what, and what came of it. */
export interface Penalty {
  team: string;
  label: string | null;
  /** "Offensive Holding", "False Start"... */
  name: string;
  yards: number | null;
  declined: boolean;
  /** The play it was on doesn't count. */
  noPlay: boolean;
}

/** What a play's line says happened, and who did it (ESPN's shorthand for each: "J.Allen"). */
export interface PlayScene {
  kind: SceneKind;
  /** The team with the ball (for a kickoff, the one receiving it), and the other. */
  offense: string;
  defense: string;
  /** A pass's or run's gain (a sack's loss, negative); an interception's return; a kick's length. */
  yards: number;
  /** How far past the line a pass was caught, or thrown; how far a kick was run back. */
  air: number;
  /** Which side it went to, from the offense's view: -1 left, 0 the middle, 1 right. */
  lane: -1 | 0 | 1;
  touchdown: boolean;
  /** A kick through the uprights. */
  good: boolean;
  blocked: boolean;
  /** The ball came out at the end and the other side has it. */
  fumbleLost: boolean;
  passer: string | null;
  /** Who a pass went to (or was meant for). */
  target: string | null;
  runner: string | null;
  /** Who made the play on the other side: the tackler, the sacker, the one who picked it off or fell on the ball. */
  defender: string | null;
  kicker: string | null;
  returner: string | null;
  /** The quarterback kept it himself. */
  scramble: boolean;
  /** How far the line of scrimmage was from the goal line the team driving left to right is going for (a kickoff's
   * from the kicking team's) — null when ESPN doesn't say. */
  toGoal: number | null;
  /** How far the offense had to go for a first down ("3rd & 4": 4) — null to the goal line, or off a down. */
  toGo: number | null;
  /** A two-point try, and whether it was good. */
  conversion: { good: boolean } | null;
  /** Tackled in his own end zone. */
  safety: boolean;
  /** How a kick ended with no one running it back: "TOUCHBACK", "FAIR CATCH", "DOWNED", "OUT OF BOUNDS"... */
  kickResult: string | null;
  onside: boolean;
  /** Who came up with a loose kick (an onside kick's): their team, and ESPN's shorthand for them when it names one. */
  recoveredBy: { team: string; label: string | null } | null;
  penalty: Penalty | null;
  /** The ball came loose at the end of it: who fell on it (null — whoever had it), whether the other side did, and how
   * far he ran it back. */
  fumble: { by: string | null; lost: boolean; back: number } | null;
  /** Pitched back to a teammate (who, and how far along the first had got with it) — who took it the rest of the way. */
  lateral: { to: string; at: number } | null;
  /** Challenged by a coach (or looked at from the booth): whether the call was overturned, and whether this is the play
   * as called on the field (the red flag thrown on it) or as it stands once overturned. */
  review: { booth: boolean; reversed: boolean; called: boolean } | null;
  /** Acted out right after it: a touchdown's try, or the play as it stands once a review reversed it. */
  after: PlayScene | null;
}

const NAME = `(${SHORT_NAME})`;
const DIR = String.raw`(?:(short|deep)\s+)?(?:(left|middle|right)\s+)?`;

const laneOf = (side: string | undefined): -1 | 0 | 1 => (side === "left" ? -1 : side === "right" ? 1 : 0);

/** How far a pass went in the air when the line doesn't say: most of a deep one's gain, some of a short one's. */
function airYards(yards: number, depth: string | undefined): number {
  if (yards <= 2) return yards;
  if (depth === "deep") return Math.max(15, Math.round(yards * 0.8));
  if (depth === "short") return Math.min(yards, Math.max(2, Math.round(yards * 0.5)));
  return Math.round(yards * 0.6);
}

/** The first player named in the play's first parentheses after `from` — the tackler, the one who broke it up. */
function inParens(text: string, from = 0): string | null {
  const m = new RegExp(String.raw`\(\s*${NAME}`).exec(text.slice(from));
  return m ? m[1].replace(/\s+/g, " ") : null;
}

/** The yards to go in a down and distance ("3rd & 4": 4); null for "& Goal", or none given. */
function toGoOf(downDistance: string | null): number | null {
  const m = /&\s*(\d+)/.exec(downDistance ?? "");
  return m ? Number(m[1]) : null;
}

/** "for 12 yards" / "for -3 yards" / "for no gain" after `from`, or null. */
function gainAfter(text: string, from = 0): number | null {
  const m = /for (-?\d+) yards?|for (no gain)/i.exec(text.slice(from));
  if (!m) return null;
  return m[2] ? 0 : Number(m[1]);
}

/** The ball coming loose at the end of a play — "FUMBLES (Z.Sieler), RECOVERED by MIA-J.Phillips at BUF 30. J.Phillips
 * to BUF 25 for 5 yards" — but for a snap that got away (a play of its own). */
function fumbleOf(text: string, offense: string): PlayScene["fumble"] {
  const at = text.search(/\bFUMBLES\b(?!\s*\(Aborted)/);
  if (at < 0) return null;
  const rest = text.slice(at);
  const rec = new RegExp(String.raw`RECOVERED by ([A-Z]{2,3})-${NAME}`).exec(rest);
  if (!rec) return { by: null, lost: false, back: 0 };
  const after = rest.slice(rec.index + rec[0].length);
  const ran = new RegExp(String.raw`${NAME}\s+(?:to|for|ran|pushed)\b`).exec(after);
  return { by: rec[2], lost: normalizeTeam(rec[1]) !== offense, back: ran ? Math.max(0, gainAfter(after, ran.index) ?? 0) : 0 };
}

/** Pitched back to a teammate: "S.Diggs lateral to J.Cook to KC 45 for 15 yards" — to whom, and how far he took it. */
function lateralOf(action: string): { to: string; more: number } | null {
  const m = new RegExp(String.raw`${NAME}\s+laterals?(?:ed)?\s+to\s+${NAME}`, "i").exec(action);
  return m ? { to: m[2], more: gainAfter(action, m.index) ?? 0 } : null;
}

/** The flag on a play, if there's one: "PENALTY on BUF-D.Dawkins, Offensive Holding, 10 yards, enforced at BUF 35 - No Play." */
export function penaltyOf(text: string): Penalty | null {
  const m = new RegExp(String.raw`PENALTY on ([A-Z]{2,3})(?:-${NAME})?,\s*([^,.]+?)\s*(?:,\s*(\d+)\s+yards?|,\s*(declined)|[.,]|$)`, "i").exec(text);
  if (!m) return null;
  return {
    team: normalizeTeam(m[1].toUpperCase()),
    label: m[2] ? m[2].replace(/\s+/g, " ") : null,
    name: m[3].trim(),
    yards: m[4] ? Number(m[4]) : null,
    declined: !!m[5],
    noPlay: /no play/i.test(text),
  };
}

/** A call reviewed: "Buffalo challenged the pass completion ruling, and the play was REVERSED." — by whom (the booth, or
 * a team), and what came of it. */
const REVIEW =
  /(?:^|(?<=[.)]\s*))\(?\s*(?:The\s+)?(?:(Replay\s+(?:Official|Assistant))|([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z0-9]*)*))\s+(?:challenged|reviewed)\b[\s\S]*?\b(REVERSED|Reversed|UPHELD|Upheld|CONFIRMED|Confirmed|stands)\b\.?\)?/;

/** Where a touchdown's try starts in its line, tacked on after it ("... TOUCHDOWN. T.Bass extra point is GOOD."). */
const TRY = new RegExp(String.raw`TWO-POINT CONVERSION ATTEMPT|${NAME}\s+extra point is`, "i");

/**
 * What a play was, from ESPN's line for it (and the scoreboard's shorter one: "J.Waddle 20 yard pass from
 * T.Tagovailoa"); null for one there's nothing to act out. What's acted out right after it, `after`: a touchdown's try,
 * or — a review reversing the call — the play as it stands.
 */
export function sceneFor(play: GamePlay, teams: [home: string, away: string]): PlayScene | null {
  const review = REVIEW.exec(play.text);
  if (review) {
    const before = play.text.slice(0, review.index).trim();
    const rest = play.text
      .slice(review.index + review[0].length)
      .replace(/^\s*The ruling on the field (?:stands|is confirmed)\.?/i, "")
      .trim();
    const booth = !!review[1] || !review[2];
    const reversed = /reversed/i.test(review[3]);
    if (!reversed) {
      const stood = sceneFor({ ...play, text: `${before} ${rest}`.trim() }, teams);
      return stood && { ...stood, review: { booth, reversed, called: true } };
    }
    const called = before ? sceneFor({ ...play, text: before }, teams) : null;
    const stands = rest ? sceneFor({ ...play, text: rest }, teams) : null;
    const after = stands && { ...stands, review: { booth, reversed, called: false } };
    return called ? { ...called, review: { booth, reversed, called: true }, after } : after;
  }
  // A touchdown's try, acted out once it's in.
  const at = play.text.search(TRY);
  if (at > 0) {
    const scored = sceneFor({ ...play, text: play.text.slice(0, at).trim() }, teams);
    const attempt = sceneFor({ ...play, text: play.text.slice(at).trim(), downDistance: null, yardsToEndzone: undefined }, teams);
    return scored ? { ...scored, after: attempt } : attempt;
  }
  const raw = play.text;
  const offense = play.offense ?? teams[0];
  const defense = teams[0] === offense ? teams[1] : teams[0];
  const penalty = penaltyOf(raw);
  // A two-point try is acted out from the 2, the try's own words read like any play's.
  const tryMatch = /^\s*TWO-POINT CONVERSION ATTEMPT\.\s*(.*)$/i.exec(raw);
  const text = tryMatch ? tryMatch[1] : raw;
  const action = playAction(text);
  const touchdown = !tryMatch && /TOUCHDOWN/i.test(text) && !/(nullified|reversed)/i.test(text);
  const recovered = new RegExp(String.raw`RECOVERED by ([A-Z]{2,3})-${NAME}`).exec(text);
  const base: PlayScene = {
    kind: "run",
    offense,
    defense,
    yards: play.yards,
    air: 0,
    lane: 0,
    touchdown,
    good: false,
    blocked: false,
    fumbleLost: /FUMBLES/i.test(text) && !!recovered && normalizeTeam(recovered[1]) !== offense,
    passer: null,
    target: null,
    runner: null,
    defender: null,
    kicker: null,
    returner: null,
    scramble: false,
    toGoal: tryMatch ? 2 : (play.yardsToEndzone ?? null),
    toGo: tryMatch ? null : toGoOf(play.downDistance),
    conversion: tryMatch ? { good: /SUCCEEDS/i.test(text) } : null,
    safety: /\bSAFETY\b/i.test(text),
    kickResult: null,
    onside: false,
    recoveredBy: null,
    penalty,
    fumble: fumbleOf(text, offense),
    lateral: null,
    review: null,
    after: null,
  };
  const scene = readPlay(text, action, base, play);
  if (scene) return scene;
  // Nothing played but a flag: the flag, thrown before the snap.
  return penalty ? { ...base, kind: "penalty", touchdown: false, yards: 0 } : null;
}

function readPlay(raw: string, action: string, base: PlayScene, play: GamePlay): PlayScene | null {
  const touchdown = base.touchdown;
  const good = base.conversion?.good ?? false;
  let m: RegExpExecArray | null;

  // Kicks.
  if ((m = new RegExp(String.raw`^${NAME}\s+(\d+)\s+yard field goal is (GOOD|No Good|BLOCKED)`, "i").exec(action))) {
    const result = m[3].toUpperCase();
    const distance = Number(m[2]);
    // Kicked from 7 yards behind the line, the posts 10 past the goal line.
    const toGoal = base.toGoal ?? Math.max(0, distance - 17);
    return { ...base, kind: "fieldGoal", kicker: m[1], yards: distance, good: result === "GOOD", blocked: result === "BLOCKED", touchdown: false, toGoal, toGo: null };
  }
  if ((m = new RegExp(String.raw`^${NAME}\s+extra point is (GOOD|No Good|BLOCKED)`, "i").exec(action))) {
    const result = m[2].toUpperCase();
    return { ...base, kind: "extraPoint", kicker: m[1], yards: 33, good: result === "GOOD", blocked: result === "BLOCKED", touchdown: false, toGoal: 15, toGo: null };
  }
  // Punted or kicked off: who kicked it how far, and who caught it (on a fair catch, or running it back, and how far).
  // (An onside kick's said either way: "kicks onside 11 yards", "onside kick 11 yards".)
  if ((m = new RegExp(String.raw`^${NAME}\s+(punts|kicks(?:\s+onside)?|onside\s+kicks?)\s+(-?\d+)\s+yards?`, "i").exec(action))) {
    const rest = action.slice(m.index + m[0].length);
    const fair = new RegExp(String.raw`fair catch by\s+(?:[A-Z]{2,3}-)?${NAME}`, "i").exec(rest);
    const ran = new RegExp(String.raw`\.\s*${NAME}\s+(?:to|pushed|ran|for)\b`).exec(rest);
    const punt = m[2].toLowerCase() === "punts";
    const kickResult = /touchback/i.test(rest)
      ? "TOUCHBACK"
      : fair
        ? "FAIR CATCH"
        : /downed by/i.test(rest)
          ? "DOWNED"
          : /out of bounds/i.test(rest) && !ran
            ? "OUT OF BOUNDS"
            : null;
    return {
      ...base,
      kind: punt ? "punt" : "kickoff",
      // Kicked off from the kicking team's 35.
      toGoal: punt ? base.toGoal : 65,
      toGo: null,
      kicker: m[1],
      yards: Number(m[3]),
      returner: fair ? fair[1] : ran ? ran[1] : null,
      air: ran ? (gainAfter(rest, ran.index) ?? 0) : 0,
      defender: ran && !touchdown ? inParens(raw, raw.lastIndexOf(ran[1])) : null,
      kickResult,
      onside: /onside/i.test(raw),
      recoveredBy: ((rec) => (rec ? { team: normalizeTeam(rec[1].toUpperCase()), label: rec[2] } : null))(
        new RegExp(String.raw`RECOVERED by ([A-Z]{2,3})-${NAME}`, "i").exec(rest)
      ),
    };
  }
  if ((m = new RegExp(String.raw`^${NAME}\s+punt is BLOCKED by\s+${NAME}`, "i").exec(action))) {
    return { ...base, kind: "punt", kicker: m[1], defender: m[2], yards: 0, blocked: true, toGo: null, touchdown };
  }

  // A kneel, a spike, a snap that got away.
  if ((m = new RegExp(String.raw`^${NAME}\s+kneels`, "i").exec(action))) {
    return { ...base, kind: "kneel", passer: m[1], yards: Math.min(0, gainAfter(action, m.index) ?? -1), touchdown: false };
  }
  if ((m = new RegExp(String.raw`^${NAME}\s+spiked the ball`, "i").exec(action))) {
    return { ...base, kind: "spike", passer: m[1], yards: 0, touchdown: false };
  }
  if ((m = new RegExp(String.raw`^${NAME}\s+FUMBLES\s+\(?Aborted`, "i").exec(raw.replace(/^\s*\([^)]*\)\s*/, "")))) {
    return { ...base, kind: "fumble", passer: m[1], defender: recoveredBy(raw), yards: recoveredGain(raw, base.offense) ?? play.yards, touchdown };
  }

  // Picked off.
  if ((m = new RegExp(String.raw`^${NAME}\s+pass\s+(?:incomplete\s+)?${DIR}(?:intended for\s+${NAME}\s+)?INTERCEPTED by\s+(?:[A-Z]{2,3}-)?${NAME}`, "i").exec(action))) {
    const after = action.slice(m.index + m[0].length);
    return {
      ...base,
      kind: "interception",
      passer: m[1],
      target: m[4] ?? null,
      defender: m[5],
      air: m[2] === "deep" ? 28 : m[2] === "short" ? 8 : 15,
      lane: laneOf(m[3]),
      yards: Math.max(0, gainAfter(after) ?? 0),
      touchdown,
    };
  }
  // Thrown: a try's "pass to X is complete / incomplete" too.
  if ((m = new RegExp(String.raw`^${NAME}\s+pass\s+(?:incomplete\s+${DIR}(?:to\s+${NAME})?|${DIR}to\s+${NAME}\s+is\s+incomplete)`, "i").exec(action))) {
    return {
      ...base,
      kind: "incomplete",
      passer: m[1],
      target: m[4] ?? m[7] ?? null,
      air: base.conversion ? 3 : m[2] === "deep" || m[5] === "deep" ? 28 : m[2] === "short" || m[5] === "short" ? 7 : 13,
      lane: laneOf(m[3] ?? m[6]),
      yards: 0,
      touchdown: false,
      defender: inParens(raw, raw.search(/incomplete/i)),
    };
  }
  if ((m = new RegExp(String.raw`^${NAME}\s+pass\s+${DIR}to\s+${NAME}`, "i").exec(action))) {
    const yards = base.conversion ? (good ? 3 : 1) : (gainAfter(action, m.index) ?? play.yards);
    const lateral = lateralOf(action);
    return {
      ...base,
      kind: "pass",
      passer: m[1],
      target: m[4],
      yards: yards + (lateral?.more ?? 0),
      lateral: lateral && { to: lateral.to, at: yards },
      air: base.conversion ? yards : airYards(yards, m[2]),
      lane: laneOf(m[3]),
      defender: touchdown || good ? null : inParens(raw, raw.indexOf(" pass ")),
    };
  }
  // The scoreboard's own shorthand for a scoring catch: "J.Waddle 20 yard pass from T.Tagovailoa".
  if ((m = new RegExp(String.raw`^${NAME}\s+(\d+)\s+yard pass from\s+${NAME}`, "i").exec(action))) {
    const yards = Number(m[2]);
    return { ...base, kind: "pass", passer: m[3], target: m[1], yards, air: airYards(yards, undefined), touchdown: true };
  }
  // Sacked.
  if ((m = new RegExp(String.raw`^${NAME}\s+sacked\b`, "i").exec(action))) {
    const lost = gainAfter(action, m.index) ?? play.yards;
    return { ...base, kind: "sack", passer: m[1], yards: Math.min(0, lost), defender: inParens(raw, raw.search(/sacked/i)), touchdown: false };
  }
  // Run: "J.Cook up the middle for 3 yards", "J.Allen scrambles right end", the scoreboard's "J.Cook 3 yard run",
  // a try's "J.Cook rushes up the middle".
  if ((m = new RegExp(String.raw`^${NAME}\s+(\d+)\s+yard run`, "i").exec(action))) {
    return { ...base, kind: "run", runner: m[1], yards: Number(m[2]), touchdown: true };
  }
  if (
    (m = new RegExp(String.raw`^${NAME}\s+(scrambles\s+|rushes\s+)?(?:(?:(left|right)\s+(?:end|tackle|guard))|up the middle|(?:to|for|pushed|ran)\b)`, "i").exec(action))
  ) {
    const yards = base.conversion ? (good ? 3 : 1) : (gainAfter(action, m.index) ?? play.yards);
    const lateral = lateralOf(action);
    return {
      ...base,
      kind: "run",
      runner: m[1],
      scramble: !!m[2] && /scrambles/i.test(m[2]),
      yards: yards + (lateral?.more ?? 0),
      lateral: lateral && { to: lateral.to, at: yards },
      lane: laneOf(m[3]),
      defender: touchdown || good ? null : inParens(raw),
    };
  }
  return null;
}

/** How far a loose snap went, from where it got away to where it was fallen on — "FUMBLES (Aborted) at KC 30,
 * RECOVERED by BUF-G.Rousseau at KC 28": -2 — for `offense`; null when the line doesn't say both. */
function recoveredGain(text: string, offense: string): number | null {
  const spot = String.raw`([A-Z]{2,3})\s+(\d{1,2})`;
  const lost = new RegExp(String.raw`FUMBLES\s*\(Aborted\)\s*at\s+${spot}`, "i").exec(text);
  const found = new RegExp(String.raw`RECOVERED by [A-Z]{2,3}-${NAME}\s+at\s+${spot}`).exec(text);
  if (!lost || !found) return null;
  // How far from the goal line the offense is going for: its own side, 100 less the yard line.
  const toGoal = (team: string, yard: number) => (normalizeTeam(team) === offense ? 100 - yard : yard);
  return toGoal(lost[1], Number(lost[2])) - toGoal(found[2], Number(found[3]));
}

/** Who fell on a loose ball: "RECOVERED by BUF-J.Cook". */
function recoveredBy(text: string): string | null {
  const m = new RegExp(String.raw`RECOVERED by [A-Z]{2,3}-${NAME}`).exec(text);
  return m ? m[1] : null;
}

/**
 * A play in a few words, for when no one in it did anything to count (see play-lines' playAction) or there was a
 * flag: the flag's what and how far ("Offensive Holding · 10 yards", "· declined", "· no play"); otherwise what the
 * play was ("Kneel", "48 yard punt · fair catch", "Onside kick · recovered by KC") — or, failing that, the first
 * sentence of ESPN's own line.
 */
export function playSummary(play: GamePlay, teams: [home: string, away: string]): string {
  const pen = penaltyOf(play.text);
  if (pen) return [pen.name, pen.declined ? "declined" : pen.yards ? `${pen.yards} yards` : null, pen.noPlay && !pen.declined ? "no play" : null].filter(Boolean).join(" · ");
  const s = sceneFor(play, teams);
  const lower = (text: string | null | undefined) => text?.toLowerCase() ?? null;
  const parts = (...bits: (string | null | undefined | false)[]) => bits.filter(Boolean).join(" · ");
  const back = (scene: PlayScene) => (scene.returner && scene.air ? `${scene.air} yard return` : null);
  switch (s?.kind) {
    case "kneel":
      return "Kneel";
    case "spike":
      return "Spike";
    case "punt":
      return s.blocked ? "Blocked punt" : parts(`${s.yards} yard punt`, lower(s.kickResult), back(s));
    case "kickoff":
      return s.onside
        ? parts("Onside kick", s.recoveredBy ? `recovered by ${s.recoveredBy.team}` : lower(s.kickResult))
        : parts(`${s.yards} yard kickoff`, lower(s.kickResult), back(s));
    case "fieldGoal":
      return `${s.yards} yard FG ${s.blocked ? "blocked" : s.good ? "good" : "no good"}`;
    case "extraPoint":
      return `Extra point ${s.blocked ? "blocked" : s.good ? "good" : "no good"}`;
    case "fumble":
      return parts("Fumbled snap", s.fumbleLost && "lost");
    case "sack":
      return `Sack · ${s.yards} yards`;
    case "run":
      return `${s.yards} yard run`;
    case "pass":
      return `${s.yards} yard pass`;
    case "incomplete":
      return "Incomplete pass";
    case "interception":
      return "Interception";
  }
  // ESPN's own words, to the end of the first sentence ("J.Allen"'s dot isn't one).
  const clean = cleanPlayText(play.text);
  return clean.match(/^.*?[a-z0-9)]\.(?=\s|$)/)?.[0] ?? clean;
}
