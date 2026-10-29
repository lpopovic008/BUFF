"use client";

import { useEffect, useRef } from "react";
import type { GamePlay } from "@/lib/play-by-play";
import { labelNames } from "@/lib/play-lines";
import { actorAt, ballAt, formation, PlayScene, Pose, sceneFor, Stage, StageActor, stageFor } from "@/lib/play-scene";
import { loadRosters, RosterPlayer } from "@/lib/players";
import { uniformFor, Uniform } from "@/lib/team-colors";
import { FLOOR_TILT, floorDepth, floorPoint, floorScale, floorY, GRID_PX, PERSPECTIVE_PX } from "@/lib/grid-room";

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
// wide, in yards (end zones and all); how long a play takes to come in (s); and how many plays wait their turn.
const PHONE_SQUARES = 3.3;
const FIELD_LONG = 120;
const FIELD_WIDE = 53.3;
const FADE_IN = 0.35;
// Along the field: how much of the screen's width a play takes from where it starts to where it ends; a yard at most
// (as a share of the screen's width) and at least (px), however short or long it is; and set up for the next one,
// how far either way from its line of scrimmage it shows as much as.
const PLAY_SHARE = 0.5;
const MOST_YARD = 0.035;
const LEAST_YARD = 4;
const READY_REACH = 10;
// How long the field takes to slide over to the next line of scrimmage and the players to line up on it (s).
const RESET = 1.2;
// From tablet width up, the floor the field lies on: from just under the horizon down to whatever stands in front of
// it (the Red Zone), or this far down to the screen's bottom; and a player's pixel there at most (px).
const DESK_FLOOR = 0.6;
const MOST_PIXEL = 4;
// How far past the near sideline the field reaches down (yards); how far in from either sideline its numbers' feet are.
const NUMBERS = 2;
const FIELD_NUMBERS = 7;
// The line of scrimmage and the line to gain, colored as on television.
const SCRIMMAGE = "#2f7cf6";
const FIRST_DOWN = "#f5d020";
// A penalty flag's yellow; a coach's challenge flag's red.
const FLAG = { yellow: "#f5d020", red: "#e5383b" };
// What happened, over the field: how big (px; from tablet width up, and on a phone), each line over the last.
const WORD_PX = { desk: 20, phone: 15 };
const WORD_LINE = 1.15;
// How far back past the far sideline the field's lines run, as a share of half its width.
const FAR_REACH = 1.7;
// How much farther back than otherwise the field and its play lie, as a share of how far back they'd be.
const BACK_SHARE = 0.9;
const QUEUE = 3;
// How many of the floor's squares in front of the back of the room the field's farthest reach stays.
const BACK_SQUARES = 2;

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
  /** Where each lines up for the next play (see formation). */
  spots: [number, number][];
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
  onPlaying,
}: {
  width: number;
  height: number;
  share: number;
  /** Where across the screen the field lies, from tablet width up (null on a phone: the whole width). */
  area: { left: number; right: number } | null;
  /** How far down the floor shows (screen y) when something stands in front of the rest (the Red Zone, up): the
   * field's brought back toward the horizon so all of it's over that. */
  clear: number | null;
  /** Told when a play starts being acted out (true), and when it's over — set up for the next, none following it. */
  onPlaying?: (playing: boolean) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const room = useRef({ width, height, share, area, clear });
  const told = useRef(onPlaying);
  useEffect(() => {
    told.current = onPlaying;
  }, [onPlaying]);
  // Drawn again when the room changes under a play that's set up and waiting.
  const redraw = useRef(() => {});
  useEffect(() => {
    room.current = { width, height, share, area, clear };
    redraw.current();
  }, [width, height, share, area, clear]);

  useEffect(() => {
    const el = ref.current;
    const context = el?.getContext("2d");
    if (!el || !context) return;
    const [canvas, ctx] = [el, context];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const queue: PlayDetail[] = [];
    let current: Playing | null = null;
    let frame = 0;
    let preparing = false;

    const css = () => {
      const s = getComputedStyle(document.documentElement);
      return {
        ink: s.getPropertyValue("--ink-primary").trim() || "#fff",
        page: s.getPropertyValue("--page").trim() || "#000",
        good: s.getPropertyValue("--status-good").trim() || "#2e7d32",
      };
    };

    // A play, and what's acted out right after it (a touchdown's try; the play as it stands once a review reversed it).
    const prepare = async (detail: PlayDetail): Promise<Playing[]> => {
      const scenes: PlayScene[] = [];
      for (let scene = sceneFor(detail.play, detail.teams); scene; scene = scene.after) scenes.push(scene);
      if (!scenes.length) return [];
      const rosters = await loadRosters();
      const { ink } = css();
      const positionOf = (a: StageActor) => (a.role === "qb" ? "QB" : null);
      return scenes.map((scene) => {
        // A run by the quarterback that wasn't a scramble: his own, not handed off.
        const runner = scene.kind === "run" && !scene.scramble && scene.runner ? scene.runner : null;
        const keeper = !!runner && rosters.get(scene.offense)?.find((p) => labelNames(runner, p.name))?.position === "QB";
        const stage = stageFor({ ...scene, keeper });
        const sprites = stage.actors.map((a) => {
          const uniform = uniformFor(a.team, a.team === detail.teams[0]);
          const number = jerseyNumber(rosters.get(a.team), a.label, positionOf(a));
          const frames = ["stand", "runA", "runB", "throw", "jump", "kick"] as Frame[];
          return Object.fromEntries(frames.map((f) => [f, paintSprite(uniform, number, f, ink)])) as Record<Frame, HTMLCanvasElement>;
        });
        return { stage, sprites, spots: formation(stage), start: 0 };
      });
    };
    // Those waiting to follow the one on now, straight after it.
    let following: Playing[] = [];

    // How far along a play is (s, from its snap): before it, during it, then lining up for the next — and once that's
    // done, set up and waiting.
    const along = (playing: Playing, now: number) => (reduced ? playing.stage.length + RESET : (now - playing.start) / 1000 - FADE_IN);
    const ready = (playing: Playing, now: number) => along(playing, now) >= playing.stage.length + RESET;
    // The one before, set up where it left off, fading away as the next comes in.
    let leaving: { playing: Playing; since: number } | null = null;
    let looping = false;
    const loop = () => {
      if (looping) return;
      looping = true;
      frame = requestAnimationFrame(draw);
    };

    // The next play in its turn — after the one on now is over and set up for it; tapped (`force`), straight away.
    const next = async (force = false) => {
      if (preparing) return;
      if (!force && current && !ready(current, performance.now())) return;
      let playing = following.shift();
      if (!playing) {
        const detail = queue.shift();
        if (!detail) return;
        preparing = true;
        [playing, ...following] = await prepare(detail);
        preparing = false;
        if (!playing) return next(force);
      }
      const now = performance.now();
      if (current) leaving = { playing: current, since: now };
      playing.start = now;
      current = playing;
      loop();
    };

    const onPlay = (e: Event) => {
      const detail = (e as CustomEvent<PlayDetail>).detail;
      if (detail.now) {
        queue.length = 0;
        following = [];
        queue.push(detail);
        void next(true);
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

    // How deep the field lies and how big what's on it is (floor px a yard across it), eased as that changes.
    let settledAt: { back: number; base: number; left: number; right: number; middle: number } | null = null;
    // Whether a play's being acted out, as last told.
    let acting = false;
    const tell = (now: boolean) => {
      if (now === acting) return;
      acting = now;
      told.current?.(now);
    };

    const draw = (now: number) => {
      looping = false;
      const playing = current;
      if (!playing) return;
      const { width: w, height: h, share: sh, area: field, clear: over } = room.current;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      clear();
      const horizon = h * sh;
      const sin = Math.sin((FLOOR_TILT * Math.PI) / 180);
      const hz = FIELD_WIDE / 2;
      // Where the field lies across the screen (its part of it), and where on the screen a play's middle goes: the
      // middle of the screen, or as near as leaves its far end short of the starters list beside it.
      const [left0, right0] = field ? [field.left, field.right] : [0.02 * w, 0.98 * w];
      // Over the field, room for what's said of the play (as many lines as it has): the field starts under it — and no
      // farther back than two of the floor's squares in front of the back of the room.
      const wordPx = field ? WORD_PX.desk : WORD_PX.phone;
      const lines = Math.max(1, ...playing.stage.marks.map((m) => (m.kind === "word" ? (m.row ?? 0) + 1 : 0)));
      const top = Math.max(floorY(BACK_SQUARES * GRID_PX, h, sh), horizon + 6 + lines * wordPx * WORD_LINE + 4);
      const middle0 = field ? Math.min(w / 2, right0 - (PLAY_SHARE * w) / 2) : w / 2;
      // The highest anything of it stands on the screen, lying `bk` back, a yard across it `bs`: its far sideline, or the
      // head of whoever's farthest back on it, standing up over that.
      const zMin = Math.min(0, ...playing.stage.actors.flatMap((a) => a.keys.map((k) => k.z)));
      const highest = (bk: number, bs: number) =>
        Math.min(floorPoint(0, bk - hz * bs, w, h, sh)[1], floorPoint(0, bk + zMin * bs, w, h, sh)[1] - (H + 3) * 0.42 * bs * floorScale(bk + zMin * bs));
      // Down from `from` to whatever stands in front of the floor (from tablet width up, or this far down it), as big
      // as fits — its far sideline at `from`, the numbers past its near one just over the bottom — up to `most`; moved
      // down until all of it's under the words.
      const bottom = over ?? (field ? horizon + DESK_FLOOR * (h - horizon) : h - 6);
      const fit = (most: (bk: number) => number): [number, number] => {
        let from = top;
        let fitted: [number, number] = [0, 0];
        for (let i = 0; i < 6; i++) {
          const [far, near] = [floorDepth(from, h, sh), floorDepth(bottom - 6, h, sh)];
          let bs = (near - far) / (2 * hz + NUMBERS);
          bs = Math.min(bs, most(far + hz * bs));
          fitted = [far + hz * bs, bs];
          const short = top - highest(...fitted);
          if (short <= 0.5) break;
          from += short;
        }
        return fitted;
      };
      // How deep it lies, and a yard across it in floor px (how big the players are). On a phone: its near sideline as
      // wide as the screen, a few of the floor's squares long, over whatever stands in front of the floor's near part.
      // From tablet width up: filling the floor from under the words to what stands in front of it.
      let back: number;
      let base: number;
      if (field) {
        [back, base] = fit((bk) => MOST_PIXEL / (0.42 * floorScale(bk)));
      } else {
        const sized = (d: number) => {
          let long = (right0 - left0) / floorScale(d);
          for (let i = 0; i < 6; i++) long = (right0 - left0) / floorScale(d + hz * (long / FIELD_LONG));
          return long / FIELD_LONG;
        };
        back = BACK_SHARE * ((PERSPECTIVE_PX - (PERSPECTIVE_PX * PHONE_SQUARES * GRID_PX) / w) / sin);
        const nearY = (d: number) => floorPoint(0, d + hz * sized(d), w, h, sh)[1];
        if (over !== null && nearY(back) > over - 6) {
          let [lo, hi] = [0, back];
          for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (nearY(mid) > over - 6) hi = mid;
            else lo = mid;
          }
          back = lo;
        }
        base = sized(back);
        // Up into the room for the words: under them instead, no bigger than that, as big as fits.
        if (highest(back, base) < top) {
          const most = base;
          [back, base] = fit(() => most);
        }
      }
      // Eased there as any of it changes (the Red Zone coming up; the starters list going up out of its way and back).
      const to = { back, base, left: left0, right: right0, middle: middle0 };
      const from = settledAt ?? to;
      const ease = (a: number, b: number) => a + (b - a) * 0.12;
      const eased = { back: ease(from.back, back), base: ease(from.base, base), left: ease(from.left, left0), right: ease(from.right, right0), middle: ease(from.middle, middle0) };
      const still =
        Math.abs(eased.back - back) < 0.05 &&
        Math.abs(eased.base - base) < 0.0005 &&
        [eased.left - left0, eased.right - right0, eased.middle - middle0].every((d) => Math.abs(d) < 0.5);
      settledAt = eased;
      const { left, right, middle } = eased;
      const { ink, page, good } = css();

      if (leaving && now - leaving.since > FADE_IN * 1000) leaving = null;
      if (leaving) drawScene(leaving.playing, now, 1 - (now - leaving.since) / (FADE_IN * 1000));
      drawScene(playing, now, 1);
      // Moving (or the field easing to where it lies): on to the next frame. Set up and waiting, still: done, until
      // the next play or the room changes — and the next play, if one's waiting.
      if (!ready(playing, now) || leaving || !still) loop();
      else void next();
      // (The one on now: the next, if it's just been put on.)
      tell((current !== null && !ready(current, now)) || following.length > 0 || queue.length > 0 || preparing);

      function drawScene(playing: Playing, now: number, alpha: number) {
        const { stage, sprites, spots } = playing;
        const t = along(playing, now);
        // Lining up for the next play: how far through it (eased).
        const r = Math.min(1, Math.max(0, (t - stage.length) / RESET));
        const f = r * r * (3 - 2 * r);
        const fade = alpha * (reduced ? 1 : Math.min(1, (now - playing.start) / 1000 / FADE_IN));
        // What's left of the play itself as it gives way to the next.
        const gone = fade * (1 - f);
        const back = eased.back;
        const base = eased.base;
        // Along the field: the play from where it starts to where it ends across the middle half of the screen (no
        // more than so big a yard, nor less) — and, lining up for the next, sliding over to its line of scrimmage.
        const playReach = Math.max(stage.reach, stage.firstDown !== null ? Math.abs(stage.firstDown) : 0, 1);
        const reach = playReach + (READY_REACH - playReach) * f;
        const yardPx = Math.min(MOST_YARD * w, Math.max(LEAST_YARD, (PLAY_SHARE * w) / (2 * reach)));
        const yard = yardPx / floorScale(back);
        const across = (middle - w / 2) / floorScale(back);
        const cx = stage.next * f;
        const at = (x: number, z: number) => floorPoint(across + (x - cx) * yard, back + z * base, w, h, sh);
        const px = (z: number) => base * floorScale(back + z * base);

        ctx.save();
        // Nothing of it outside its part of the screen (from tablet width up, over the starters list).
        ctx.beginPath();
        ctx.rect(left, 0, right - left, h);
        ctx.clip();
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
        // Its lines run on back past the far sideline, over more of the room — but not past the horizon.
        const far = Math.max(hz, Math.min(hz * FAR_REACH, (back - floorDepth(top, h, sh)) / base));
        // What of it shows across the screen (its part of it), along the field.
        const [from0, to0] = [cx + (left - middle) / yardPx, cx + (right - middle) / yardPx];
        const span = to0 - from0;
        // The field under the play, its real yard lines where they are: the line of scrimmage on the yard line it was
        // snapped from (the goal line it's going for off to the right). Fading off at either end — but for its end
        // line, where it ends.
        const goal = stage.toGoal !== null ? stage.los + stage.toGoal : null;
        const [from, to] = goal !== null ? [Math.max(from0, goal - 110), Math.min(to0, goal + 10)] : [from0, to0];
        const edge = (x: number) => Math.max(0, Math.min(1, Math.min(x - from0, to0 - x) / (span * 0.1)));
        // Painted on the field, lying on it in the floor's own perspective: a digit `wide` yards across, as deep as
        // reads (not squashed flat), its near edge at `z` — the other way up (`flip`) on the far side, as a field's
        // numbers are — from its left edge at `x` (its right, flipped). In the page's own type, bold.
        const type = getComputedStyle(document.body).fontFamily;
        const digitWide = Math.max(1.3, 9 / yardPx);
        const digitGap = Math.max(0.45, 4 / yardPx);
        const paint = (ch: string, x: number, z: number, flip: boolean) => {
          ctx.save();
          ctx.font = `700 100px ${type}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          const m = ctx.measureText(ch);
          const tall = m.actualBoundingBoxAscent || 72;
          // The floor's directions where it lies: a yard along the field, and a yard toward you, on the screen.
          const mid = x + (flip ? -digitWide / 2 : digitWide / 2);
          const [ox, oy] = at(mid, z);
          const [ax, ay] = at(mid + 1, z);
          const [bx, by] = at(mid, z + 1);
          const along = [ax - ox, ay - oy];
          const toward = [bx - ox, by - oy];
          // As deep as about three quarters of its width shows, in yards toward you.
          const deep = Math.min(9, Math.max(1, (0.75 * digitWide * Math.hypot(along[0], along[1])) / Math.max(0.01, Math.abs(toward[1]))));
          const [su, sv] = [(flip ? -1 : 1) * (digitWide / m.width), (flip ? -1 : 1) * (deep / tall)];
          const [px0, py0] = at(x, z);
          ctx.transform(along[0] * su, along[1] * su, toward[0] * sv, toward[1] * sv, px0, py0);
          ctx.fillText(ch, 0, 0);
          ctx.restore();
          return deep;
        };
        // A number painted by a line at `x`: two digits either side of it, clear of it; otherwise just past it.
        const paintBy = (text: string, x: number, z: number, flip = false) => {
          const [l, r] = flip ? [x + digitGap + digitWide, x - digitGap] : [x - digitGap - digitWide, x + digitGap];
          if (/^\d\d$/.test(text)) {
            paint(text[0], l, z, flip);
            paint(text[1], r, z, flip);
          } else [...text].forEach((ch, i) => paint(ch, r + (flip ? -1 : 1) * i * digitWide, z, flip));
        };
        const [gx0] = at(from0, 0);
        const [gx1] = at(to0, 0);
        const shade = (alpha: number) => {
          const g = ctx.createLinearGradient(gx0, 0, gx1, 0);
          g.addColorStop(0, "transparent");
          g.addColorStop(0.1, alpha === 1 ? page : ink);
          g.addColorStop(0.9, alpha === 1 ? page : ink);
          g.addColorStop(1, "transparent");
          return g;
        };
        // A cloud on the floor under it, soft at its edges: none of the floor's grid lines showing through.
        {
          const [x0, x1] = [Math.max(from, from0 + span * 0.06), Math.min(to, to0 - span * 0.06)];
          const [a, b, c, d] = [at(x0, -far), at(x1, -far), at(x1, hz + NUMBERS), at(x0, hz + NUMBERS)];
          // Soft as far as it's deep allows; out past the field by as much, so all of the field's on its solid middle.
          const blur = Math.min(24, (d[1] - a[1]) / 3);
          const out = blur * 0.8;
          // Only its blurred shadow drawn (the shape itself off the screen), so it fades out evenly all round.
          const away = 10000;
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.fillStyle = page;
          ctx.shadowColor = page;
          ctx.shadowBlur = blur * dpr;
          ctx.shadowOffsetX = -away * dpr;
          ctx.beginPath();
          ctx.moveTo(a[0] + away, a[1] - out);
          ctx.lineTo(b[0] + away, b[1] - out);
          ctx.lineTo(c[0] + away, c[1] + out);
          ctx.lineTo(d[0] + away, d[1] + out);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
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
            const [lo, hi] = [Math.max(a, from0), Math.min(b, to0)];
            if (hi > lo) {
              quad(lo, -far, hi, hz);
              ctx.fill();
            }
          }
          // A line every yard of it: across the field every five, hash marks between (zoomed in enough to see them),
          // the goal lines and the end lines stronger.
          for (let g = -10; g <= 110; g++) {
            const x = goal - g;
            if (x < from0 || x > to0) continue;
            const e = edge(x);
            if (g <= 0 || g >= 100) {
              if (g !== 0 && g !== 100 && g !== -10 && g !== 110) continue;
              ctx.globalAlpha = fade * 0.6 * Math.max(e, 0.35);
              ctx.lineWidth = 1.5;
              line(x, -far, x, hz);
              continue;
            }
            ctx.lineWidth = 1;
            if (g % 5 === 0) {
              ctx.globalAlpha = fade * (g % 10 === 0 ? 0.32 : 0.16) * e;
              line(x, -far, x, hz);
            } else if (yardPx > 5) {
              ctx.globalAlpha = fade * 0.22 * e;
              line(x, -hz * 0.3 - 0.8, x, -hz * 0.3 + 0.8);
              line(x, hz * 0.3 - 0.8, x, hz * 0.3 + 0.8);
            }
            // The tens numbered on the field, near each sideline, the line between their digits — the far side's the
            // other way up.
            if (g % 10 === 0) {
              ctx.globalAlpha = fade * 0.45 * e;
              ctx.fillStyle = ink;
              const n = String(g <= 50 ? g : 100 - g);
              paintBy(n, x, hz - FIELD_NUMBERS);
              paintBy(n, x, -hz + FIELD_NUMBERS, true);
            }
          }
        } else {
          // Where it was snapped from isn't known: lines every five yards from the line of scrimmage.
          ctx.lineWidth = 1;
          for (let x = stage.los + Math.ceil((from0 - stage.los) / 5) * 5; x <= to0; x += 5) {
            ctx.globalAlpha = fade * 0.2 * edge(x);
            line(x, -far, x, hz);
          }
        }

        // As on television: the line of scrimmage in blue, the line to gain for a first down in yellow — wires, a device
        // pixel wide like the floor's grid lines — then where the play ended, in the page's ink, once it has. Lining
        // up for the next play: the next line of scrimmage, blue.
        ctx.lineWidth = 1 / dpr;
        ctx.strokeStyle = SCRIMMAGE;
        ctx.globalAlpha = gone;
        line(stage.los, -far, stage.los, hz);
        if (f > 0) {
          ctx.globalAlpha = fade * f;
          line(stage.next, -far, stage.next, hz);
        }
        if (stage.firstDown !== null) {
          ctx.globalAlpha = gone;
          ctx.strokeStyle = FIRST_DOWN;
          line(stage.firstDown, -far, stage.firstDown, hz);
        }
        ctx.strokeStyle = ink;
        if (stage.end && t >= stage.end.t) {
          ctx.globalAlpha = gone * 0.95;
          ctx.lineWidth = 2;
          line(stage.end.x, -far, stage.end.x, hz);
        }

        // The yards gained, painted on the field by the line where the play ended, as its numbers are.
        for (const m of stage.marks) {
          if (t < m.t || m.kind !== "yards") continue;
          ctx.globalAlpha = gone * Math.min(1, (t - m.t) / 0.25);
          ctx.fillStyle = ink;
          paintBy(m.text, m.x, m.z);
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

        // The players, farthest first, each on his shadow; the ball with whoever has it, or in the air. Lining up for
        // the next play, each up off the ground and over to his spot (see formation), the ball rolled to the new line.
        ctx.imageSmoothingEnabled = false;
        const playT = Math.min(Math.max(0, t), stage.length);
        const placed = stage.actors
          .map((a, i) => {
            const end = actorAt(a, playT);
            if (f === 0) return { i, a, ...end };
            const [sx, sz] = spots[i];
            const [x, z] = [end.x + (sx - end.x) * f, end.z + (sz - end.z) * f];
            const far = Math.hypot(sx - end.x, sz - end.z) > 0.5;
            return { i, a, x, z, pose: (f < 1 && far ? "run" : "stand") as Pose, moving: f < 1 && far };
          })
          .sort((p, q) => p.z - q.z);
        const ballNow = ballAt(stage, playT);
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
        // Where the ball was when the play ended (with whoever had it, or where it lay), for rolling it to the new line.
        const ballEnd = (): [number, number] => {
          if (ballNow && "by" in ballNow) {
            const holder = actorAt(stage.actors[ballNow.by], playT);
            return [holder.x, holder.z];
          }
          return ballNow ? [ballNow.x, ballNow.z] : [stage.next, 0];
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
          } else if (p.pose === "kneel") {
            // Down on a knee: no legs showing, his pants on the ground.
            const rows = 13;
            ctx.drawImage(sprite, 0, 0, W + 2, rows, Math.round(sx - sw / 2), Math.round(sy - rows * unit), sw, rows * unit);
          } else {
            const lift = p.pose === "jump" ? Math.abs(Math.sin(t * 7)) * px(p.z) * 1.4 : look === "runB" ? unit : 0;
            ctx.drawImage(sprite, Math.round(sx - sw / 2), Math.round(sy - shh - lift), sw, shh);
          }
          if (f === 0 && ballNow && "by" in ballNow && ballNow.by === p.i) {
            const hands = p.pose === "down" ? 0.4 : 2.4;
            // In his hands: a step off his middle, at his own size (not the field's zoom).
            drawBall(p.x + ((p.pose === "down" ? facingOf(p.a) * 2 : 0.9) * base) / yard, p.z + 0.3, hands);
          }
        }
        if (f > 0) {
          const [bx, bz] = ballEnd();
          drawBall(bx + (stage.next - bx) * f, bz * (1 - f), 0);
        } else if (ballNow && !("by" in ballNow)) drawBall(ballNow.x, ballNow.z, ballNow.h);

        // A flag: thrown in from the side, tumbling, and lying where it lands.
        for (const flag of stage.flags) {
          if (t < flag.t) continue;
          const { from: [x0, z0], to: [x1, z1] } = flag;
          const fl = Math.min(1, (t - flag.t) / 0.5);
          const [x, z] = [x0 + (x1 - x0) * fl, z0 + (z1 - z0) * fl];
          const lift = (2 * (1 - fl) + 12 * fl * (1 - fl)) * px(z);
          const unit = px(z) * 0.5;
          const [sx, sy] = at(x, z);
          ctx.globalAlpha = gone;
          ctx.fillStyle = FLAG[flag.color];
          ctx.save();
          ctx.translate(sx, sy - lift - unit);
          if (fl < 1) ctx.rotate(t * 12);
          ctx.fillRect(-unit * 1.6, -unit, unit * 3.2, unit * (fl < 1 ? 2 : 1.2));
          ctx.restore();
        }

        // +1 for the catch, floating up off whoever made it.
        for (const m of stage.marks) {
          if (m.kind !== "plus" || t < m.t || t > m.t + 1.6 || m.by === undefined) continue;
          const fl = (t - m.t) / 1.6;
          const p = actorAt(stage.actors[m.by], m.t);
          const [sx, sy] = at(p.x, p.z);
          ctx.globalAlpha = fade * (1 - fl * fl * fl);
          ctx.fillStyle = good;
          ctx.font = `700 ${Math.max(14, px(p.z) * 4.5)}px ${type}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          // From just over his helmet, up a few yards.
          ctx.fillText(m.text, sx, sy - (H + 2) * px(p.z) * 0.42 - 2 - fl * 4 * px(p.z));
        }
        // What happened, in the page's own type, bold and in capitals, over the whole field (none of it on it) and under
        // the horizon (on a phone, the starters list is over it) — popping up as it does, one line over another.
        // The first on top, the rest under it in turn, the last just over the field.
        const lines = Math.max(1, ...stage.marks.map((m) => (m.kind === "word" ? (m.row ?? 0) + 1 : 0)));
        const fieldTop = Math.min(at(0, -far)[1], highest(back, base)) - 4;
        for (const m of stage.marks) {
          if (m.kind !== "word" || t < m.t) continue;
          const pop = Math.min(1, (t - m.t) / 0.2);
          const size = wordPx * (0.7 + 0.3 * pop);
          // All over the middle of the play.
          const [sx] = at(0, -far);
          ctx.globalAlpha = gone * pop;
          ctx.fillStyle = m.tone === "good" ? good : ink;
          ctx.font = `700 ${size}px ${type}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(m.text.toUpperCase(), sx, fieldTop - (lines - 1 - (m.row ?? 0)) * wordPx * WORD_LINE);
        }
        ctx.restore();
      }
    };
    redraw.current = loop;

    window.addEventListener(PLAY_EVENT, onPlay);
    return () => {
      window.removeEventListener(PLAY_EVENT, onPlay);
      cancelAnimationFrame(frame);
      current = null;
      redraw.current = () => {};
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
