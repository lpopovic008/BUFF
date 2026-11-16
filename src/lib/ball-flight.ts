// A play on a live game's field on the floor (see FloorFields), told by the ball alone: thrown in an arc to where it
// was caught, carried along the ground to where it was brought down, kicked high and long, falling out of the sky and
// bouncing loose on a fumble — each kind of play its own way of moving, read off ESPN's line for it (see play-scene).
// In the field's yards: x along it from its left goal line (0) to its right one (100), the end zones past them; z
// across it from its middle, toward you; h up off the ground.

import { PlayScene } from "./play-scene";

export type Point = [x: number, z: number, h: number];
type Ease = "linear" | "in" | "out" | "inOut";
/** How the ball turns as it goes: a thrown spiral, end over end, or pointed the way it's going. */
export type Spin = "none" | "spiral" | "tumble";

/** The ball going from one point to another: in `dur` s from `t`, an `arc` (yards) over the straight line between them. */
export interface BallLeg {
  t: number;
  dur: number;
  from: Point;
  to: Point;
  arc: number;
  ease: Ease;
  spin: Spin;
  /** How far it cuts side to side on its way (a runner's weave), yards. */
  weave: number;
  /** Faded in over the leg, or out; or not there at all. */
  fade: "in" | "out" | "none" | "hidden";
}

/** What else shows on the field as it goes: a flag thrown (a coach's red one for a challenge), the ground shaken where
 * the ball's slammed down or a play's made, an end zone lit, a kick's goalposts. */
export type FieldMark =
  | { kind: "flag"; t: number; x: number; z: number; color: "yellow" | "red" }
  | { kind: "ripple"; t: number; x: number; z: number; tone: "ink" | "good" | "bad" }
  | { kind: "flash"; t: number; end: -1 | 1; tone: "ink" | "good" | "bad" }
  | { kind: "posts"; t: number; until: number; end: -1 | 1 };

export interface Flight {
  legs: BallLeg[];
  marks: FieldMark[];
  /** How long it all takes (s), the ball faded away at the end. */
  length: number;
  /** Where the ball was left (x), its last play's end. */
  end: number;
}

/** Which way the team with the ball is going (1: toward the right end zone), and where it was snapped from (x). */
export interface FieldPlace {
  dir: 1 | -1;
  los: number;
}

/** How fast a ball's carried, and how long a quarterback drops back (yards a second, s). */
const RUN_SPEED = 9;
const DROP_S = 0.45;
/** How far out a throw to one side or the other goes (yards from the middle). */
const LANE = 12;
/** Held a moment where it ended before it fades away (s). */
const HOLD_S = 0.6;
const FADE_S = 0.35;
/** The goalposts, past each end zone: 10 yards behind the goal line. */
const POSTS_BACK = 10;

const easeOf = (ease: Ease, u: number) =>
  ease === "in" ? u * u : ease === "out" ? 1 - (1 - u) * (1 - u) : ease === "inOut" ? (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)) : u;

/** Where the ball is `t` s into a flight (null before it, or once it's gone), how much of it shows, and how it's turning. */
export function ballAt(flight: Flight, t: number): { at: Point; alpha: number; spin: Spin } | null {
  if (t < 0 || t > flight.length) return null;
  const leg = flight.legs.find((l) => t >= l.t && t <= l.t + l.dur) ?? null;
  if (!leg || leg.fade === "hidden") return null;
  const u = leg.dur > 0 ? Math.min(1, Math.max(0, (t - leg.t) / leg.dur)) : 1;
  const e = easeOf(leg.ease, u);
  const lerp = (i: number) => leg.from[i] + (leg.to[i] - leg.from[i]) * e;
  const weave = leg.weave * Math.sin(u * Math.PI * 3) * Math.sin(u * Math.PI);
  const at: Point = [lerp(0), lerp(1) + weave, Math.max(0, lerp(2) + leg.arc * 4 * u * (1 - u))];
  const alpha = leg.fade === "in" ? u : leg.fade === "out" ? 1 - u : 1;
  return { at, alpha, spin: leg.spin };
}

