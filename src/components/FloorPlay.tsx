"use client";

import { useEffect, useRef } from "react";
import type { GamePlay } from "@/lib/play-by-play";
import { labelNames } from "@/lib/play-lines";
import { actorAt, ballAt, formation, PlayScene, Pose, sceneFor, Stage, StageActor, stageFor } from "@/lib/play-scene";
import { loadRosters, RosterPlayer } from "@/lib/players";
import { uniformFor, Uniform } from "@/lib/team-colors";
import { floorDepth, floorPoint, floorScale, GRID_PX, HOME_CAMERA } from "@/lib/grid-room";
import type { FloorCameraStore } from "@/lib/floor-camera";

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

// The field: how wide it is, in yards; how long a play takes to come in (s); and how many plays wait their turn.
const FIELD_WIDE = 53.3;
const FADE_IN = 0.35;
// How much of the screen's width a play takes at most, from where it starts to where it ends: a square of the floor's
// grid five yards of the field, or ten or twenty to fit one that long.
const PLAY_FIT = 0.8;
const SQUARE_YARDS = [5, 10, 20];
// How long the floor takes to slide over to the next line of scrimmage and the players to line up on it (s).
const RESET = 1.2;
// The field's numbers: how far in from the far sideline their feet are (yards), and how far down the screen the near
// side's are.
const FIELD_NUMBERS = 7;
const NEAR_NUMBERS = 0.975;
// The line of scrimmage and the line to gain, colored as on television.
const SCRIMMAGE = "#2f7cf6";
const FIRST_DOWN = "#f5d020";
// A penalty flag's yellow; a coach's challenge flag's red.
const FLAG = { yellow: "#f5d020", red: "#e5383b" };
// What happened, up over the horizon: how big (px; from tablet width up, and on a phone), each line over the last.
const WORD_PX = { desk: 20, phone: 16 };
const WORD_LINE = 1.15;
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
  /** Where each lines up for the next play (see formation). */
  spots: [number, number][];
  start: number;
  /** Where it lies on the floor's grid (set as it comes on): how many yards a square of it is, and where across the
   * floor (px, before the floor's moved) the play's middle is; and whether the floor's been slid over to the next
   * play's line of scrimmage yet. */
  grid?: { yards: number; x0: number; slid: boolean };
}

/**
 * Red Zone plays acted out on the room's floor by pixel players: the whole floor a field, its grid's lines the yard
 * lines (moved and zoomed with it, `camera`), and on it the play, in the middle of the screen: the quarterback
 * dropping back and throwing, the receiver running out to catch it (+1, floating up off him), the runner taking the
 * handoff to where he's brought down, the gain painted on the field where it ended; each in his team's colors (white
 * on the road), his number on his chest. A play comes in, it's acted out (after any on already); tapped in the Red
 * Zone, again. Whatever stands on the floor, it's acted out behind.
 */
