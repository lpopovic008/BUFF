"use client";

import { useEffect, useRef } from "react";
import type { GamePlay } from "@/lib/play-by-play";
import { labelNames } from "@/lib/play-lines";
import { actorAt, ballAt, Pose, sceneFor, Stage, StageActor, stageFor } from "@/lib/play-scene";
import { loadRosters, RosterPlayer } from "@/lib/players";
import { uniformFor, Uniform } from "@/lib/team-colors";
import { FLOOR_TILT, floorDepth, floorPoint, floorScale, GRID_PX, PERSPECTIVE_PX } from "@/lib/grid-room";

/** Asks the floor to act a play out (see showPlayOnFloor). */
const PLAY_EVENT = "floor:play";

interface PlayDetail {
  play: GamePlay;
  teams: [home: string, away: string];
  /** Tapped to see again: played now, not after whatever's on. */
  now: boolean;
}

/**
 * Acts a Red Zone play out on the room's floor (see FloorPlay) — one that's just come in, after any already on, or,
 * tapped (`now`), there and then.
 */
export function showPlayOnFloor(play: GamePlay, teams: [home: string, away: string], now = false) {
  window.dispatchEvent(new CustomEvent<PlayDetail>(PLAY_EVENT, { detail: { play, teams, now } }));
}

// The field: on a phone, about this many of the floor's squares long, as wide as the screen; how long it is and how
// wide, in yards (end zones and all); how long it takes to come and go (s); and how many plays wait their turn.
const PHONE_SQUARES = 3.3;
const FIELD_LONG = 120;
const FIELD_WIDE = 53.3;
const FADE_IN = 0.35;
// Along the field, how much shows: the play's length and this many yards either side, at least this many in all.
const MARGIN = 5;
const MIN_SPAN = 16;
// The line of scrimmage and the line to gain, colored as on television.
const SCRIMMAGE = "#2f7cf6";
const FIRST_DOWN = "#f5d020";
const FADE_OUT = 0.5;
const QUEUE = 3;

// A pixel player, facing you: helmet (H) and its face (V), jersey (J) and sleeves (A), gloves (G), pants (P), socks
// (S) and shoes (K) — its number on its chest, rows 5–9, columns 3–9. Legs and arms change with how they stand.
const TOP = ["....HHHHH....", "...HHHHHHH...", "...HVVVVVH...", "...HHVVVHH...", "..JJJJJJJJJ..", ".JJJJJJJJJJJ."];
const CHEST = ["AJJJJJJJJJJJA", "AJJJJJJJJJJJA", "AJJJJJJJJJJJA", "GJJJJJJJJJJJG", ".JJJJJJJJJJJ.", "..PPPPPPPPP.."];
const LEGS: Record<"stand" | "stride" | "together" | "kick", string[]> = {
  stand: ["..PPPP.PPPP..", "..PPP...PPP..", "..SSS...SSS..", "..KKK...KKK.."],
  stride: ["..PPPP.PPPP..", ".PPP.....PPP.", ".SSS.....SSS.", "KKK.......KKK"],
  together: ["...PPPPPPP...", "....PPPPP....", "....SSSSS....", "....KKKKK...."],
  kick: ["..PPPP.PPPPP.", "..PPP.....PPP", "..SSS......SS", "..KKK.......K"],
};
const W = 13;
const H = 16;

// A 3x5 pixel font, for the numbers on the jerseys.
const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111",
  " ": "000000000000000",
};

/** Each lit pixel of `text` in the font: column, row — 4 columns a character. */
function glyphPixels(text: string): [number, number][] {
  const out: [number, number][] = [];
  [...text].forEach((ch, i) => {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    for (let p = 0; p < 15; p++) if (g[p] === "1") out.push([i * 4 + (p % 3), Math.floor(p / 3)]);
  });
  return out;
}

type Frame = "stand" | "runA" | "runB" | "throw" | "jump" | "kick";