/** A flight being put together, leg by leg, from where the ball is. */
class Path {
  legs: BallLeg[] = [];
  marks: FieldMark[] = [];
  t = 0;
  constructor(public at: Point) {}
  go(to: Point, dur: number, o: { arc?: number; ease?: Ease; spin?: Spin; weave?: number; fade?: BallLeg["fade"] } = {}): this {
    const leg: BallLeg = { t: this.t, dur, from: this.at, to, arc: o.arc ?? 0, ease: o.ease ?? "linear", spin: o.spin ?? "none", weave: o.weave ?? 0, fade: o.fade ?? "none" };
    this.legs.push(leg);
    this.t += dur;
    this.at = to;
    return this;
  }
  /** Carried along the ground (at a runner's waist) to `x`, `z`, weaving. */
  carry(x: number, z: number, weave = 1): this {
    const d = Math.hypot(x - this.at[0], z - this.at[1]);
    return this.go([x, z, 1], Math.max(0.35, d / RUN_SPEED), { weave: d > 4 ? weave : 0 });
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

/** The ball as it's snapped, coming up off the ground at the line — faded in there. */
function snap(los: number, dir: 1 | -1, back: number, h = 1.5): Path {
  const p = new Path([los, 0, 0.3]);
  p.go([los, 0, 0.3], 0.25, { fade: "in" });
  p.go([on(los, dir, -back), 0, h], 0.18 + back * 0.012, { ease: "out" });
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
      if (scene.scramble) {
        // Dropped back, nowhere to throw: side to side in the pocket, then off running.
        p = snap(los, dir, 1.5);
        p.go([at(-6), 0, 1.5], DROP_S, { ease: "out" });
        p.go([at(-5.5), 3, 1.3], 0.28, { ease: "inOut" });
        p.go([at(-6.5), -3, 1.3], 0.32, { ease: "inOut" });
      } else {
        // Handed off a few yards back.
        p = snap(los, dir, 3, 1);
      }
      const end = carriedTo(at(scene.yards), dir, scene.touchdown);
      if (scene.lateral) {
        // Pitched back to a teammate, who takes it the rest of the way.
        p.carry(at(scene.lateral.at), lane * 0.5);
        p.go([on(p.at[0], dir, -3), p.at[1] + 4, 1], 0.38, { arc: 1.5, spin: "tumble" });
      }
      p.carry(end, scene.touchdown ? 0 : lane * 0.6, 1.4);
      break;
    }
    case "pass":
    case "incomplete":
    case "interception": {
      p = snap(los, dir, 1.5);
      p.go([at(-6), 0, 1.6], DROP_S, { ease: "out" });
      const air = Math.max(1, scene.kind === "pass" ? Math.min(scene.air, scene.yards) : scene.air);
      const caught = carriedTo(at(air), dir, scene.kind === "pass" && scene.touchdown && scene.yards <= air);
      // Thrown in an arc, higher and longer the farther it goes.
      p.go([caught, lane, 1.8], 0.45 + Math.abs(air + 6) / 30, { arc: 2 + Math.abs(air + 6) * 0.24, spin: "spiral" });
      if (scene.kind === "incomplete") {
        // Off his fingertips and into the turf, skipping on.
        p.go([on(caught, dir, 3), lane, 0], 0.28, { arc: 0.6, ease: "in", spin: "tumble" });
        p.bounce([
          [dir * 2, 0.4, 0.9],
          [dir * 1, 0.2, 0.35],
        ]);
      } else if (scene.kind === "interception") {
        // Picked off: going straight back the other way.
        p.mark({ kind: "ripple", t: p.t, x: caught, z: lane, tone: "bad" });
        p.go([caught, lane, 2.6], 0.22, { ease: "out", spin: "tumble" });
        const back = carriedTo(on(caught, dir, -scene.yards), (-dir) as 1 | -1, scene.touchdown);
        p.carry(back, lane * 0.4, 1.4);
      } else {
        // Caught, and run on with.
        if (scene.lateral) {
          p.carry(at(scene.lateral.at), lane);
          p.go([on(p.at[0], dir, -3), p.at[1] + 4, 1], 0.38, { arc: 1.5, spin: "tumble" });
        }
        p.carry(carriedTo(at(scene.yards), dir, scene.touchdown), scene.touchdown ? lane * 0.5 : lane, 1);
      }
      break;
    }
    case "sack": {
      // Dropped back, the pocket closing round it — then driven into the ground behind the line.
      p = snap(los, dir, 1.5);
      p.go([at(-6), 0, 1.6], DROP_S, { ease: "out" });
      p.go([at(-6), 1.6, 1.6], 0.22, { ease: "inOut" });
      p.go([at(-6.5), -1.6, 1.5], 0.26, { ease: "inOut" });
      const down = at(Math.min(scene.yards, -1));
      p.go([down, -0.5, 0.1], 0.22, { ease: "in", spin: "tumble" });
      p.mark({ kind: "ripple", t: p.t, x: down, z: -0.5, tone: "bad" });
      break;
    }
    case "kneel": {
      // Taken back a step and set down, slowly.
      p = snap(los, dir, 1, 1.2);
      p.go([at(Math.min(scene.yards, -1)), 0, 0.2], 0.9, { ease: "out" });
      break;
    }
    case "spike": {
      // Thrown straight down: slammed into the ground, bouncing high off it.
      p = snap(los, dir, 1, 2);
      p.go([at(-0.5), 0, 0], 0.13, { ease: "in" });
      p.mark({ kind: "ripple", t: p.t, x: at(-0.5), z: 0, tone: "ink" });
      p.bounce([
        [dir * 1.2, 0.5, 4],
        [dir * 0.6, 0.3, 1.2],
        [dir * 0.3, 0.1, 0.3],
      ]);
      break;
    }
    case "fumble": {
      // A snap that got away: falling out of the sky behind the line, and loose on the ground there.
      p = new Path([at(-2), 0, 16]);
      p.go([at(-2), 0, 0], 0.95, { ease: "in", fade: "in", spin: "tumble" });
      p.bounce(dribble(seed, dir));
      break;
    }
    case "fieldGoal":
    case "extraPoint": {
      // Snapped back to the holder, held, and kicked at the goalposts past the end zone.
      const end = endOf(goalOf(dir));
      const posts = goalOf(dir) + dir * POSTS_BACK;
      p = new Path([los, 0, 0.3]);
      p.go([los, 0, 0.3], 0.25, { fade: "in" });
      p.mark({ kind: "posts", t: 0, until: Infinity, end });
      p.go([at(-7), 0, 0.4], 0.35, { arc: 0.4 });
      p.wait(0.25);
      const far = Math.abs(posts - p.at[0]);
      if (scene.blocked) {
        p.go([at(-5), 0, 2.2], 0.2, { ease: "out", spin: "tumble" });
        p.mark({ kind: "ripple", t: p.t, x: at(-5), z: 0, tone: "bad" });
        p.go([at(-11), 3, 0], 0.7, { arc: 3.5, spin: "tumble" });
        p.bounce(dribble(seed, (-dir) as 1 | -1).slice(1));
      } else if (scene.good) {
        // Up over the crossbar, between the uprights, and down behind them.
        p.go([posts, 0, 7], 0.9 + far / 70, { arc: 6 + far * 0.12, spin: "tumble" });
        p.mark({ kind: "flash", t: p.t, end, tone: "good" });
        p.go([on(posts, dir, 6), 0, 0], 0.5, { ease: "in", spin: "tumble" });
      } else {
        // Wide, or short: off to one side of the posts and down.
        const wide = seed % 2 ? 7 : -7;
        p.go([posts, wide, 4], 0.9 + far / 70, { arc: 5 + far * 0.1, spin: "tumble" });
        p.go([on(posts, dir, 5), wide * 1.3, 0], 0.45, { ease: "in", spin: "tumble" });
      }
      break;
    }
    case "punt": {
      // Snapped back to the punter, and booted high and far.
      p = new Path([los, 0, 0.3]);
      p.go([los, 0, 0.3], 0.25, { fade: "in" });
      p.go([at(-14), 0, 1.4], 0.5, { arc: 0.6 });
      if (scene.blocked) {
        p.go([at(-12), 0, 2.4], 0.15, { ease: "out" });
        p.mark({ kind: "ripple", t: p.t, x: at(-12), z: 0, tone: "bad" });
        p.go([at(-18), -3, 0], 0.7, { arc: 4, spin: "tumble" });
        p.bounce(dribble(seed, (-dir) as 1 | -1));
        break;
      }
      p.wait(0.15);
      kickedDown(p, at(scene.yards), dir, scene, seed, 2.2, 13);
      break;
    }
    case "kickoff": {
      // Off the tee at the kicking team's 35 (they're going the other way), high and long — or an onside kick,
      // bounding along the ground.
      const kick = (-dir) as 1 | -1;
      const tee = goalOf(dir) + kick * 35;
      p = new Path([tee, 0, 0.4]);
      p.go([tee, 0, 0.4], 0.5, { fade: "in" });
      if (scene.onside) {
        const hops = [3, 2.2, 1.4, 0.8, 0.4];
        const each = Math.max(2, scene.yards) / hops.length;
        p.bounce(hops.map((up, i) => [kick * each, (i % 2 ? -1 : 1) * 1.2, up]));
        p.mark({ kind: "ripple", t: p.t, x: p.at[0], z: p.at[1], tone: scene.recoveredBy && scene.recoveredBy.team !== scene.offense ? "bad" : "ink" });
        break;
      }
      kickedDown(p, on(tee, kick, scene.yards), kick, scene, seed, 2.7, 17);
      break;
    }
    case "penalty":
    default: {
      // A flag before the snap: thrown in where it happened (the ball walked off for it below).
      p = new Path([los, 0, 0.3]);
      p.go([los, 0, 0.3], 0.25, { fade: "in" });
      p.mark({ kind: "flag", t: 0, x: los, z: 6, color: "yellow" });
      p.wait(1.1);
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
      p.mark({ kind: "ripple", t: p.t, x: p.at[0], z: p.at[1], tone: "bad" });
      if (scene.fumble.back > 0) p.carry(on(p.at[0], (-dir) as 1 | -1, scene.fumble.back), p.at[1], 1);
    }
  }

