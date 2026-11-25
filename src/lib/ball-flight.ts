// A play on a live game's field on the floor (see FloorFields), told by the ball alone: thrown in an arc from where
// it was snapped to where it was caught, carried along the ground to where it was brought down, kicked high and long
// with backspin, falling out of the sky and bouncing loose on a fumble — each kind of play its own way of moving, read
// off ESPN's line for it (see play-scene) — then left where it ended for a while. In the field's yards: x along it
// from its left goal line (0) to its right one (100), the end zones past them; z across it from its middle, toward
// you; h up off the ground.

import { PlayScene } from "./play-scene";

export type Point = [x: number, z: number, h: number];
type Ease = "linear" | "in" | "out" | "inOut";
/** How the ball turns as it goes: a thrown spiral, end over end, a kick's backspin, or pointed the way it's going. */
export type Spin = "none" | "spiral" | "tumble" | "backspin";

/** The ball going from one point to another: in `dur` s from `t`, an `arc` (yards) over the straight line between them. */
export interface BallLeg {
  t: number;
  dur: number;
  from: Point;
  to: Point;
  arc: number;
  ease: Ease;
  spin: Spin;
  /** Faded in over the leg, or out; or not there at all. */
  fade: "in" | "out" | "none" | "hidden";
  /** Who has the ball: the team on offense when the play started, or the other — once it's been turned over (or a
   * kick's been fielded); and that team (set for a flight, see flightFor). */
  side: "offense" | "defense";
  team?: string;
}

/** What else shows on the field as it goes: a flag thrown (a coach's red one for a challenge), the ground shaken where
 * the ball's slammed down or a play's made, an end zone lit, a kick's goalposts, a grey cross where a pass came down
 * incomplete or a kickoff was kicked from. */
export type FieldMark =
  | { kind: "flag"; t: number; x: number; z: number; color: "yellow" | "red" }
  | { kind: "ripple"; t: number; x: number; z: number; tone: "ink" | "good" | "bad" }
  | { kind: "flash"; t: number; end: -1 | 1; tone: "ink" | "good" | "bad" }
  | { kind: "posts"; t: number; until: number; end: -1 | 1 }
  | { kind: "cross"; t: number; x: number; z: number };

export interface Flight {
  legs: BallLeg[];
  marks: FieldMark[];
  /** How long it all takes (s): the ball's moves, then held where it ended (see HOLD_S), then faded away. */
  length: number;
  /** When the ball's done moving (s) — held from there on. */
  settled: number;
  /** Where the ball was left (x), its last play's end. */
  end: number;
  /** What each play in it was, in a few words (see playLabel), from when it starts (s). */
  labels: { t: number; text: string }[];
  /** A kickoff: no line of scrimmage (nor a team with the ball behind it) while it's on. */
  kickoff: boolean;
}

/** Which way the team with the ball is going (1: toward the right end zone), and where it was snapped from (x). */
export interface FieldPlace {
  dir: 1 | -1;
  los: number;
}

/** How fast a ball's carried (yards a second). */
const RUN_SPEED = 9;
/** Every move a touch slower than life, to be watched. */
const PACE = 1.3;
/** How far out a throw to one side or the other goes (yards from the middle). */
const LANE = 12;
/** How long the ball's left where a play ended, and how long it takes to fade away then (s). */
export const HOLD_S = 10;
const FADE_S = 0.35;
/** The goalposts, past each end zone: 10 yards behind the goal line. */
const POSTS_BACK = 10;
/** A lateral: pitched this far back, and five yards out to the side for every two back. */
const LATERAL_BACK = 3;
const LATERAL_SIDE = 7.5;
/** How long a flag's yards take to walk off — quickly, once the play's over (s). */
const ENFORCE_S = 0.3;

const easeOf = (ease: Ease, u: number) =>
  ease === "in" ? u * u : ease === "out" ? 1 - (1 - u) * (1 - u) : ease === "inOut" ? (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)) : u;

