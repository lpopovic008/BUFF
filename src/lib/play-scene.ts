// A play acted out by pixel players on the room's floor (see FloorPlay): ESPN's line for it read for what happened
// — a pass, a run, a sack, a kick, a kneel, a flag — and who did it, then staged as a little play in yards: who
// stands where, who runs where and when, where the ball goes, and what's written on the ground. The offense always
// drives left to right; the whole play is set in the middle of the field, from where it starts on the left to where
// it ends on the right, the farther apart the bigger the play.

import { normalizeTeam } from "./nfl-schedule";
import { GamePlay, playAction, SHORT_NAME } from "./play-by-play";

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
  penalty: Penalty | null;
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

/**
 * What a play was, from ESPN's line for it (and the scoreboard's shorter one: "J.Waddle 20 yard pass from
 * T.Tagovailoa"); null for one there's nothing to act out.
 */
export function sceneFor(play: GamePlay, teams: [home: string, away: string]): PlayScene | null {
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
    penalty,
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
  if ((m = new RegExp(String.raw`^${NAME}\s+(punts|kicks|onside kick)\s+(-?\d+)\s+yards?`, "i").exec(action))) {
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
    return { ...base, kind: "fumble", passer: m[1], defender: recoveredBy(raw), yards: play.yards, touchdown };
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
    return {
      ...base,
      kind: "pass",
      passer: m[1],
      target: m[4],
      yards,
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
    return {
      ...base,
      kind: "run",
      runner: m[1],
      scramble: !!m[2] && /scrambles/i.test(m[2]),
      yards,
      lane: laneOf(m[3]),
      defender: touchdown || good ? null : inParens(raw),
    };
  }
  return null;
}

/** Who fell on a loose ball: "RECOVERED by BUF-J.Cook". */
function recoveredBy(text: string): string | null {
  const m = new RegExp(String.raw`RECOVERED by [A-Z]{2,3}-${NAME}`).exec(text);
  return m ? m[1] : null;
}

/** How a pixel player is standing: still, running, down on the ground, jumping for joy, throwing, kicking, on a knee. */
export type Pose = "stand" | "run" | "down" | "jump" | "throw" | "kick" | "kneel";

/** A player's place at a moment (yards: along the field, across it — toward you, positive), and how they're standing from then. */
export interface Key {
  t: number;
  x: number;
  z: number;
  pose: Pose;
}

export type Role = "qb" | "target" | "runner" | "defender" | "kicker" | "returner" | "lineman";

export interface StageActor {
  role: Role;
  team: string;
  /** ESPN's shorthand for them; null for one the play doesn't name (a running play's quarterback, a defender). */
  label: string | null;
  keys: Key[];
}

/** The ball: held by someone (by their index), in the air between two points (yards, height in yards), or lying still. */
export type BallSpan =
  | { from: number; to: number; by: number }
  | { from: number; to: number; arc: { a: [number, number, number]; b: [number, number, number]; apex: number } }
  | { from: number; to: number; at: [number, number] };

/** Something written on the ground (a gain), standing up over the field (a word), or floating up off a player (+1). */
export interface Mark {
  t: number;
  kind: "yards" | "word" | "plus";
  x: number;
  z: number;
  text: string;
  /** Who it floats up off (plus). */
  by?: number;
  /** A word's line, counting up from the first (several at once stack). */
  row?: number;
  /** Good news (green), or not. */
  tone?: "good";
}

export interface Stage {
  actors: StageActor[];
  ball: BallSpan[];
  marks: Mark[];
  /** The line of scrimmage, and where the play ended (from when). */
  los: number;
  /** How far the line of scrimmage is from the goal line on the right, when known (see PlayScene). */
  toGoal: number | null;
  /** Where the line to gain is (a first down), when there's one short of the goal line. */
  firstDown: number | null;
  /** Half how far it reaches along the field, from where anyone (or the ball) starts to where anyone ends. */
  reach: number;
  end: { x: number; t: number } | null;
  /** A kick's goalposts, along the field. */
  posts: number | null;
  /** A penalty flag: thrown from `from` when, landing at `to` (yards along, across). */
  flag: { t: number; from: [number, number]; to: [number, number] } | null;
  /** Where the next play's snapped from, as near as can be told (where this one ended; back where it began after an
   * incompletion; moved off a flag's yards), and the team that had the ball on this one. */
  next: number;
  offense: string;
  /** How long it all takes, the ending held a moment (s). */
  length: number;
}

// When the ball's snapped, how fast a runner goes (yards a second — far faster than life, so it reads at a glance),
// and how long a quarterback takes to drop back.
const SNAP = 0.6;
const SPEED = 14;
const DROP = 0.55;
const HOLD = 1.7;
/** How far from where he makes his play a defender starts out (yards). */
const CLOSE = 2;
/** The deepest into the end zone a pass is caught, or falls (yards). */
const END_ZONE_DEPTH = 5;

const key = (t: number, x: number, z: number, pose: Pose): Key => ({ t, x, z, pose });

/** A defender's start: `CLOSE` yards from where he makes his play (`x`, `z`), ahead of it and a little to the far side. */
const near = (x: number, z: number, side: number): [number, number] => [x + CLOSE * 0.8, z - CLOSE * 0.6 * side];

/** A scene as a play on the floor: who's where when, the ball's flight, what's written — centered on the field. */
export function stageFor(scene: PlayScene): Stage {
  const { offense, defense } = scene;
  const actors: StageActor[] = [];
  const ball: BallSpan[] = [];
  const marks: Mark[] = [];
  const add = (role: Role, team: string, label: string | null, keys: Key[]) => actors.push({ role, team, label, keys }) - 1;
  let end: Stage["end"] = null;
  let posts: number | null = null;
  let flag: Stage["flag"] = null;
  let length: number;
  // The line of scrimmage, along the field (a kick's in front of where it's kicked from).
  let los = 0;
  const s = scene.lane || 1;
  // As deep into the end zone as a pass may go.
  const deepest = scene.toGoal !== null ? scene.toGoal + END_ZONE_DEPTH : Infinity;
  const word = (t: number, x: number, text: string, tone?: "good") => marks.push({ t, kind: "word", x, z: 13, text, tone });

  switch (scene.kind) {
    case "pass":
    case "incomplete":
    case "interception": {
      const caught = scene.kind === "pass";
      const air = Math.min(scene.air, deepest);
      const catchZ = scene.lane * 9;
      const startZ = scene.lane === 0 ? -14 : scene.lane * 17;
      const dropX = scene.conversion ? -4 : -6;
      const flight = 0.35 + Math.hypot(air - dropX, catchZ) / 45;
      const route = Math.max(0.8, Math.hypot(air, catchZ - startZ) / SPEED);
      const tc = Math.max(SNAP + route, SNAP + DROP + 0.25 + flight);
      const tt = tc - flight;
      const apex = 2 + Math.hypot(air - dropX, catchZ) * 0.12;
      const qb = add("qb", offense, scene.passer, [
        key(0, -1, 0, "stand"),
        key(SNAP, -1, 0, "run"),
        key(SNAP + DROP, dropX, 0, "stand"),
        key(tt - 0.15, dropX, 0, "throw"),
        key(tt + 0.25, dropX, 0, "stand"),
      ]);
      const targetKeys = [key(0, 0, startZ, "stand"), key(SNAP, 0, startZ, "run")];
      const target = add("target", offense, scene.target, targetKeys);
      ball.push({ from: 0, to: tt, by: qb });
      if (caught) {
        const yac = scene.yards - air;
        const te = tc + Math.max(0.3, Math.abs(yac) / SPEED);
        const endZ = catchZ * 0.6;
        const scored = scene.touchdown || !!scene.conversion?.good;
        targetKeys.push(key(tc, air, catchZ, "run"), key(te, scene.yards, endZ, scored ? "jump" : "down"));
        ball.push({ from: tt, to: tc, arc: { a: [dropX, 0, 2], b: [air, catchZ, 1.6], apex } });
        ball.push({ from: tc, to: Infinity, by: target });
        const [dx, dz] = near(scene.yards, endZ, s);
        add(
          "defender",
          defense,
          scene.defender,
          scored
            ? [key(0, dx, dz, "stand"), key(SNAP, dx, dz, "run"), key(te, scene.yards - 1.5, endZ - 2 * s, "stand")]
            : [key(0, dx, dz, "stand"), key(tc, dx, dz, "run"), key(te, scene.yards + 0.7, endZ - 0.6 * s, "down")]
        );
        marks.push({ t: tc, kind: "plus", x: air, z: catchZ, text: "+1", by: target });
        marks.push({ t: te, kind: "yards", x: scene.yards, z: endZ + 8, text: String(scene.yards) });
        if (scene.touchdown) word(te, scene.yards / 2, "TOUCHDOWN", "good");
        if (scene.fumbleLost) word(te + 0.3, scene.yards / 2, "FUMBLE");
        end = { x: scene.yards, t: te };
        length = te + HOLD + (scored ? 0.4 : 0);
      } else if (scene.kind === "incomplete") {
        targetKeys.push(key(tc, air, catchZ, "stand"));
        const falls = Math.min(air + 2.5, deepest);
        ball.push({ from: tt, to: tc + 0.1, arc: { a: [dropX, 0, 2], b: [falls, catchZ, 0], apex } });
        ball.push({ from: tc + 0.1, to: Infinity, at: [Math.min(falls + 0.5, deepest), catchZ] });
        const [dx, dz] = near(air, catchZ - 1.5 * s, s);
        add("defender", defense, scene.defender, [
          key(0, dx, dz, "stand"),
          key(tc - 0.35, dx, dz, "run"),
          key(tc, air + 0.8, catchZ - 2 * s, "jump"),
          key(tc + 0.5, air + 0.8, catchZ - 2 * s, "stand"),
        ]);
        if (!scene.conversion) word(tc + 0.25, air / 2, "INCOMPLETE");
        length = tc + HOLD;
        end = { x: air, t: tc + 0.1 };
      } else {
        // Picked off: the defender cuts in front, catches it, and runs it back the other way.
        const back = scene.yards;
        const te = tc + Math.max(0.35, back / SPEED);
        const endZ = catchZ * 0.5;
        targetKeys.push(key(tc, air - 1, catchZ - 1.5 * s, "run"), key(te, air - back - 0.8, endZ + 0.6 * s, scene.touchdown ? "stand" : "down"));
        const [dx, dz] = near(air, catchZ, s);
        const picker = add("defender", defense, scene.defender, [
          key(0, dx, dz, "stand"),
          key(tc - 0.3, dx, dz, "run"),
          key(tc, air + 0.6, catchZ, "run"),
          key(te, air - back, endZ, scene.touchdown ? "jump" : back > 0 ? "down" : "stand"),
        ]);
        ball.push({ from: tt, to: tc, arc: { a: [dropX, 0, 2], b: [air + 0.6, catchZ, 1.6], apex } });
        ball.push({ from: tc, to: Infinity, by: picker });
        word(tc + 0.15, air / 2, "INTERCEPTED");
        if (back > 0) marks.push({ t: te, kind: "yards", x: air - back, z: endZ + 8, text: String(back) });
        if (scene.touchdown) marks.push({ t: te + 0.3, kind: "word", x: air / 2, z: 13, text: "TOUCHDOWN", row: 1 });
        end = { x: air - back, t: te };
        length = te + HOLD;
      }
      break;
    }
    case "run": {
      const endZ = scene.lane * 4;
      const handoff = SNAP + 0.4;
      const scored = scene.touchdown || !!scene.conversion?.good;
      let te: number;
      let runner: number;
      if (scene.scramble) {
        te = SNAP + DROP + 0.3 + Math.max(0.45, Math.abs(scene.yards + 6) / SPEED);
        runner = add("qb", offense, scene.runner, [
          key(0, -1, 0, "stand"),
          key(SNAP, -1, 0, "run"),
          key(SNAP + DROP, -6, 0, "stand"),
          key(SNAP + DROP + 0.3, -6, 0, "run"),
          key(te, scene.yards, endZ, scored ? "jump" : "down"),
        ]);
        ball.push({ from: 0, to: Infinity, by: runner });
      } else {
        te = handoff + Math.max(0.45, Math.abs(scene.yards + 2.5) / SPEED);
        const qb = add("qb", offense, null, [key(0, -1, 0, "stand"), key(SNAP, -1, 0, "run"), key(handoff, -2.5, -1, "stand")]);
        runner = add("runner", offense, scene.runner, [
          key(0, -6, 0, "stand"),
          key(SNAP, -6, 0, "run"),
          key(handoff, -2.5, 0, "run"),
          key(te, scene.yards, endZ, scored ? "jump" : "down"),
        ]);
        ball.push({ from: 0, to: handoff, by: qb }, { from: handoff, to: Infinity, by: runner });
      }
      const [dx, dz] = near(scene.yards, endZ, s);
      add(
        "defender",
        defense,
        scene.defender,
        scored
          ? [key(0, dx, dz, "stand"), key(SNAP + 0.2, dx, dz, "run"), key(te, scene.yards - 1.5, endZ - 2, "stand")]
          : [key(0, dx, dz, "stand"), key(te - 0.25, dx, dz, "run"), key(te, scene.yards + 0.7, endZ - 0.5, "down")]
      );
      marks.push({ t: te, kind: "yards", x: scene.yards, z: endZ + 8, text: String(scene.yards) });
      if (scene.touchdown) word(te, scene.yards / 2, "TOUCHDOWN", "good");
      if (scene.fumbleLost) word(te + 0.3, scene.yards / 2, "FUMBLE");
      end = { x: scene.yards, t: te };
      length = te + HOLD + (scored ? 0.4 : 0);
      break;
    }
    case "sack": {
      const spot = scene.yards;
      const dropX = Math.min(-4, spot + 1);
      const te = SNAP + DROP + 0.75;
      const qb = add("qb", offense, scene.passer, [
        key(0, -1, 0, "stand"),
        key(SNAP, -1, 0, "run"),
        key(SNAP + DROP, dropX, 0, "stand"),
        key(te - 0.2, dropX, 0, "run"),
        key(te, spot, 0.5, "down"),
      ]);
      const [dx, dz] = near(spot, 0.5, -1);
      add("defender", defense, scene.defender, [key(0, dx, dz, "stand"), key(te - 0.35, dx, dz, "run"), key(te, spot + 0.6, 1.3, "down")]);
      ball.push({ from: 0, to: Infinity, by: qb });
      word(te, spot / 2, "SACK");
      marks.push({ t: te, kind: "yards", x: spot, z: 9, text: String(spot) });
      end = { x: spot, t: te };
      length = te + HOLD;
      break;
    }
    case "kneel": {
      // Under center, the snap, and down on a knee.
      const te = SNAP + 0.35;
      const qb = add("qb", offense, scene.passer, [key(0, -1, 0, "stand"), key(SNAP, -1, 0, "run"), key(te, scene.yards - 0.5, 0, "kneel")]);
      add("lineman", offense, null, [key(0, 0, 1.5, "stand")]);
      add("defender", defense, null, [key(0, 1.8, -1.2, "stand")]);
      ball.push({ from: 0, to: Infinity, by: qb });
      word(te + 0.1, 0, "KNEEL");
      end = { x: scene.yards, t: te };
      length = te + HOLD;
      break;
    }
    case "spike": {
      // Under center, the snap, and straight into the ground to stop the clock.
      const tt = SNAP + 0.3;
      const qb = add("qb", offense, scene.passer, [key(0, -1, 0, "stand"), key(SNAP, -1, 0, "run"), key(tt - 0.1, -1.6, 0, "throw"), key(tt + 0.3, -1.6, 0, "stand")]);
      add("lineman", offense, null, [key(0, 0, 1.5, "stand")]);
      add("defender", defense, null, [key(0, 1.8, -1.2, "stand")]);
      ball.push({ from: 0, to: tt, by: qb }, { from: tt, to: tt + 0.15, arc: { a: [-1.1, 0.3, 2], b: [-0.8, 0.5, 0], apex: 0.2 } }, { from: tt + 0.15, to: tt + 0.4, arc: { a: [-0.8, 0.5, 0], b: [0.4, 0.8, 0], apex: 0.8 } }, { from: tt + 0.4, to: Infinity, at: [0.6, 0.8] });
      word(tt + 0.2, 0, "SPIKE");
      length = tt + HOLD;
      break;
    }
    case "fumble": {
      // The snap gets away from him; whoever falls on it.
      const tf = SNAP + 0.25;
      add("qb", offense, scene.passer, [key(0, -4, 0, "stand"), key(tf, -4, 0, "stand"), key(tf + 0.3, -4.6, 0.4, "run"), key(tf + 0.55, -4.6, 0.4, "stand")]);
      const loose: [number, number] = [-5.5, 1.2];
      const [dx, dz] = near(loose[0], loose[1], -1);
      const diver = add("defender", scene.fumbleLost ? defense : offense, scene.defender, [key(0, dx, dz, "stand"), key(tf + 0.1, dx, dz, "run"), key(tf + 0.6, loose[0] + 0.4, loose[1], "down")]);
      ball.push(
        { from: 0, to: SNAP, at: [0, 0] },
        { from: SNAP, to: tf, arc: { a: [0, 0, 0.4], b: [-4, 0, 1.6], apex: 0.6 } },
        { from: tf, to: tf + 0.45, arc: { a: [-4, 0, 1.6], b: loose.concat(0) as [number, number, number], apex: 0.6 } },
        { from: tf + 0.45, to: tf + 0.6, at: loose },
        { from: tf + 0.6, to: Infinity, by: diver }
      );
      word(tf + 0.3, -2, "FUMBLE");
      end = { x: loose[0], t: tf + 0.6 };
      length = tf + 0.6 + HOLD;
      break;
    }
    case "fieldGoal":
    case "extraPoint": {
      const distance = scene.yards;
      const tk = SNAP + 0.45;
      const flight = scene.blocked ? 0.5 : 0.9 + distance / 70;
      // Kicked from where it was set down — as far behind the line as makes its length, the posts on the end line.
      los = scene.toGoal !== null ? Math.min(10, Math.max(5, distance - 10 - scene.toGoal)) : 7;
      posts = distance;
      add("kicker", offense, scene.kicker, [
        key(0, -3, -2.5, "stand"),
        key(SNAP, -3, -2.5, "run"),
        key(tk, -0.6, -0.4, "kick"),
        key(tk + 0.35, -0.6, -0.4, "stand"),
      ]);
      ball.push({ from: 0, to: tk, at: [0, 0] });
      if (scene.blocked) {
        ball.push({ from: tk, to: tk + flight, arc: { a: [0, 0, 0.3], b: [5, 3, 0], apex: 2 } }, { from: tk + flight, to: Infinity, at: [5.5, 3] });
      } else {
        // Over the bar between the uprights when it's good, wide when it isn't, and down beyond.
        const wide = scene.good ? 0 : 7;
        ball.push(
          { from: tk, to: tk + flight, arc: { a: [0, 0, 0.3], b: [distance + 6, wide, 0], apex: Math.max(9, distance * 0.28) } },
          { from: tk + flight, to: Infinity, at: [distance + 6, wide] }
        );
      }
      const result = scene.blocked ? "BLOCKED" : scene.good ? "GOOD" : "NO GOOD";
      word(tk + flight * 0.8, distance / 2, result, scene.good && !scene.blocked ? "good" : undefined);
      marks.push({ t: tk + flight * 0.8, kind: "yards", x: distance, z: 6, text: String(distance) });
      length = tk + flight + HOLD;
      break;
    }
    case "punt":
    case "kickoff": {
      const punt = scene.kind === "punt";
      const kickingTeam = punt ? offense : defense;
      const receivingTeam = punt ? defense : offense;
      const from = punt ? -14 : 0;
      const tk = punt ? SNAP + 0.55 : SNAP + 0.45;
      if (scene.blocked) {
        // Blocked: the rusher gets a hand on it right off the punter's foot.
        const kicker = add("kicker", kickingTeam, scene.kicker, [key(0, from, 0, "stand"), key(tk, from, 0, "kick"), key(tk + 0.35, from, 0, "stand")]);
        add("defender", receivingTeam, scene.defender, [key(0, from + CLOSE, -1.2, "stand"), key(tk - 0.3, from + CLOSE, -1.2, "run"), key(tk, from + 1, -0.5, "jump"), key(tk + 0.5, from + 1, -0.5, "stand")]);
        ball.push(
          { from: SNAP, to: tk - 0.1, arc: { a: [0, 0, 0.4], b: [from, 0, 1.2], apex: 1.6 } },
          { from: tk - 0.1, to: tk, by: kicker },
          { from: tk, to: tk + 0.6, arc: { a: [from, 0, 1], b: [from - 4, 3, 0], apex: 2 } },
          { from: tk + 0.6, to: Infinity, at: [from - 4, 3] }
        );
        word(tk + 0.1, from, "BLOCKED");
        length = tk + 0.6 + HOLD;
        break;
      }
      const land = from + scene.yards;
      const flight = (scene.onside ? 0.5 : 1.1) + scene.yards / 60;
      const tc = tk + flight;
      const kicker = add(
        "kicker",
        kickingTeam,
        scene.kicker,
        punt
          ? [key(0, from, 0, "stand"), key(tk, from, 0, "kick"), key(tk + 0.35, from, 0, "stand")]
          : [key(0, -4, -2, "stand"), key(SNAP, -4, -2, "run"), key(tk, -0.6, -0.4, "kick"), key(tk + 0.35, -0.6, -0.4, "stand")]
      );
      if (punt) ball.push({ from: SNAP, to: tk - 0.1, arc: { a: [0, 0, 0.4], b: [from, 0, 1.2], apex: 1.6 } }, { from: tk - 0.1, to: tk, by: kicker });
      else ball.push({ from: 0, to: tk, at: [0, 0] });
      const apex = scene.onside ? 1.5 : 9 + scene.yards * 0.15;
      const back = scene.returner ? scene.air : 0;
      const te = tc + (scene.returner ? Math.max(0.35, Math.abs(back) / SPEED) : 0.4);
      if (scene.returner) {
        const fair = scene.kickResult === "FAIR CATCH";
        const ret = add("returner", receivingTeam, scene.returner, [
          key(0, land + 3, 2, "stand"),
          key(tk, land + 3, 2, "run"),
          key(tc, land, 0, fair ? "jump" : "run"),
          key(te, land - back, 2, scene.touchdown ? "jump" : back > 0 ? "down" : "stand"),
        ]);
        ball.push({ from: tk, to: tc, arc: { a: [from, 0, 1.2], b: [land, 0, 1.6], apex } }, { from: tc, to: Infinity, by: ret });
        if (back > 0 && !scene.touchdown) {
          const [dx, dz] = near(land - back, 2, -1);
          add("defender", kickingTeam, scene.defender, [key(0, dx - CLOSE * 1.6, dz, "stand"), key(te - 0.3, dx - CLOSE * 1.6, dz, "run"), key(te, land - back - 0.7, 1.5, "down")]);
        }
        if (back) marks.push({ t: te, kind: "yards", x: land - back, z: 6, text: String(back) });
        end = { x: land - back, t: te };
      } else {
        ball.push({ from: tk, to: tc, arc: { a: [from, 0, 1.2], b: [land, 0, 0], apex } }, { from: tc, to: Infinity, at: [land + 1, 0] });
      }
      marks.push({ t: tc, kind: "word", x: (from + land) / 2, z: 13, text: scene.onside ? "ONSIDE KICK" : punt ? `PUNT ${scene.yards}` : `KICK ${scene.yards}` });
      if (scene.kickResult) marks.push({ t: tc + 0.2, kind: "word", x: (from + land) / 2, z: 13, text: scene.kickResult, row: 1 });
      if (scene.touchdown) marks.push({ t: te + 0.3, kind: "word", x: (from + land) / 2, z: 13, text: "TOUCHDOWN", row: 1, tone: "good" });
      length = te + HOLD;
      break;
    }
    case "penalty": {
      // No play: the teams set, and the flag's thrown on whoever it's on as he moves.
      const pen = scene.penalty!;
      const onOffense = pen.team === offense;
      const [ox, oz] = onOffense ? [0, -3] : [1.5, 2.5];
      add("qb", offense, null, [key(0, -1, 0, "stand")]);
      add(onOffense ? "defender" : "lineman", onOffense ? defense : offense, null, [key(0, onOffense ? 1.5 : 0, onOffense ? 2.5 : -3, "stand")]);
      add("lineman", pen.team, pen.label, [key(0, ox, oz, "stand"), key(SNAP * 0.7, ox, oz, "run"), key(SNAP * 0.7 + 0.25, onOffense ? ox + 1 : ox - 1.5, oz, "stand")]);
      ball.push({ from: 0, to: Infinity, at: [0, 0] });
      flag = { t: SNAP, from: [ox + 4, -20], to: [onOffense ? ox + 1.5 : ox - 1, oz + 1.5] };
      length = SNAP + 0.6 + HOLD;
      break;
    }
  }

  // A flag on the play: on the field, in the middle of it, by the time it's over.
  const pen = scene.penalty;
  const words = marks.filter((m) => m.kind === "word");
  const lastWord = words.reduce((latest, m) => Math.max(latest, m.t), 0);
  if (pen) {
    const middle = end ? end.x / 2 : 0;
    if (!flag) flag = { t: (end?.t ?? length) * 0.6, from: [middle + 3, -20], to: [middle, 3] };
    const row = Math.max(0, ...words.map((m) => (m.row ?? 0) + 1));
    const t = scene.kind === "penalty" ? flag.t + 0.4 : Math.max(lastWord, flag.t + 0.4);
    marks.push({ t, kind: "word", x: middle, z: 13, text: `FLAG · ${pen.name.toUpperCase()}`, row });
    const after = pen.declined ? "DECLINED" : pen.noPlay && scene.kind !== "penalty" ? "NO PLAY" : pen.yards ? `${pen.yards} YARDS` : null;
    if (after) marks.push({ t: t + 0.3, kind: "word", x: middle, z: 13, text: after, row: row + 1 });
    length = Math.max(length, t + 0.3 + HOLD);
  }
  // A two-point try, good or not; a safety.
  if (scene.conversion) {
    const t = (end?.t ?? length - HOLD) + 0.1;
    word(t, (end?.x ?? 0) / 2, scene.conversion.good ? "2-PT GOOD" : "2-PT NO GOOD", scene.conversion.good ? "good" : undefined);
  }
  if (scene.safety) {
    const row = Math.max(0, ...marks.filter((m) => m.kind === "word").map((m) => (m.row ?? 0) + 1));
    marks.push({ t: (end?.t ?? length - HOLD) + 0.1, kind: "word", x: (end?.x ?? 0) / 2, z: 13, text: "SAFETY", row });
  }

  // Where the next snap is.
  let next = end && scene.kind !== "incomplete" && scene.kind !== "spike" ? end.x : los;
  if (scene.kind === "penalty" && pen) next = los + (pen.team === offense ? -1 : 1) * (pen.yards ?? 0);
  if (scene.toGoal !== null) next = Math.min(scene.toGoal - 1, Math.max(scene.toGoal - 99, next));

  // No one past either end line.
  if (scene.toGoal !== null) {
    const [lo, hi] = [scene.toGoal - 110 + 0.5, scene.toGoal + 10 - 0.5];
    const keep = (x: number) => Math.min(hi, Math.max(lo, x));
    for (const a of actors) for (const k of a.keys) k.x = keep(k.x);
  }

  // Centered on the field: from the farthest left anyone goes to the farthest right.
  const xs = [
    0,
    ...actors.flatMap((a) => a.keys.map((k) => k.x)),
    ...(posts !== null ? [posts] : []),
    ...ball.flatMap((b) => ("arc" in b ? [b.arc.b[0]] : "at" in b ? [b.at[0]] : [])),
  ];
  const shift = -(Math.min(...xs) + Math.max(...xs)) / 2;
  const moved = (x: number) => x + shift;
  return {
    actors: actors.map((a) => ({ ...a, keys: a.keys.map((k) => ({ ...k, x: moved(k.x) })) })),
    ball: ball.map((b) =>
      "arc" in b
        ? { ...b, arc: { ...b.arc, a: [moved(b.arc.a[0]), b.arc.a[1], b.arc.a[2]], b: [moved(b.arc.b[0]), b.arc.b[1], b.arc.b[2]] } }
        : "at" in b
          ? { ...b, at: [moved(b.at[0]), b.at[1]] }
          : b
    ),
    marks: marks.map((m) => ({ ...m, x: moved(m.x) })),
    los: moved(los),
    toGoal: scene.toGoal,
    firstDown: scene.toGo !== null && scene.toGo > 0 && (scene.toGoal === null || scene.toGo < scene.toGoal) ? moved(los + scene.toGo) : null,
    reach: (Math.max(...xs) - Math.min(...xs)) / 2,
    end: end ? { x: moved(end.x), t: end.t } : null,
    posts: posts !== null ? moved(posts) : null,
    flag: flag ? { t: flag.t, from: [moved(flag.from[0]), flag.from[1]], to: [moved(flag.to[0]), flag.to[1]] } : null,
    next: moved(next),
    offense,
    length: length!,
  };
}

/** Where a player is at `t`, and how they're standing. */
export function actorAt(actor: StageActor, t: number): { x: number; z: number; pose: Pose; moving: boolean } {
  const keys = actor.keys;
  if (t <= keys[0].t) return { x: keys[0].x, z: keys[0].z, pose: keys[0].pose, moving: false };
  for (let i = 0; i + 1 < keys.length; i++) {
    const [a, b] = [keys[i], keys[i + 1]];
    if (t < b.t) {
      const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      const moving = a.x !== b.x || a.z !== b.z;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, pose: a.pose, moving };
    }
  }
  const last = keys[keys.length - 1];
  return { x: last.x, z: last.z, pose: last.pose, moving: false };
}