/** A player's look, drawn at a pixel a unit: in their uniform, their number on the chest (if known). */
function paintSprite(uniform: Uniform, number: string | null, frame: Frame, outline: string | null): HTMLCanvasElement {
  const legs = frame === "runA" ? LEGS.stride : frame === "runB" || frame === "jump" ? LEGS.together : frame === "kick" ? LEGS.kick : LEGS.stand;
  const rows = [...TOP, ...CHEST, ...legs].map((r) => [...r]);
  // Arms up: one to throw, both to celebrate.
  const raise = (col: number) => {
    for (let r = 6; r <= 9; r++) rows[r][col] = ".";
    for (let r = 1; r <= 5; r++) rows[r][col] = "A";
    rows[0][col] = "G";
  };
  if (frame === "throw") raise(12);
  if (frame === "jump") {
    raise(0);
    raise(12);
  }
  const colors: Record<string, string> = {
    H: uniform.helmet,
    V: "#2b2b2b",
    J: uniform.jersey,
    A: uniform.jersey,
    G: "#d9d9d9",
    P: uniform.pants,
    S: uniform.socks,
    K: "#1c1c1c",
  };
  const canvas = document.createElement("canvas");
  canvas.width = W + 2;
  canvas.height = H + 2;
  const ctx = canvas.getContext("2d")!;
  const lit = (x: number, y: number) => y >= 0 && y < H && x >= 0 && x < W && rows[y][x] !== ".";
  // A one-pixel outline in the page's ink, so a dark jersey shows on a dark floor (and a white one on a light).
  if (outline) {
    ctx.fillStyle = outline;
    for (let y = -1; y <= H; y++)
      for (let x = -1; x <= W; x++) if (!lit(x, y) && (lit(x - 1, y) || lit(x + 1, y) || lit(x, y - 1) || lit(x, y + 1))) ctx.fillRect(x + 1, y + 1, 1, 1);
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = rows[y][x];
      if (c === ".") continue;
      ctx.fillStyle = colors[c];
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  if (number) {
    ctx.fillStyle = uniform.numbers;
    const digits = number.slice(-2);
    const left = digits.length === 1 ? 5 : 3;
    for (const [x, y] of glyphPixels(digits)) ctx.fillRect(left + x + 1, 5 + y + 1, 1, 1);
  }
  return canvas;
}

/** Who a play's shorthand names on a team, and their jersey number — or, named by no one, the team's starter at a position. */
function jerseyNumber(roster: RosterPlayer[] | undefined, label: string | null, position: string | null): string | null {
  if (!roster) return null;
  if (label) return roster.find((p) => labelNames(label, p.name))?.number ?? null;
  if (!position) return null;
  const starter = roster.filter((p) => p.position === position && p.number).sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99))[0];
  return starter?.number ?? null;
}

interface Playing {
  stage: Stage;
  /** Each player's looks, by frame. */
  sprites: Record<Frame, HTMLCanvasElement>[];
  start: number;
}

/**
 * Red Zone plays acted out on the room's floor by pixel players: a field laid on the floor — on a phone as wide as
 * the screen (a few of its squares long), from tablet width up, the left of the room to at most halfway across
 * (`area`) — and on it the play, set in its middle: the quarterback dropping back and throwing, the receiver
 * running out to catch it (+1, floating up off him), the runner taking the handoff to where he's brought down, the
 * gain written on the ground where it ended; each in his team's colors (white on the road), his number on his chest.
 * A play comes in, it's acted out (after any on already); tapped in the Red Zone, again.
 */