  // How it ended.
  if (scene.touchdown || scene.conversion?.good) celebrate(p);
  else if (scene.safety) {
    p.mark({ kind: "ripple", t: p.t, x: p.at[0], z: p.at[1], tone: "bad" });
    p.mark({ kind: "flash", t: p.t, end: endOf(p.at[0]), tone: "bad" });
  } else if (["run", "pass", "interception"].includes(scene.kind) && !scene.fumble) tackled(p);

  // A flag on it: thrown in while it's going on, and the ball walked off for it a few yards at a time.
  if (scene.penalty) {
    const flagged = scene.kind === "penalty" ? null : (p.legs[Math.min(p.legs.length - 1, 2)]?.t ?? 0.5);
    if (flagged !== null) p.mark({ kind: "flag", t: flagged, x: at(Math.max(-3, Math.min(scene.yards, 6))), z: 5, color: "yellow" });
    const { penalty } = scene;
    if (!penalty.declined && penalty.yards) {
      const against = penalty.team === scene.offense ? ((-dir) as 1 | -1) : dir;
      // On a play that doesn't count, back to where it was snapped first.
      if (penalty.noPlay && scene.kind !== "penalty") p.go([los, 0, 0.5], 0.6, { arc: 2.5, spin: "tumble" });
      else p.go([p.at[0], p.at[1], 0.5], 0.2);
      for (let left = penalty.yards; left > 0; left -= 5) {
        const step = Math.min(5, left);
        p.go([on(p.at[0], against, step), p.at[1] * 0.5, 0.5], 0.32, { arc: 1.1 });
      }
    }
  }
  // A challenge: the coach's red flag in.
  if (scene.review?.called) p.mark({ kind: "flag", t: p.t, x: on(los, dir, -4), z: 22, color: "red" }).wait(0.9);