/** Where the ball is `t` s into a flight (null before it, or once it's gone), how much of it shows, and how it's turning. */
export function ballAt(flight: Flight, t: number): { at: Point; alpha: number; spin: Spin; team: string | null } | null {
  if (t < 0 || t > flight.length) return null;
  const leg = flight.legs.find((l) => t >= l.t && t <= l.t + l.dur) ?? null;
  if (!leg || leg.fade === "hidden") return null;
  const u = leg.dur > 0 ? Math.min(1, Math.max(0, (t - leg.t) / leg.dur)) : 1;
  const e = easeOf(leg.ease, u);
  const lerp = (i: number) => leg.from[i] + (leg.to[i] - leg.from[i]) * e;
  const at: Point = [lerp(0), lerp(1), Math.max(0, lerp(2) + leg.arc * 4 * u * (1 - u))];
  const alpha = leg.fade === "in" ? u : leg.fade === "out" ? 1 - u : 1;
  return { at, alpha, spin: leg.spin, team: leg.team ?? null };
}

/** A flight being put together, leg by leg, from where the ball is. */
class Path {
  legs: BallLeg[] = [];
  marks: FieldMark[] = [];
  t = 0;
  side: BallLeg["side"] = "offense";
  constructor(public at: Point) {}
  /** The ball changes hands: the other team has it from here. */
  turn(): this {
    this.side = this.side === "offense" ? "defense" : "offense";
    return this;
  }
  /** The ball to `to`, taking `dur` s at life's pace (a touch slower, see PACE) — or `dur` exactly, `exact`. */
  go(to: Point, dur: number, o: { arc?: number; ease?: Ease; spin?: Spin; fade?: BallLeg["fade"]; exact?: boolean } = {}): this {
    const d = o.exact ? dur : dur * PACE;
    const leg: BallLeg = { t: this.t, dur: d, from: this.at, to, arc: o.arc ?? 0, ease: o.ease ?? "linear", spin: o.spin ?? "none", fade: o.fade ?? "none", side: this.side };
    this.legs.push(leg);
    this.t += d;
    this.at = to;
    return this;
  }
  /** Carried along the ground (at a runner's waist) to `x`, `z`. */
  carry(x: number, z: number): this {
    const d = Math.hypot(x - this.at[0], z - this.at[1]);
    return this.go([x, z, 1], Math.max(0.35, d / RUN_SPEED));
  }
  /** Thrown in an arc to `to`, higher and longer the farther it goes. */
  throw(to: Point): this {
    const d = Math.hypot(to[0] - this.at[0], to[1] - this.at[1]);
    return this.go(to, 0.45 + d / 30, { arc: 2 + d * 0.24, spin: "spiral" });
  }
  /** Pitched back to a teammate: two yards back for every five out to the side (toward the middle of the field). */
  lateral(dir: 1 | -1): this {
    const side = this.at[1] > 0 ? -1 : 1;
    return this.go([on(this.at[0], dir, -LATERAL_BACK), this.at[1] + side * LATERAL_SIDE, 1], 0.5, { arc: 2, spin: "tumble" });
  }
  wait(dur: number): this {
    return this.go(this.at, dur);
  }
  /** Bounced along the ground: each hop `[dx, dz, height]`, shorter and lower as they go. */
  bounce(hops: [number, number, number][]): this {
    for (const [dx, dz, up] of hops) this.go([this.at[0] + dx, this.at[1] + dz, 0], 0.18 + up * 0.17, { arc: up, spin: "tumble" });
    return this;
  }
  mark(m: FieldMark): this {
    this.marks.push(m);
    return this;
  }
}

/** The goal line a team going `dir` is going for. */
const goalOf = (dir: 1 | -1) => (dir > 0 ? 100 : 0);
const endOf = (x: number): -1 | 1 => (x >= 50 ? 1 : -1);
/** A point `yards` on from `x` the way `dir` goes, kept on the field (and its end zones). */
const on = (x: number, dir: 1 | -1, yards: number) => Math.max(-9.5, Math.min(109.5, x + dir * yards));