export function FloorPlay({
  width,
  height,
  share,
  area,
  clear,
}: {
  width: number;
  height: number;
  share: number;
  /** Where across the screen the field lies, from tablet width up (null on a phone: the whole width). */
  area: { left: number; right: number } | null;
  /** How far down the floor shows (screen y) when something stands in front of the rest (the Red Zone, up): the
   * field's brought back toward the horizon so all of it's over that. */
  clear: number | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const room = useRef({ width, height, share, area, clear });
  useEffect(() => {
    room.current = { width, height, share, area, clear };
  }, [width, height, share, area, clear]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const queue: PlayDetail[] = [];
    let current: Playing | null = null;
    let frame = 0;
    let preparing = false;
    // How far back the field's middle lies, eased toward where it should be as that changes (the Red Zone coming up).
    let lying: number | null = null;

    const css = () => {
      const s = getComputedStyle(document.documentElement);
      return {
        ink: s.getPropertyValue("--ink-primary").trim() || "#fff",
        page: s.getPropertyValue("--page").trim() || "#000",
        good: s.getPropertyValue("--status-good").trim() || "#2e7d32",
      };
    };

    const prepare = async (detail: PlayDetail): Promise<Playing | null> => {
      const scene = sceneFor(detail.play, detail.teams);
      if (!scene) return null;
      const stage = stageFor(scene);
      const rosters = await loadRosters();
      const { ink } = css();
      const positionOf = (a: StageActor) => (a.role === "qb" ? "QB" : null);
      const sprites = stage.actors.map((a) => {
        const uniform = uniformFor(a.team, a.team === detail.teams[0]);
        const number = jerseyNumber(rosters.get(a.team), a.label, positionOf(a));
        const frames = ["stand", "runA", "runB", "throw", "jump", "kick"] as Frame[];
        return Object.fromEntries(frames.map((f) => [f, paintSprite(uniform, number, f, ink)])) as Record<Frame, HTMLCanvasElement>;
      });
      return { stage, sprites, start: 0 };
    };

    const next = async () => {
      if (current || preparing) return;
      const detail = queue.shift();
      if (!detail) return;
      preparing = true;
      const playing = await prepare(detail);
      preparing = false;
      if (!playing) return next();
      // A tap while this was getting ready wins.
      if (current) return;
      playing.start = performance.now();
      current = playing;
      frame = requestAnimationFrame(draw);
    };

    const onPlay = (e: Event) => {
      const detail = (e as CustomEvent<PlayDetail>).detail;
      if (detail.now) {
        queue.length = 0;
        queue.push(detail);
        current = null;
        cancelAnimationFrame(frame);
        clear();
        void next();
        return;
      }
      if (reduced) return;
      queue.push(detail);
      while (queue.length > QUEUE) queue.shift();
      void next();
    };

    const clear = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const playing = current;
      if (!playing) return;
      const { width: w, height: h, share: sh, area: field, clear: over } = room.current;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      clear();
      const { stage, sprites } = playing;
      const elapsed = (now - playing.start) / 1000;
      const t = reduced ? stage.length : elapsed - FADE_IN;
      const total = stage.length + FADE_IN + FADE_OUT;
      if (elapsed >= total && !reduced) {
        current = null;
        void next();
        return;
      }
      if (reduced && elapsed >= stage.length + 1) {
        current = null;
        void next();
        return;
      }
      const fade = Math.min(1, elapsed / FADE_IN, Math.max(0, (total - elapsed) / FADE_OUT));
      const { ink, page, good } = css();

      // The field on the floor: where its middle lies (how far back, how far across), and a yard in floor px — its
      // near sideline (its widest) as wide as the screen (or its part of it) wherever it lies.
      const sin = Math.sin((FLOOR_TILT * Math.PI) / 180);
      const [left, right] = field ? [field.left, field.right] : [0.02 * w, 0.98 * w];
      const sized = (d: number) => {
        let long = (right - left) / floorScale(d);
        for (let i = 0; i < 6; i++) long = (right - left) / floorScale(d + (FIELD_WIDE / 2) * (long / FIELD_LONG));
        const near = floorScale(d + (FIELD_WIDE / 2) * (long / FIELD_LONG));
        return { long, across: ((left + right) / 2 - w / 2) / near };
      };
      let target = field ? floorDepth(h * sh + 0.42 * (h - h * sh), h, sh) : (PERSPECTIVE_PX - (PERSPECTIVE_PX * PHONE_SQUARES * GRID_PX) / w) / sin;
      // All of it over whatever stands in front of the floor's near part: its near sideline a little above that.
      const nearY = (d: number) => floorPoint(0, d + (FIELD_WIDE / 2) * (sized(d).long / FIELD_LONG), w, h, sh)[1];
      if (over !== null && nearY(target) > over - 6) {
        let [lo, hi] = [0, target];
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          if (nearY(mid) > over - 6) hi = mid;
          else lo = mid;
        }
        target = lo;
      }
      lying = lying === null ? target : lying + (target - lying) * 0.12;
      const back = lying;
      const { long, across } = sized(back);
      // A yard across the field, and the players' size: the field's depth and everything standing on it, as ever. Along
      // it, zoomed in to the play — as long as it reaches and some either side, across the screen.
      const base = long / FIELD_LONG;
      const reach = Math.max(stage.reach, stage.firstDown !== null ? Math.abs(stage.firstDown) : 0);
      const span = Math.min(FIELD_LONG, Math.max(MIN_SPAN, 2 * (reach + MARGIN)));
      const yard = long / span;
      const at = (x: number, z: number) => floorPoint(across + x * yard, back + z * base, w, h, sh);
      const px = (z: number) => base * floorScale(back + z * base);

      ctx.save();
      ctx.globalAlpha = fade;
      const quad = (x0: number, z0: number, x1: number, z1: number) => {
        ctx.beginPath();
        ctx.moveTo(...at(x0, z0));
        ctx.lineTo(...at(x1, z0));
        ctx.lineTo(...at(x1, z1));
        ctx.lineTo(...at(x0, z1));
        ctx.closePath();
      };
      const line = (x0: number, z0: number, x1: number, z1: number) => {
        ctx.beginPath();
        ctx.moveTo(...at(x0, z0));
        ctx.lineTo(...at(x1, z1));
        ctx.stroke();
      };
      const hz = FIELD_WIDE / 2;
      const half = span / 2;
      // The field under the play, its real yard lines where they are: the line of scrimmage on the yard line it was
      // snapped from (the goal line it's going for off to the right). Only as much as the play needs, fading off at
      // either end — but for its end line, where it ends.
      const goal = stage.toGoal !== null ? stage.los + stage.toGoal : null;
      const [from, to] = goal !== null ? [Math.max(-half, goal - 110), Math.min(half, goal + 10)] : [-half, half];
      const edge = (x: number) => Math.max(0, Math.min(1, (half - Math.abs(x)) / (span * 0.2)));
      const [gx0] = at(-half, 0);
      const [gx1] = at(half, 0);
      const shade = (alpha: number) => {
        const g = ctx.createLinearGradient(gx0, 0, gx1, 0);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.2, alpha === 1 ? page : ink);
        g.addColorStop(0.8, alpha === 1 ? page : ink);
        g.addColorStop(1, "transparent");
        return g;
      };
      // Laid over what's on the floor under it.
      ctx.fillStyle = shade(1);
      ctx.globalAlpha = fade * 0.7;
      quad(from, -hz, to, hz);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      if (goal !== null) {
        // Its end zones, shaded, as far as they show.
        ctx.globalAlpha = fade * 0.07;
        ctx.fillStyle = shade(0.07);
        for (const [a, b] of [
          [goal, goal + 10],
          [goal - 110, goal - 100],
        ]) {
          const [lo, hi] = [Math.max(a, -half), Math.min(b, half)];
          if (hi > lo) {
            quad(lo, -hz, hi, hz);
            ctx.fill();
          }
        }
        // A line every yard of it: across the field every five, hash marks between (zoomed in enough to see them),
        // the goal lines and the end lines stronger — and the tens numbered, near side.
        const font = getComputedStyle(document.body).fontFamily;
        for (let g = -10; g <= 110; g++) {
          const x = goal - g;
          if (x < -half || x > half) continue;
          const f = edge(x);
          if (g <= 0 || g >= 100) {
            if (g !== 0 && g !== 100 && g !== -10 && g !== 110) continue;
            ctx.globalAlpha = fade * 0.6 * Math.max(f, 0.35);
            ctx.lineWidth = 1.5;
            line(x, -hz, x, hz);
            continue;
          }
          ctx.lineWidth = 1;
          if (g % 5 === 0) {
            ctx.globalAlpha = fade * (g % 10 === 0 ? 0.32 : 0.16) * f;
            line(x, -hz, x, hz);
          } else if (yard * floorScale(back) > 5) {
            ctx.globalAlpha = fade * 0.22 * f;
            line(x, -hz * 0.3 - 0.8, x, -hz * 0.3 + 0.8);
            line(x, hz * 0.3 - 0.8, x, hz * 0.3 + 0.8);
          }
          if (g % 10 === 0) {
            const [sx, sy] = at(x, hz * 0.85);
            const size = Math.max(12, px(hz * 0.85) * 4);
            ctx.save();
            ctx.globalAlpha = fade * 0.5 * f;
            ctx.fillStyle = ink;
            ctx.font = `700 ${size}px ${font}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.translate(sx, sy);
            // Lying on the floor.
            ctx.scale(1, 0.6);
            ctx.fillText(String(g <= 50 ? g : 100 - g), 0, 0);
            ctx.restore();
          }
        }
      } else {
        // Where it was snapped from isn't known: lines every five yards from the line of scrimmage.
        ctx.lineWidth = 1;
        for (let x = stage.los - Math.ceil((stage.los + half) / 5) * 5; x <= half; x += 5) {
          if (x < -half) continue;
          ctx.globalAlpha = fade * 0.2 * edge(x);
          line(x, -hz, x, hz);
        }
      }

      // As on television: the line of scrimmage in blue, the line to gain for a first down in yellow — wires, a device
      // pixel wide like the floor's grid lines — then where the play ended, in the page's ink, once it has.
      ctx.globalAlpha = fade;
      ctx.lineWidth = 1 / dpr;
      ctx.strokeStyle = SCRIMMAGE;
      line(stage.los, -hz, stage.los, hz);
      if (stage.firstDown !== null) {
        ctx.strokeStyle = FIRST_DOWN;
        line(stage.firstDown, -hz, stage.firstDown, hz);
      }
      ctx.strokeStyle = ink;
      if (stage.end && t >= stage.end.t) {
        ctx.globalAlpha = fade * 0.95;
        ctx.lineWidth = 2;
        line(stage.end.x, -hz, stage.end.x, hz);
      }

      // What's written on the ground, in the page's own type, bold, lying on it — squashed less than the floor would
      // (it's laid back so far that, squashed as much, it couldn't be read), a little way in front of where it's set.
      const type = getComputedStyle(document.body).fontFamily;
      const flat = (text: string, x: number, z: number, color: string, alpha: number) => {
        const [sx, sy] = at(x, z);
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = fade * alpha;
        ctx.font = `700 ${Math.max(15, px(z) * 5.5)}px ${type}`;
        // Just past the line it's by, clear of it.
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.translate(sx + 4, sy);
        ctx.scale(1, 0.6);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      };
      for (const m of stage.marks) {
        if (t < m.t || m.kind === "plus") continue;
        const pop = Math.min(1, (t - m.t) / 0.25);
        if (m.kind === "yards") flat(m.text, m.x, m.z, ink, pop);
      }

      // A kick's goalposts: up from the ground, the bar across, the uprights up from it.
      if (stage.posts !== null) {
        const up = (x: number, z: number, hgt: number): [number, number] => {
          const [sx, sy] = at(x, z);
          return [sx, sy - hgt * px(z)];
        };
        ctx.globalAlpha = fade;
        ctx.strokeStyle = "#f2c94c";
        ctx.lineWidth = 2;
        const seg = (a: [number, number], b: [number, number]) => {
          ctx.beginPath();
          ctx.moveTo(...a);
          ctx.lineTo(...b);
          ctx.stroke();
        };
        seg(up(stage.posts, 0, 0), up(stage.posts, 0, 3.3));
        seg(up(stage.posts, -3.1, 3.3), up(stage.posts, 3.1, 3.3));
        seg(up(stage.posts, -3.1, 3.3), up(stage.posts, -3.1, 11));
        seg(up(stage.posts, 3.1, 3.3), up(stage.posts, 3.1, 11));
      }

      // The players, farthest first, each on his shadow; the ball with whoever has it, or in the air.
      ctx.imageSmoothingEnabled = false;
      const placed = stage.actors.map((a, i) => ({ i, a, ...actorAt(a, Math.max(0, t)) })).sort((p, q) => p.z - q.z);
      const ball = ballAt(stage, Math.max(0, t));
      const drawBall = (x: number, z: number, hgt: number) => {
        const unit = px(z) * 0.55;
        const [sx, sy] = at(x, z);
        if (hgt > 0.2) {
          ctx.globalAlpha = fade * 0.25;
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.ellipse(sx, sy, unit * 1.6, unit * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#8b5a2b";
        const by = sy - hgt * px(z);
        ctx.fillRect(Math.round(sx - unit * 1.5), Math.round(by - unit), Math.ceil(unit * 3), Math.ceil(unit * 2));
        ctx.fillStyle = "#f2f2f2";
        ctx.fillRect(Math.round(sx - unit * 0.5), Math.round(by - unit), Math.ceil(unit), Math.ceil(unit * 0.6));
      };
      for (const p of placed) {
        const unit = px(p.z) * 0.42;
        const [sx, sy] = at(p.x, p.z);
        ctx.globalAlpha = fade * 0.22;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(sx, sy, unit * 6, unit * 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = fade;
        const look = poseFrame(p.pose, p.moving, t);
        const sprite = sprites[p.i][look];
        const [sw, shh] = [(W + 2) * unit, (H + 2) * unit];
        if (p.pose === "down") {
          // Down on the ground, head the way he was going.
          const facing = facingOf(p.a);
          ctx.save();
          ctx.translate(sx, sy - unit * 2);
          ctx.rotate((facing * Math.PI) / 2);
          ctx.drawImage(sprite, -sw / 2, -shh / 2, sw, shh);
          ctx.restore();
        } else {
          const lift = p.pose === "jump" ? Math.abs(Math.sin(t * 7)) * px(p.z) * 1.4 : look === "runB" ? unit : 0;
          ctx.drawImage(sprite, Math.round(sx - sw / 2), Math.round(sy - shh - lift), sw, shh);
        }
        if (ball && "by" in ball && ball.by === p.i) {
          const hands = p.pose === "down" ? 0.4 : 2.4;
          // In his hands: a step off his middle, at his own size (not the field's zoom).
          drawBall(p.x + ((p.pose === "down" ? facingOf(p.a) * 2 : 0.9) * base) / yard, p.z + 0.3, hands);
        }
      }
      if (ball && !("by" in ball)) drawBall(ball.x, ball.z, ball.h);

      // +1 for the catch, floating up off whoever made it.
      for (const m of stage.marks) {
        if (m.kind !== "plus" || t < m.t || t > m.t + 1.6 || m.by === undefined) continue;
        const f = (t - m.t) / 1.6;
        const p = actorAt(stage.actors[m.by], m.t);
        const [sx, sy] = at(p.x, p.z);
        ctx.globalAlpha = fade * (1 - f * f * f);
        ctx.fillStyle = good;
        ctx.font = `700 ${Math.max(14, px(p.z) * 4.5)}px ${type}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        // From just over his helmet, up a few yards.
        ctx.fillText(m.text, sx, sy - (H + 2) * px(p.z) * 0.42 - 2 - f * 4 * px(p.z));
      }
      // What happened, in the page's own type, bold and in capitals, standing up over the far side — popping up as it does.
      for (const m of stage.marks) {
        if (m.kind !== "word" || t < m.t) continue;
        const pop = Math.min(1, (t - m.t) / 0.2);
        const size = Math.min(28, Math.max(14, px(-hz) * 4.5)) * (0.7 + 0.3 * pop);
        const [sx, sy] = at(m.x, -hz);
        ctx.globalAlpha = fade * pop;
        ctx.fillStyle = m.text === "TOUCHDOWN" || m.text === "GOOD" ? good : ink;
        ctx.font = `700 ${size}px ${type}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(m.text.toUpperCase(), sx, sy - 4);
      }
      ctx.restore();
      frame = requestAnimationFrame(draw);
    };

    window.addEventListener(PLAY_EVENT, onPlay);
    return () => {
      window.removeEventListener(PLAY_EVENT, onPlay);
      cancelAnimationFrame(frame);
      current = null;
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[4]" style={{ width, height }} />;
}

/** The look for how a player's standing: running strides back and forth every tenth of a second. */
function poseFrame(pose: Pose, moving: boolean, t: number): Frame {
  if (pose === "throw") return "throw";
  if (pose === "kick") return "kick";
  if (pose === "jump") return "jump";
  if (pose === "run" || moving) return Math.floor(t * 10) % 2 ? "runA" : "runB";
  return "stand";
}

/** Which way a player was last going along the field: 1 toward the right, -1 the left. */
function facingOf(actor: StageActor): 1 | -1 {
  const keys = actor.keys;
  for (let i = keys.length - 1; i > 0; i--) if (keys[i].x !== keys[i - 1].x) return keys[i].x > keys[i - 1].x ? 1 : -1;
  return 1;
}
