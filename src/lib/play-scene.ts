// A play acted out by pixel players on the room's floor (see FloorPlay): ESPN's line for it read for what happened
// — a pass, a run, a sack, a kick — and who did it, then staged as a little play in yards: who stands where, who
// runs where and when, where the ball goes, and what's written on the ground. The offense always drives left to
// right; the whole play is set in the middle of the field, from where it starts on the left to where it ends on the
// right, the farther apart the bigger the play.

import { GamePlay, playAction, SHORT_NAME } from "./play-by-play";

export type SceneKind = "pass" | "incomplete" | "interception" | "run" | "sack" | "fieldGoal" | "extraPoint" | "punt" | "kickoff";

/** What a play's line says happened, and who did it (ESPN's shorthand for each: "J.Allen"). */
export interface PlayScene {
  kind: SceneKind;
  /** The team with the ball (for a kickoff, the one receiving it), and the other. */
  offense: string;
  defense: string;
  /** A pass's or run's gain (a sack's loss, negative); an interception's return; a kick's length. */
  yards: number;
  /** How far past the line a pass was caught, or thrown. */
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
  /** Who made the play on the other side: the tackler, the sacker, the one who picked it off. */
  defender: string | null;
  kicker: string | null;
  returner: string | null;
  /** The quarterback kept it himself. */
  scramble: boolean;
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

/** "for 12 yards" / "for -3 yards" / "for no gain" after `from`, or null. */
function gainAfter(text: string, from = 0): number | null {
  const m = /for (-?\d+) yards?|for (no gain)/i.exec(text.slice(from));
  if (!m) return null;
  return m[2] ? 0 : Number(m[1]);
}

/**
 * What a play was, from ESPN's line for it (and the scoreboard's shorter one: "J.Waddle 20 yard pass from
 * T.Tagovailoa"); null for one there's nothing to act out (a penalty, a timeout, a two-point try).
 */
export function sceneFor(play: GamePlay, teams: [home: string, away: string]): PlayScene | null {
  const raw = play.text;
  if (/no play|two-point|2-pt|kneels/i.test(raw) && !/field goal|extra point/i.test(raw)) return null;
  const action = playAction(raw);
  const offense = play.offense ?? teams[0];
  const defense = teams[0] === offense ? teams[1] : teams[0];
  const touchdown = /TOUCHDOWN/i.test(raw) && !/(nullified|reversed)/i.test(raw);
  const recovered = /RECOVERED by ([A-Z]{2,3})-/.exec(raw);
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
    fumbleLost: /FUMBLES/i.test(raw) && !!recovered && recovered[1] !== offense,
    passer: null,
    target: null,
    runner: null,
    defender: null,
    kicker: null,
    returner: null,
    scramble: false,
  };
  let m: RegExpExecArray | null;