export function FloorPlay({
  width,
  height,
  share,
  camera,
  steer = false,
  onShown,
}: {
  width: number;
  height: number;
  share: number;
  /** The floor's camera: the field's laid on its grid, moved and zoomed with it. */
  camera?: FloorCameraStore;
  /** Whether the floor may be slid over to center each next play's line of scrimmage (the Red Zone up, the floor ours). */
  steer?: boolean;
  /** Told when a field comes onto the floor (true) and when it's gone off it again — tapped away. */
  onShown?: (shown: boolean) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const room = useRef({ width, height, share, camera, steer });
  const told = useRef(onShown);
  useEffect(() => {
    told.current = onShown;
  }, [onShown]);
  // Drawn again when the room changes under a play that's set up and waiting.
  const redraw = useRef(() => {});
  useEffect(() => {
    room.current = { width, height, share, camera, steer };
    redraw.current();
  }, [width, height, share, camera, steer]);
  // Drawn again as the floor moves.
  useEffect(() => camera?.subscribe(() => redraw.current()), [camera]);

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
    let settledAt: { back: number; base: number } | null = null;

    // Whether there's a field on the floor, as last told.
    let shown = false;
    const tell = (now: boolean) => {
      if (now === shown) return;
      shown = now;
      told.current?.(now);
    };

    const draw = (now: number) => {
      looping = false;
      const playing = current;
      if (!playing && !leaving) {
        clear();
        return tell(false);
      }
      tell(true);
      const { width: w, height: h, share: sh, camera: store, steer } = room.current;
      const cam = store?.get().camera ?? HOME_CAMERA;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      clear();
      const horizon = h * sh;
      const hz = FIELD_WIDE / 2;
      const wordPx = w >= 768 ? WORD_PX.desk : WORD_PX.phone;
      // The whole floor: its far sideline on the grid's first line in front of the back of the room, its near one at
      // the screen's bottom — how far back its middle lies, and a yard across it in floor px (how big the players are).
      const [farSide, nearSide] = [GRID_PX, floorDepth(h, h, sh)];
      const to = { base: (nearSide - farSide) / (2 * hz), back: 0 };
      to.back = farSide + hz * to.base;
      const from = settledAt ?? to;
      const ease = (a: number, b: number) => a + (b - a) * 0.12;
      const eased = { back: ease(from.back, to.back), base: ease(from.base, to.base) };
      const still = Math.abs(eased.back - to.back) < 0.05 && Math.abs(eased.base - to.base) < 0.0005;
      settledAt = eased;
      const { ink, good } = css();

      if (leaving && now - leaving.since > FADE_IN * 1000) leaving = null;
      if (leaving) drawScene(leaving.playing, now, 1 - (now - leaving.since) / (FADE_IN * 1000));
      if (playing) drawScene(playing, now, 1);
      // Moving (or the field easing to where it lies, or fading off): on to the next frame. Set up and waiting, still:
      // done, until the next play or the room changes — and the next play, if one's waiting.
      if ((playing && !ready(playing, now)) || leaving || !still) loop();
      else if (playing) void next();
      else tell(false);

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
        const playReach = Math.max(stage.reach, stage.firstDown !== null ? Math.abs(stage.firstDown) : 0, 1);
        const goal = stage.toGoal !== null ? stage.los + stage.toGoal : null;
        // Laid on the floor's grid, its lines the field's — a square of it five yards (ten, twenty: as many as fit the
        // play across most of the screen): the play's middle on the screen's middle (as near as puts a yard line on
        // one of the grid's) — and, lining up for the next, the floor slid over to put its line of scrimmage there.
        if (!playing.grid) {
          const yards = SQUARE_YARDS.find((y) => ((2 * playReach) / y) * GRID_PX * cam.zoom * floorScale(back) <= PLAY_FIT * w) ?? SQUARE_YARDS.at(-1)!;
          const Y = GRID_PX / yards;
          const ref = goal !== null ? goal - Math.round(goal / yards) * yards : stage.los - Math.round(stage.los / yards) * yards;
          const want = -cam.x / cam.zoom + ref * Y;
          playing.grid = { yards, x0: (Math.round(want / GRID_PX - 0.5) + 0.5) * GRID_PX - ref * Y, slid: false };
        }
        const grid = playing.grid;
        if (steer && store && alpha === 1 && f > 0 && !grid.slid) {
          grid.slid = true;
          store.glide({ ...cam, x: -(grid.x0 + (stage.next * GRID_PX) / grid.yards) * cam.zoom }, false);
        }
        const yard = (GRID_PX / grid.yards) * cam.zoom;
        const yardPx = yard * floorScale(back);
        // Across the floor (px, as it's been moved) where a point `x` yards along the field lies.
        const acrossOf = (x: number) => (grid.x0 + (x * GRID_PX) / grid.yards) * cam.zoom + cam.x;
        const at = (x: number, z: number) => floorPoint(acrossOf(x), back + z * base, w, h, sh);
        const px = (z: number) => base * floorScale(back + z * base);
        // The players (and the ball, a flag) as big as a square of the field makes them: smaller, the more yards it is.
        const body = (z: number) => px(z) * (SQUARE_YARDS[0] / grid.yards);

        ctx.save();
        const line = (x0: number, z0: number, x1: number, z1: number) => {
          ctx.beginPath();
          ctx.moveTo(...at(x0, z0));
          ctx.lineTo(...at(x1, z1));
          ctx.stroke();
        };
        // Its lines run from sideline to sideline.
        const far = hz;
        // What of it shows across the screen, along the field.
        const xAt = (sx: number) => (((sx - w / 2) / floorScale(back) - cam.x) / cam.zoom - grid.x0) / (GRID_PX / grid.yards);
        const [from0, to0] = [xAt(0), xAt(w)];
        const span = to0 - from0;
        // The field's real yard lines where they are: the line of scrimmage on the yard line it was snapped from (the goal
        // line it's going for off to the right), fading off toward the screen's sides.
        const edge = (x: number) => Math.max(0, Math.min(1, Math.min(x - from0, to0 - x) / (span * 0.1)));
        // Painted on the field, lying on it in the floor's own perspective, a field's own: 4 feet wide, 6 feet deep (as
        // the floor's laid back), a foot off the line beside it — its near edge at `z`, the other way up (`flip`) on the
        // far side, as a field's numbers are — from its left edge at `x` (its right, flipped). In the page's own type.
        const type = getComputedStyle(document.body).fontFamily;
        const digitWide = 4 / 3;
        const digitGap = Math.max(1 / 3, 4 / yardPx);
        const deep = (2 * yard) / base;
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
          const [su, sv] = [(flip ? -1 : 1) * (digitWide / m.width), (flip ? -1 : 1) * (deep / tall)];
          const [px0, py0] = at(x, z);
          ctx.transform(along[0] * su, along[1] * su, toward[0] * sv, toward[1] * sv, px0, py0);
          ctx.fillText(ch, 0, 0);
          ctx.restore();
        };
        // A number painted by a line at `x`: two digits either side of it, clear of it; otherwise just past it.
        const paintBy = (text: string, x: number, z: number, flip = false) => {
          const [l, r] = flip ? [x + digitGap + digitWide, x - digitGap] : [x - digitGap - digitWide, x + digitGap];
          if (/^\d\d$/.test(text)) {
            paint(text[0], l, z, flip);
            paint(text[1], r, z, flip);
          } else [...text].forEach((ch, i) => paint(ch, r + (flip ? -1 : 1) * i * digitWide, z, flip));
        };
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        if (goal !== null) {
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
              ctx.globalAlpha = fade * (g % 10 === 0 ? 0.32 : 0.2) * e;
              line(x, -far, x, hz);
            } else if (yardPx > 5) {
              ctx.globalAlpha = fade * 0.22 * e;
              line(x, -hz * 0.3 - 0.8, x, -hz * 0.3 + 0.8);
              line(x, hz * 0.3 - 0.8, x, hz * 0.3 + 0.8);
            }
            // The tens numbered on the field, the line between their digits: near the screen's bottom, and in from the
            // far sideline the other way up.
            if (g % 10 === 0) {
              ctx.globalAlpha = fade * 0.45 * e;
              ctx.fillStyle = ink;
              const n = String(g <= 50 ? g : 100 - g);
              paintBy(n, x, (floorDepth(h * NEAR_NUMBERS, h, sh) - back) / base);
              paintBy(n, x, -hz + FIELD_NUMBERS, true);
            }
          }
          // The far sideline (the near one's the screen's bottom).
          ctx.globalAlpha = fade * 0.32;
          ctx.lineWidth = 1;
          line(Math.max(from0, goal - 110), -hz, Math.min(to0, goal + 10), -hz);
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
          const unit = body(z) * 0.55;
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
          const by = sy - hgt * body(z);
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
          const unit = body(p.z) * 0.42;
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
            const lift = p.pose === "jump" ? Math.abs(Math.sin(t * 7)) * body(p.z) * 1.4 : look === "runB" ? unit : 0;
            ctx.drawImage(sprite, Math.round(sx - sw / 2), Math.round(sy - shh - lift), sw, shh);
          }
          if (f === 0 && ballNow && "by" in ballNow && ballNow.by === p.i) {
            const hands = p.pose === "down" ? 0.4 : 2.4;
            // In his hands: a step off his middle, at his own size (not the field's zoom).
            drawBall(p.x + ((p.pose === "down" ? facingOf(p.a) * 2 : 0.9) * base * (SQUARE_YARDS[0] / grid.yards)) / yard, p.z + 0.3, hands);
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
          const lift = (2 * (1 - fl) + 12 * fl * (1 - fl)) * body(z);
          const unit = body(z) * 0.5;
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
          ctx.font = `700 ${Math.max(14, body(p.z) * 4.5)}px ${type}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          // From just over his helmet, up a few yards.
          ctx.fillText(m.text, sx, sy - (H + 2) * body(p.z) * 0.42 - 2 - fl * 4 * body(p.z));
        }
        // What happened, in the page's own type, bold and in capitals, over the whole field (none of it on it) and under
        // the horizon (on a phone, the starters list is over it) — popping up as it does, one line over another.
        // The first on top, the rest under it in turn, the last just over the field.
        const lines = Math.max(1, ...stage.marks.map((m) => (m.kind === "word" ? (m.row ?? 0) + 1 : 0)));
        // Up on the back of the room, over the horizon.
        const fieldTop = horizon - 8;
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

    // Tapped on the bare floor (not dragged, nor on anything standing on it): the field faded off it, and whatever was
    // waiting to come on with it.
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const onTap = (e: MouseEvent) => {
      const moved = down ? Math.hypot(e.clientX - down[0], e.clientY - down[1]) : 0;
      down = null;
      if (!current || moved > 6 || e.clientY < room.current.height * room.current.share) return;
      const on = e.target instanceof Element ? e.target : null;
      if (on?.closest("button, a, input, select, textarea, label, [role='button'], [data-play], [data-drag-scroll], [data-floor-ui], header, nav")) return;
      queue.length = 0;
      following = [];
      leaving = { playing: current, since: performance.now() };
      current = null;
      loop();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("click", onTap);

    window.addEventListener(PLAY_EVENT, onPlay);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("click", onTap);
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