/** A loose ball's hops — every one a little different, from a seed (the play's own numbers). */
function dribble(seed: number, dir: 1 | -1): [number, number, number][] {
  const r = (k: number) => {
    const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  return [
    [dir * (1.5 + r(1) * 1.5), (r(2) - 0.5) * 4, 1.8],
    [-dir * (0.5 + r(3) * 1.5), (r(4) - 0.5) * 3.5, 1.0],
    [dir * (r(5) - 0.3) * 2, (r(6) - 0.5) * 2.5, 0.5],
    [dir * (r(7) - 0.5) * 1.2, (r(8) - 0.5) * 1.2, 0.2],
  ];
}

/** A touchdown: the ball spiked in the end zone, the ground shaking under it, the end zone lit. */
function celebrate(p: Path): void {
  const [x, z] = p.at;
  p.go([x, z, 4.5], 0.3, { ease: "out", spin: "tumble" });
  p.go([x, z, 0], 0.16, { ease: "in" });
  p.mark({ kind: "ripple", t: p.t, x, z, tone: "good" });
  p.mark({ kind: "flash", t: p.t, end: endOf(x), tone: "good" });
  p.bounce([
    [0.8, 0.5, 3],
    [0.5, 0.3, 1],
  ]);
}

/** Brought down where it ended: the ground shaken under it. */
function tackled(p: Path): void {
  const [x, z] = p.at;
  p.go([x, z, 0.25], 0.18, { ease: "in" });
  p.mark({ kind: "ripple", t: p.t, x, z, tone: "ink" });
}

/** Where a carry ends: on a touchdown, in the end zone (however far ESPN's spot of the ball put it). */
function carriedTo(x: number, dir: 1 | -1, touchdown: boolean): number {
  if (!touchdown) return x;
  return dir > 0 ? Math.max(x, 103) : Math.min(x, -3);
}

/** The ball where a play starts (`x`, `h` up), faded in there — no snap, no drop back: straight into the play. */
function from(x: number, h = 1): Path {
  const p = new Path([x, 0, h]);
  p.go([x, 0, h], 0.2, { fade: "in" });
  return p;
}

/** The ball snapped: up off the ground at the line and back to the quarterback, `back` yards. (Only a sack and a
 * fumbled snap are shown from the snap.) */
function snapped(los: number, dir: 1 | -1, back: number): Path {
  const p = new Path([los, 0, 0.3]);
  p.go([los, 0, 0.3], 0.2, { fade: "in" });
  p.go([on(los, dir, -back), 0, 1.5], 0.3, { arc: 0.4, ease: "out" });
  return p;
}

/** One play's flight, from where it was snapped. */
function playFlight(scene: PlayScene, place: FieldPlace, seed: number): Path {
  const { dir, los } = place;
  const at = (yards: number) => on(los, dir, yards);
  const lane = scene.lane * dir * LANE;
  let p: Path;

  switch (scene.kind) {
    case "run": {
      // Along the ground from the line to where it ended (pitched back and out to a teammate partway, on a lateral).
      p = from(los);
      if (scene.lateral) p.carry(at(scene.lateral.at), 0).lateral(dir);
      p.carry(carriedTo(at(scene.yards), dir, scene.touchdown), p.at[1]);
      break;
    }
    case "pass": {
      // Thrown in an arc from the line to where it was caught — however far it was taken from there, it's thrown the
      // whole way (on a lateral, to where it was pitched back and out to a teammate, who took it the rest).
      p = from(los, 1.6);
      if (scene.lateral) {
        p.throw([at(scene.lateral.at), lane, 1.6]).lateral(dir);
        p.carry(carriedTo(at(scene.yards), dir, scene.touchdown), p.at[1]);
      } else p.throw([carriedTo(at(scene.yards), dir, scene.touchdown), lane, 1.6]);
      break;
    }
    case "incomplete": {
      // Thrown, and down into the turf — a grey cross where it landed — skipping on a little.
      p = from(los, 1.6);
      const air = Math.max(1, scene.air);
      p.throw([at(air), lane, 1.4]);
      const landed = on(at(air), dir, 2.5);
      p.go([landed, lane, 0], 0.25, { arc: 0.5, ease: "in", spin: "tumble" });
      p.mark({ kind: "cross", t: p.t, x: landed, z: lane });
      p.bounce([
        [dir * 2, 0.4, 0.9],
        [dir * 1, 0.2, 0.35],
      ]);
      break;
    }
    case "interception": {
      // Thrown, picked off, and run back the other way.
      p = from(los, 1.6);
      const caught = at(Math.max(1, scene.air));
      p.throw([caught, lane, 1.8]);
      p.mark({ kind: "ripple", t: p.t, x: caught, z: lane, tone: "bad" });
      p.turn().go([caught, lane, 2.6], 0.22, { ease: "out", spin: "tumble" });
      p.carry(carriedTo(on(caught, dir, -scene.yards), (-dir) as 1 | -1, scene.touchdown), lane);
      break;
    }
    case "sack": {
      // Snapped, and the quarterback (the ball) run down behind the line, where he's brought to the ground.
      p = snapped(los, dir, Math.min(2, Math.abs(Math.min(scene.yards, -1))));
      const down = at(Math.min(scene.yards, -1));
      p.carry(down, 0);
      p.go([down, 0, 0.1], 0.18, { ease: "in", spin: "tumble" });
      p.mark({ kind: "ripple", t: p.t, x: down, z: 0, tone: "bad" });
      break;
    }
    case "kneel": {
      // Taken back a step and set down, slowly.
      p = from(los, 1.2);
      p.go([at(Math.min(scene.yards, -1)), 0, 0.2], 0.9, { ease: "out" });
      break;
    }
    case "spike": {
      // Thrown straight down: slammed into the ground, bouncing high off it.
      p = from(los, 2);
      p.go([los, 0, 0], 0.13, { ease: "in" });
      p.mark({ kind: "ripple", t: p.t, x: los, z: 0, tone: "ink" });
      p.bounce([
        [dir * 1.2, 0.5, 4],
        [dir * 0.6, 0.3, 1.2],
        [dir * 0.3, 0.1, 0.3],
      ]);
      break;
    }
    case "fumble": {
      // A snap that got away: snapped, bobbled, and loose back to where it was fallen on.
      const lost = Math.min(-1, scene.yards);
      p = snapped(los, dir, Math.min(1.5, -lost));
      p.go([p.at[0], 0.6, 0], 0.3, { arc: 0.9, ease: "in", spin: "tumble" });
      p.go([at(lost), -0.4, 0.3], Math.max(0.35, (Math.abs(at(lost) - p.at[0]) / RUN_SPEED) * 1.2), { spin: "tumble" });
      // Fallen on by the other side: theirs.
      if (scene.fumbleLost) p.turn().mark({ kind: "ripple", t: p.t, x: p.at[0], z: p.at[1], tone: "bad" }).wait(0.3);
      break;
    }
    case "fieldGoal":
    case "extraPoint": {
      // Kicked from 7 yards behind the line at the goalposts past the end zone: just past them, then straight down.
      const end = endOf(goalOf(dir));
      const posts = goalOf(dir) + dir * POSTS_BACK;
      p = from(at(-7), 0.4);
      p.mark({ kind: "posts", t: 0, until: Infinity, end });
      const far = Math.abs(posts - p.at[0]);
      // (Past the end line, where nothing else goes.)
      const past = posts + dir * 2;
      if (scene.blocked) {
        p.go([at(-5), 0, 2.2], 0.2, { ease: "out", spin: "tumble" });
        p.mark({ kind: "ripple", t: p.t, x: at(-5), z: 0, tone: "bad" });
        p.turn().go([at(-11), 3, 0], 0.7, { arc: 3.5, spin: "tumble" });
        p.bounce(dribble(seed, (-dir) as 1 | -1).slice(1));
      } else if (scene.good) {
        // Up over the crossbar, between the uprights.
        p.go([past, 0, 6], 0.9 + far / 70, { arc: 6 + far * 0.12, spin: "tumble" });
        p.mark({ kind: "flash", t: p.t, end, tone: "good" });
        p.go([past, 0, 0], 0.45, { ease: "in", spin: "tumble" });
      } else {
        // Wide of the posts.
        const wide = seed % 2 ? 6 : -6;
        p.go([past, wide, 4], 0.9 + far / 70, { arc: 5 + far * 0.1, spin: "tumble" });
        p.go([past, wide, 0], 0.4, { ease: "in", spin: "tumble" });
      }
      break;
    }
    case "punt": {
      // Booted high and far from where it's punted, 14 yards behind the line, spinning back as it goes.
      p = from(at(-14), 1.4);
      if (scene.blocked) {
        p.mark({ kind: "ripple", t: p.t, x: at(-13), z: 0, tone: "bad" });
        p.turn().go([at(-18), -3, 0], 0.7, { arc: 4, spin: "tumble" });
        p.bounce(dribble(seed, (-dir) as 1 | -1));
        break;
      }
      kickedDown(p, at(scene.yards), dir, scene, seed, 2.2, 13);
      break;
    }
    case "kickoff": {
      // Off the tee at the kicking team's 35 (they're going the other way; a grey cross there), high and long — or an
      // onside kick, bounding along the ground.
      const kick = (-dir) as 1 | -1;
      const tee = goalOf(dir) + kick * 35;
      // The kicking team's ball till it's fielded.
      p = from(tee, 0.4);
      p.legs[0].side = "defense";
      p.side = "defense";
      p.mark({ kind: "cross", t: 0, x: tee, z: 0 });
      if (scene.onside) {
        const hops = [3, 2.2, 1.4, 0.8, 0.4];
        const each = Math.max(2, scene.yards) / hops.length;
        p.bounce(hops.map((up, i) => [kick * each, (i % 2 ? -1 : 1) * 1.2, up]));
        if (scene.recoveredBy?.team === scene.offense) p.turn();
        p.mark({ kind: "ripple", t: p.t, x: p.at[0], z: p.at[1], tone: scene.recoveredBy && scene.recoveredBy.team !== scene.offense ? "bad" : "ink" });
        break;
      }
      kickedDown(p, on(tee, kick, scene.yards), kick, scene, seed, 2.7, 17);
      break;
    }
    case "penalty":
    default: {
      // A flag before the snap, thrown in at the line (the ball walked off for it below).
      p = from(los, 0.5);
      p.wait(0.6);
      break;
    }
  }

  // Loose at the end of it: popped up out of his hands, falling back out of the sky, and bouncing about.
  if (scene.fumble && scene.kind !== "fumble") {
    const [x, z] = p.at;
    p.go([x, z, 14], 0.45, { ease: "out", spin: "tumble" });
    p.go([x, z, 0], 0.75, { ease: "in", spin: "tumble" });
    p.bounce(dribble(seed, dir));
    if (scene.fumble.lost) {
      p.turn().mark({ kind: "ripple", t: p.t, x: p.at[0], z: p.at[1], tone: "bad" });
      if (scene.fumble.back > 0) p.carry(on(p.at[0], (-dir) as 1 | -1, scene.fumble.back), p.at[1]);
    }
  }

  // How it ended.
  if (scene.touchdown || scene.conversion?.good) celebrate(p);
  else if (scene.safety) {
    p.mark({ kind: "ripple", t: p.t, x: p.at[0], z: p.at[1], tone: "bad" });
    p.mark({ kind: "flash", t: p.t, end: endOf(p.at[0]), tone: "bad" });
  } else if (["run", "pass", "interception"].includes(scene.kind) && !scene.fumble) tackled(p);

  // A flag: thrown in at the line as the play starts; once it's over, the ball straight to where its yards put it —
  // on from where the play ended, or (one that wiped the play out) from where it was snapped.
  if (scene.penalty) {
    p.mark({ kind: "flag", t: 0.15, x: on(los, dir, 1), z: 6, color: "yellow" });
    const { penalty } = scene;
    if (!penalty.declined && penalty.yards) {
      const against = penalty.team === scene.offense ? ((-dir) as 1 | -1) : dir;
      const spot = on(penalty.noPlay || scene.kind === "penalty" ? los : p.at[0], against, penalty.yards);
      p.go([spot, p.at[1] * 0.5, 0.4], ENFORCE_S, { arc: 0.5, exact: true });
    }
  }
  // A challenge: the coach's red flag in.
  if (scene.review?.called) p.mark({ kind: "flag", t: p.t, x: on(los, dir, -4), z: 22, color: "red" }).wait(0.9);
  return p;
}

/** Kicked from where the ball is to land at `land` (going `dir`), hanging in the air `hang` s, `peak` yards up,
 * spinning back as it goes — then caught and run back, fair caught, downed, bounced into the end zone or out of
 * bounds. */
function kickedDown(p: Path, land: number, dir: 1 | -1, scene: PlayScene, seed: number, hang: number, peak: number): void {
  const result = scene.kickResult;
  const z = result === "OUT OF BOUNDS" ? (seed % 2 ? 1 : -1) * 22 : (seed % 3) - 1;
  const caught = !result || result === "FAIR CATCH";
  p.go([land, z, caught ? 1.5 : 0], hang, { arc: peak, spin: "backspin" });
  // Fielded (or left to lie): the receiving team's ball now.
  p.turn();
  if (result === "FAIR CATCH") {
    p.wait(0.5);
    return;
  }
  if (result === "TOUCHBACK") {
    // Into the end zone, bouncing, and left there.
    const end = goalOf(dir);
    p.bounce([
      [dir * Math.max(1, Math.abs(end + dir * 4 - p.at[0]) * 0.6), 0.3, 2],
      [dir * 1.5, -0.2, 0.8],
      [dir * 0.6, 0, 0.3],
    ]);
    return;
  }
  if (result === "OUT OF BOUNDS") {
    p.bounce([
      [dir * 2, Math.sign(z) * 5, 1.5],
      [dir * 1, Math.sign(z) * 4, 0.6],
    ]);
    return;
  }
  if (result === "DOWNED") {
    p.bounce(dribble(seed, dir).slice(0, 3));
    p.mark({ kind: "ripple", t: p.t, x: p.at[0], z: p.at[1], tone: "ink" });
    return;
  }
  // Caught and run back the other way.
  const back = (-dir) as 1 | -1;
  p.carry(carriedTo(on(land, back, scene.air), back, scene.touchdown), z);
  if (!scene.touchdown && !scene.fumble) tackled(p);
}

/**
 * A play's flight, and what's acted out right after it (a touchdown's try; the play as it stands once a review
 * reversed it), each where it was snapped (`place`), the ball faded away between them — and at the end, left where
 * it ended for a while (HOLD_S), then faded away.
 */
export function flightFor(scene: PlayScene, place: (scene: PlayScene) => FieldPlace, seed = 1): Flight {
  const legs: BallLeg[] = [];
  const marks: FieldMark[] = [];
  const labels: Flight["labels"] = [];
  let t = 0;
  let end = place(scene).los;
  let last: BallLeg | null = null;
  // Who has the ball at the end of it all (it can change hands after the ball's last move: a fumble fallen on).
  let holder: Pick<BallLeg, "side" | "team"> = { side: "offense", team: scene.offense };
  const parts: PlayScene[] = [];
  for (let s: PlayScene | null = scene; s && parts.length < 4; s = s.after) parts.push(s);
  parts.forEach((s, k) => {
    const p = playFlight(s, place(s), seed + k);
    // Between one play and the next (a touchdown and its try), the ball faded away.
    if (k < parts.length - 1) p.go(p.at, FADE_S, { fade: "out", exact: true });
    labels.push({ t, text: playLabel(s) });
    // A kick's goalposts up only while it's on.
    for (const m of p.marks) marks.push(m.kind === "posts" ? { ...m, t: m.t + t, until: t + p.t } : { ...m, t: m.t + t });
    for (const l of p.legs) legs.push((last = { ...l, t: l.t + t, team: l.side === "offense" ? s.offense : s.defense }));
    end = p.at[0];
    holder = { side: p.side, team: p.side === "offense" ? s.offense : s.defense };
    t += p.t + (k < parts.length - 1 ? 0.25 : 0);
  });
  // Held where it ended, then faded away.
  const settled = t;
  if (last) {
    const lastLeg: BallLeg = last;
    const hold = (dur: number, fade: BallLeg["fade"]): BallLeg => ({ ...lastLeg, ...holder, t, dur, from: lastLeg.to, arc: 0, ease: "linear", spin: "none", fade });
    legs.push(hold(HOLD_S, "none"));
    t += HOLD_S;
    legs.push(hold(FADE_S, "out"));
    t += FADE_S;
  }
  // The posts stay up while the ball's held past them.
  for (const m of marks) if (m.kind === "posts" && Math.abs(m.until - settled) < 1e-9) m.until = t;
  return { legs, marks, length: t, settled, end, labels, kickoff: scene.kind === "kickoff" };
}

/**
 * Where the next play's snapped from once this one's over (x), and the team with the ball then — the last of what's
 * acted out (the play as it stands, once a review's reversed it). On from the line by what was gained (none on an
 * incompletion); where the ball ended up on a turnover, a punt (a touchback, the receiving team's 20), a fumble, a
 * flag walked off. None after a score, a try, a field goal or a kickoff: what comes next isn't snapped there.
 */
export function nextSnap(scene: PlayScene, place: (scene: PlayScene) => FieldPlace, flight: Flight): { x: number; team: string } | null {
  let s = scene;
  for (let k = 0; s.after && k < 4; k++) s = s.after;
  if (s.kind === "kickoff" || s.kind === "fieldGoal" || s.kind === "extraPoint" || s.conversion || s.touchdown || s.safety) return null;
  const { dir, los } = place(s);
  const team = flight.legs[flight.legs.length - 1]?.team ?? s.offense;
  const onField = (x: number) => Math.max(1, Math.min(99, x));
  if (s.kind === "punt" && s.kickResult === "TOUCHBACK") return { x: dir > 0 ? 80 : 20, team };
  if (team !== s.offense || s.kind === "punt" || s.fumble || (s.penalty && !s.penalty.declined && s.penalty.yards)) return { x: onField(flight.end), team };
  return { x: onField(los + dir * (s.kind === "incomplete" || s.kind === "spike" ? 0 : s.yards)), team };
}

const yds = (n: number) => `${Math.abs(n)} yard${Math.abs(n) === 1 ? "" : "s"}`;

/** What a play was, in a few words: "12 yard pass", "Pick six", "45 yard field goal · good", "Flag · False Start". */
export function playLabel(scene: PlayScene): string {
  const s = scene;
  const result = (good: boolean, blocked = false) => (blocked ? "blocked" : good ? "good" : "no good");
  let label: string;
  switch (s.kind) {
    case "pass":
      label = s.conversion ? "Two-point try · good" : s.touchdown ? `${s.yards} yard touchdown pass` : `${s.yards} yard pass`;
      if (s.lateral) label += " · lateral";
      break;
    case "incomplete":
      label = s.conversion ? "Two-point try · no good" : "Incomplete pass";
      break;
    case "interception":
      label = s.touchdown ? "Pick six" : "Interception";
      break;
    case "run":
      label = s.conversion
        ? `Two-point try · ${result(s.conversion.good)}`
        : s.touchdown
          ? `${s.yards} yard touchdown ${s.scramble ? "scramble" : "run"}`
          : s.yards < 0
            ? `${s.scramble ? "Scramble" : "Run"} · loss of ${yds(s.yards)}`
            : `${s.yards} yard ${s.scramble ? "scramble" : "run"}`;
      if (s.lateral) label += " · lateral";
      break;
    case "sack":
      label = s.safety ? "Sack · safety" : `Sack · loss of ${yds(s.yards)}`;
      break;
    case "kneel":
      label = "Kneel";
      break;
    case "spike":
      label = "Spike";
      break;
    case "fumble":
      label = "Fumbled snap";
      break;
    case "fieldGoal":
      label = `${s.yards} yard field goal · ${result(s.good, s.blocked)}`;
      break;
    case "extraPoint":
      label = `Extra point · ${result(s.good, s.blocked)}`;
      break;
    case "punt":
      label = s.blocked ? "Blocked punt" : s.touchdown ? "Punt return touchdown" : [`${s.yards} yard punt`, s.kickResult?.toLowerCase() ?? (s.air ? `${s.air} yard return` : null)].filter(Boolean).join(" · ");
      break;
    case "kickoff":
      label = s.onside
        ? ["Onside kick", s.recoveredBy ? `recovered by ${s.recoveredBy.team}` : null].filter(Boolean).join(" · ")
        : s.touchdown
          ? "Kick return touchdown"
          : ["Kickoff", s.kickResult?.toLowerCase() ?? (s.air ? `${s.air} yard return` : null)].filter(Boolean).join(" · ");
      break;
    case "penalty":
    default:
      return s.penalty ? `Flag · ${s.penalty.name}${s.penalty.declined ? " · declined" : ""}` : "Flag";
  }
  if (s.fumble && s.kind !== "fumble") label += s.fumble.lost ? " · fumble lost" : " · fumble";
  if (s.safety && s.kind !== "sack") label += " · safety";
  if (s.penalty) label += ` · flag: ${s.penalty.name}${s.penalty.declined ? " (declined)" : s.penalty.noPlay ? " (no play)" : ""}`;
  if (s.review?.called) label += s.review.reversed ? " · challenged" : " · challenge: call stands";
  if (s.review && !s.review.called) label = `Overturned: ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  return label;
}