  // Kicks.
  if ((m = new RegExp(String.raw`^${NAME}\s+(\d+)\s+yard field goal is (GOOD|No Good|BLOCKED)`, "i").exec(action))) {
    const result = m[3].toUpperCase();
    return { ...base, kind: "fieldGoal", kicker: m[1], yards: Number(m[2]), good: result === "GOOD", blocked: result === "BLOCKED", touchdown: false };
  }
  if ((m = new RegExp(String.raw`^${NAME}\s+extra point is (GOOD|No Good|BLOCKED)`, "i").exec(action))) {
    const result = m[2].toUpperCase();
    return { ...base, kind: "extraPoint", kicker: m[1], yards: 33, good: result === "GOOD", blocked: result === "BLOCKED", touchdown: false };
  }
  // Punted or kicked off: who kicked it how far, and who caught it (on a fair catch, or running it back, and how far).
  if ((m = new RegExp(String.raw`^${NAME}\s+(punts|kicks)\s+(-?\d+)\s+yards?`, "i").exec(action))) {
    const rest = action.slice(m.index + m[0].length);
    const fair = new RegExp(String.raw`fair catch by\s+(?:[A-Z]{2,3}-)?${NAME}`, "i").exec(rest);
    const ran = new RegExp(String.raw`\.\s*${NAME}\s+(?:to|pushed|ran|for)\b`).exec(rest);
    const punt = m[2].toLowerCase() === "punts";
    return {
      ...base,
      kind: punt ? "punt" : "kickoff",
      kicker: m[1],
      yards: Number(m[3]),
      returner: fair ? fair[1] : ran ? ran[1] : null,
      air: ran ? (gainAfter(rest, ran.index) ?? 0) : 0,
      defender: ran && !touchdown ? inParens(raw, raw.lastIndexOf(ran[1])) : null,
    };
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
  // Thrown.
  if ((m = new RegExp(String.raw`^${NAME}\s+pass\s+incomplete\s+${DIR}(?:to\s+${NAME})?`, "i").exec(action))) {
    return {
      ...base,
      kind: "incomplete",
      passer: m[1],
      target: m[4] ?? null,
      air: m[2] === "deep" ? 28 : m[2] === "short" ? 7 : 13,
      lane: laneOf(m[3]),
      yards: 0,
      touchdown: false,
      defender: inParens(raw, raw.search(/incomplete/i)),
    };
  }
  if ((m = new RegExp(String.raw`^${NAME}\s+pass\s+${DIR}to\s+${NAME}`, "i").exec(action))) {
    const yards = gainAfter(action, m.index) ?? play.yards;
    return {
      ...base,
      kind: "pass",
      passer: m[1],
      target: m[4],
      yards,
      air: airYards(yards, m[2]),
      lane: laneOf(m[3]),
      defender: touchdown ? null : inParens(raw, raw.indexOf(" pass ")),
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
  // Run: "J.Cook up the middle for 3 yards", "J.Allen scrambles right end", the scoreboard's "J.Cook 3 yard run".
  if ((m = new RegExp(String.raw`^${NAME}\s+(\d+)\s+yard run`, "i").exec(action))) {
    return { ...base, kind: "run", runner: m[1], yards: Number(m[2]), touchdown: true };
  }
  if (
    (m = new RegExp(String.raw`^${NAME}\s+(scrambles\s+)?(?:(?:(left|right)\s+(?:end|tackle|guard))|up the middle|(?:to|for|pushed|ran)\b)`, "i").exec(action))
  ) {
    const yards = gainAfter(action, m.index) ?? play.yards;
    return {
      ...base,
      kind: "run",
      runner: m[1],
      scramble: !!m[2],
      yards,
      lane: laneOf(m[3]),
      defender: touchdown ? null : inParens(raw),
    };
  }
  return null;
}

/** How a pixel player is standing: still, running, down on the ground, jumping for joy, throwing, kicking. */
export type Pose = "stand" | "run" | "down" | "jump" | "throw" | "kick";

/** A player's place at a moment (yards: along the field, across it — toward you, positive), and how they're standing from then. */
export interface Key {
  t: number;
  x: number;
  z: number;
  pose: Pose;
}

export type Role = "qb" | "target" | "runner" | "defender" | "kicker" | "returner";

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

/** Something written on the ground (a gain, a word), or floating up off a player (+1). */
export interface Mark {
  t: number;
  kind: "yards" | "word" | "plus";
  x: number;
  z: number;
  text: string;
  /** Who it floats up off (plus). */
  by?: number;
}

export interface Stage {
  actors: StageActor[];
  ball: BallSpan[];
  marks: Mark[];
  /** The line of scrimmage, and where the play ended (from when). */
  los: number;
  end: { x: number; t: number } | null;
  /** A kick's goalposts, along the field. */
  posts: number | null;
  /** How long it all takes, the ending held a moment (s). */
  length: number;
}

// When the ball's snapped, how fast a runner goes (yards a second — far faster than life, so it reads at a glance),
// and how long a quarterback takes to drop back.
const SNAP = 0.6;
const SPEED = 14;
const DROP = 0.55;
const HOLD = 1.7;

const key = (t: number, x: number, z: number, pose: Pose): Key => ({ t, x, z, pose });

/** A scene as a play on the floor: who's where when, the ball's flight, what's written — centered on the field. */
export function stageFor(scene: PlayScene): Stage {
  const { offense, defense } = scene;
  const actors: StageActor[] = [];
  const ball: BallSpan[] = [];
  const marks: Mark[] = [];
  const add = (role: Role, team: string, label: string | null, keys: Key[]) => actors.push({ role, team, label, keys }) - 1;
  let end: Stage["end"] = null;
  let posts: number | null = null;
  let length: number;
  const s = scene.lane || 1;

  switch (scene.kind) {
    case "pass":
    case "incomplete":
    case "interception": {
      const caught = scene.kind === "pass";
      const air = scene.air;
      const catchZ = scene.lane * 9;
      const startZ = scene.lane === 0 ? -14 : scene.lane * 17;
      const dropX = -6;
      const flight = 0.35 + Math.hypot(air - dropX, catchZ) / 45;
      const route = Math.max(0.8, Math.hypot(air, catchZ - startZ) / SPEED);
      const tc = Math.max(SNAP + route, SNAP + DROP + 0.25 + flight);
      const tt = tc - flight;
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
        targetKeys.push(key(tc, air, catchZ, "run"), key(te, scene.yards, endZ, scene.touchdown ? "jump" : "down"));
        ball.push({ from: tt, to: tc, arc: { a: [dropX, 0, 2], b: [air, catchZ, 1.6], apex: 2 + Math.hypot(air - dropX, catchZ) * 0.12 } });
        ball.push({ from: tc, to: Infinity, by: target });
        add(
          "defender",
          defense,
          scene.defender,
          scene.touchdown
            ? [key(0, air + 7, catchZ - 5 * s, "stand"), key(SNAP, air + 7, catchZ - 5 * s, "run"), key(te, scene.yards - 3, endZ - 3 * s, "stand")]
            : [key(0, air + 7, catchZ - 5 * s, "stand"), key(SNAP, air + 7, catchZ - 5 * s, "run"), key(te, scene.yards + 0.7, endZ - 0.6 * s, "down")]
        );
        marks.push({ t: tc, kind: "plus", x: air, z: catchZ, text: "+1", by: target });
        marks.push({ t: te, kind: "yards", x: scene.yards, z: endZ + 8, text: String(scene.yards) });
        if (scene.touchdown) marks.push({ t: te, kind: "word", x: scene.yards / 2, z: 15, text: "TOUCHDOWN" });
        if (scene.fumbleLost) marks.push({ t: te + 0.3, kind: "word", x: scene.yards / 2, z: 13, text: "FUMBLE" });
        end = { x: scene.yards, t: te };
        length = te + HOLD + (scene.touchdown ? 0.4 : 0);
      } else if (scene.kind === "incomplete") {
        targetKeys.push(key(tc, air, catchZ, "stand"));
        ball.push({ from: tt, to: tc + 0.1, arc: { a: [dropX, 0, 2], b: [air + 2.5, catchZ, 0], apex: 2 + Math.hypot(air - dropX, catchZ) * 0.12 } });
        ball.push({ from: tc + 0.1, to: Infinity, at: [air + 3, catchZ] });
        add("defender", defense, scene.defender, [
          key(0, air + 6, catchZ - 4 * s, "stand"),
          key(SNAP, air + 6, catchZ - 4 * s, "run"),
          key(tc, air + 1.2, catchZ - 3 * s, "jump"),
          key(tc + 0.5, air + 1.2, catchZ - 3 * s, "stand"),
        ]);
        marks.push({ t: tc + 0.25, kind: "word", x: air / 2, z: 13, text: "INCOMPLETE" });
        length = tc + HOLD;
      } else {
        // Picked off: the defender cuts in front, catches it, and runs it back the other way.
        const back = scene.yards;
        const te = tc + Math.max(0.35, back / SPEED);
        const endZ = catchZ * 0.5;
        targetKeys.push(key(tc, air - 1, catchZ - 1.5 * s, "run"), key(te, air - back - 0.8, endZ + 0.6 * s, scene.touchdown ? "stand" : "down"));
        const picker = add("defender", defense, scene.defender, [
          key(0, air + 6, catchZ - 4 * s, "stand"),
          key(SNAP, air + 6, catchZ - 4 * s, "run"),
          key(tc, air + 0.6, catchZ, "run"),
          key(te, air - back, endZ, scene.touchdown ? "jump" : back > 0 ? "down" : "stand"),
        ]);
        ball.push({ from: tt, to: tc, arc: { a: [dropX, 0, 2], b: [air + 0.6, catchZ, 1.6], apex: 2 + Math.hypot(air - dropX, catchZ) * 0.12 } });
        ball.push({ from: tc, to: Infinity, by: picker });
        marks.push({ t: tc + 0.15, kind: "word", x: air / 2, z: 13, text: "INTERCEPTED" });
        if (back > 0) marks.push({ t: te, kind: "yards", x: air - back, z: endZ + 8, text: String(back) });
        if (scene.touchdown) marks.push({ t: te + 0.3, kind: "word", x: air / 2, z: -13, text: "TOUCHDOWN" });
        end = { x: air - back, t: te };
        length = te + HOLD;
      }
      break;
    }
    case "run": {
      const endZ = scene.lane * 4;
      const handoff = SNAP + 0.4;
      let te: number;
      let runner: number;
      if (scene.scramble) {
        te = SNAP + DROP + 0.3 + Math.max(0.45, Math.abs(scene.yards + 6) / SPEED);
        runner = add("qb", offense, scene.runner, [
          key(0, -1, 0, "stand"),
          key(SNAP, -1, 0, "run"),
          key(SNAP + DROP, -6, 0, "stand"),
          key(SNAP + DROP + 0.3, -6, 0, "run"),
          key(te, scene.yards, endZ, scene.touchdown ? "jump" : "down"),
        ]);
        ball.push({ from: 0, to: Infinity, by: runner });
      } else {
        te = handoff + Math.max(0.45, Math.abs(scene.yards + 2.5) / SPEED);
        const qb = add("qb", offense, null, [key(0, -1, 0, "stand"), key(SNAP, -1, 0, "run"), key(handoff, -2.5, -1, "stand")]);
        runner = add("runner", offense, scene.runner, [
          key(0, -6, 0, "stand"),
          key(SNAP, -6, 0, "run"),
          key(handoff, -2.5, 0, "run"),
          key(te, scene.yards, endZ, scene.touchdown ? "jump" : "down"),
        ]);
        ball.push({ from: 0, to: handoff, by: qb }, { from: handoff, to: Infinity, by: runner });
      }
      const startZ = -endZ || -4;
      add(
        "defender",
        defense,
        scene.defender,
        scene.touchdown
          ? [key(0, scene.yards + 6, startZ, "stand"), key(SNAP + 0.2, scene.yards + 6, startZ, "run"), key(te, scene.yards - 3, endZ - 3, "stand")]
          : [key(0, scene.yards + 6, startZ, "stand"), key(SNAP + 0.2, scene.yards + 6, startZ, "run"), key(te, scene.yards + 0.7, endZ - 0.5, "down")]
      );
      marks.push({ t: te, kind: "yards", x: scene.yards, z: endZ + 8, text: String(scene.yards) });
      if (scene.touchdown) marks.push({ t: te, kind: "word", x: scene.yards / 2, z: 13, text: "TOUCHDOWN" });
      if (scene.fumbleLost) marks.push({ t: te + 0.3, kind: "word", x: scene.yards / 2, z: 13, text: "FUMBLE" });
      end = { x: scene.yards, t: te };
      length = te + HOLD + (scene.touchdown ? 0.4 : 0);
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
      add("defender", defense, scene.defender, [key(0, 1, 6, "stand"), key(SNAP, 1, 6, "run"), key(te, spot + 0.6, 1.3, "down")]);
      ball.push({ from: 0, to: Infinity, by: qb });
      marks.push({ t: te, kind: "word", x: spot / 2, z: 13, text: "SACK" });
      marks.push({ t: te, kind: "yards", x: spot, z: 9, text: String(spot) });
      end = { x: spot, t: te };
      length = te + HOLD;
      break;
    }
    case "fieldGoal":
    case "extraPoint": {
      const distance = scene.yards;
      const tk = SNAP + 0.45;
      const flight = scene.blocked ? 0.5 : 0.9 + distance / 70;
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
      const word = scene.blocked ? "BLOCKED" : scene.good ? "GOOD" : "NO GOOD";
      marks.push({ t: tk + flight * 0.8, kind: "word", x: distance / 2, z: 13, text: word });
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
      const land = from + scene.yards;
      const tk = punt ? SNAP + 0.55 : SNAP + 0.45;
      const flight = 1.1 + scene.yards / 60;
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
      const back = scene.returner ? scene.air : 0;
      const te = tc + (scene.returner ? Math.max(0.35, Math.abs(back) / SPEED) : 0.4);
      if (scene.returner) {
        const ret = add("returner", receivingTeam, scene.returner, [
          key(0, land + 3, 2, "stand"),
          key(tk, land + 3, 2, "run"),
          key(tc, land, 0, "run"),
          key(te, land - back, 2, scene.touchdown ? "jump" : back > 0 ? "down" : "stand"),
        ]);
        ball.push({ from: tk, to: tc, arc: { a: [from, 0, 1.2], b: [land, 0, 1.6], apex: 9 + scene.yards * 0.15 } }, { from: tc, to: Infinity, by: ret });
        if (back > 0 && !scene.touchdown) {
          add("defender", kickingTeam, scene.defender, [key(0, land - back - 8, -4, "stand"), key(tk, land - back - 8, -4, "run"), key(te, land - back - 0.7, 1.5, "down")]);
        }
        if (back) marks.push({ t: te, kind: "yards", x: land - back, z: 6, text: String(back) });
        end = { x: land - back, t: te };
      } else {
        ball.push({ from: tk, to: tc, arc: { a: [from, 0, 1.2], b: [land, 0, 0], apex: 9 + scene.yards * 0.15 } }, { from: tc, to: Infinity, at: [land + 1, 0] });
      }
      marks.push({ t: tc, kind: "word", x: (from + land) / 2, z: 13, text: punt ? `PUNT ${scene.yards}` : `KICK ${scene.yards}` });
      if (scene.touchdown) marks.push({ t: te + 0.3, kind: "word", x: (from + land) / 2, z: -13, text: "TOUCHDOWN" });
      length = te + HOLD;
      break;
    }
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
    los: moved(0),
    end: end ? { x: moved(end.x), t: end.t } : null,
    posts: posts !== null ? moved(posts) : null,
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