/** Where the ball is at `t` (yards; height in yards) — or who's holding it. */
export function ballAt(stage: Stage, t: number): { x: number; z: number; h: number } | { by: number } | null {
  const span = stage.ball.find((b) => t >= b.from && t < b.to) ?? stage.ball[stage.ball.length - 1];
  if (!span) return null;
  if ("by" in span) return { by: span.by };
  if ("at" in span) return { x: span.at[0], z: span.at[1], h: 0 };
  const f = Math.min(1, Math.max(0, (t - span.from) / Math.max(1e-6, span.to - span.from)));
  const { a, b, apex } = span.arc;
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, h: a[2] + (b[2] - a[2]) * f + 4 * apex * f * (1 - f) };
}

/**
 * Where each of a play's players lines up for the next one, at its line of scrimmage (`stage.next`): the team that had
 * the ball behind it — its quarterback over the ball, the rest back and out wide — and the other across from it.
 */
export function formation(stage: Stage): [number, number][] {
  const line = stage.next;
  const offense: [number, number][] = [
    [line - 1, 0],
    [line - 6, 0],
    [line, -12],
    [line, 2.5],
    [line, -2.5],
  ];
  const defense: [number, number][] = [
    [line + 2, -1.5],
    [line + 2, 2],
    [line + 6, -8],
    [line + 5, 8],
    [line + 9, 0],
  ];
  // The quarterback first to his spot, then the rest as they come.
  const order = stage.actors.map((a, i) => i).sort((a, b) => Number(stage.actors[b].role === "qb") - Number(stage.actors[a].role === "qb"));
  const spots: [number, number][] = new Array(stage.actors.length);
  let [o, d] = [0, 0];
  for (const i of order) {
    const ours = stage.actors[i].team === stage.offense;
    spots[i] = ours ? offense[o++ % offense.length] : defense[d++ % defense.length];
  }
  return spots;
}