  // Held a moment where it ended, and faded away.
  p.wait(HOLD_S);
  p.go(p.at, FADE_S, { fade: "out" });
  return p;
}

/** Kicked from where the ball is to land at `land` (going `dir`), hanging in the air `hang` s, `peak` yards up — then
 * caught and run back, fair caught, downed, bounced into the end zone or out of bounds. */
function kickedDown(p: Path, land: number, dir: 1 | -1, scene: PlayScene, seed: number, hang: number, peak: number): void {
  const result = scene.kickResult;
  const z = result === "OUT OF BOUNDS" ? (seed % 2 ? 1 : -1) * 22 : (seed % 3) - 1;
  const caught = !result || result === "FAIR CATCH";
  p.go([land, z, caught ? 1.5 : 0], hang, { arc: peak, spin: scene.kind === "punt" ? "spiral" : "tumble" });
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
  p.carry(carriedTo(on(land, back, scene.air), back, scene.touchdown), z * 0.5 + 2, 1.6);
  if (!scene.touchdown && !scene.fumble) tackled(p);
}

/**
 * A play's flight, and what's acted out right after it (a touchdown's try; the play as it stands once a review
 * reversed it), each where it was snapped (`place`), the ball faded away between them.
 */
export function flightFor(scene: PlayScene, place: (scene: PlayScene) => FieldPlace, seed = 1): Flight {
  const legs: BallLeg[] = [];
  const marks: FieldMark[] = [];
  let t = 0;
  let end = place(scene).los;
  for (let s: PlayScene | null = scene, k = 0; s && k < 4; s = s.after, k++) {
    const p = playFlight(s, place(s), seed + k);
    // A kick's goalposts up only while it's on.
    for (const m of p.marks) marks.push(m.kind === "posts" ? { ...m, t: m.t + t, until: t + p.t } : { ...m, t: m.t + t });
    for (const l of p.legs) legs.push({ ...l, t: l.t + t });
    end = p.at[0];
    t += p.t + 0.25;
  }
  return { legs, marks, length: Math.max(0, t - 0.25), end };
}
