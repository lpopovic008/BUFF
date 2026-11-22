"use client";

import { useEffect, useRef } from "react";
import { BallLeg, ballAt, FieldMark, FieldPlace, Flight, flightFor, Point } from "@/lib/ball-flight";
import { FIELD_WIDE, FieldFloor, FieldSpot, layFields, layFocused, MOST_FIELDS } from "@/lib/field-layout";
import { FLOOR_TILT, floorAt, floorPoint, floorScale } from "@/lib/grid-room";
import { FloorTiltStore, tiltFor } from "@/lib/floor-tilt";
import { nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import type { NFLGame } from "@/lib/nfl-schedule";
import { GamePlay, playFromLastPlay } from "@/lib/play-by-play";
import { PlayScene, sceneFor } from "@/lib/play-scene";
import { teamColor, teamName } from "@/lib/team-colors";

// As on television: the line of scrimmage in blue, the line to gain for a first down in yellow.
const SCRIMMAGE = "#2f7cf6";
const FIRST_DOWN = "#f5d020";
const FLAG = { yellow: "#f5d020", red: "#e5484d" };
const POSTS = "#f2c94c";
const BALL = "#8b4a22";
const BALL_LIT = "#b06a38";
const BALL_DARK = "#4f2810";
/** A kickoff's flyover: how long the jets take over the field and how long their smoke lasts after (s); how far past
 * each end zone they're flown from and to, how high (yards), and how long their smoke trails (yards). */
const FLYOVER_S = 4.2;
const TRAIL_FADE_S = 1.8;
const FLYOVER_RUN = 70;
const FLYOVER_HEIGHT = 15;
const TRAIL_LONG = 90;
/** A jet's length, nose to tail (yards — bigger than life, to be seen), and how far toward you its shadow falls. */
const JET_LONG = 11;
const SHADOW_SHIFT = 9;
/** How much a jet's drawn shorter across than it's long, as it shows from where you see it. */
const JET_SQUASH = 0.5;
/** The formation, a diamond: each jet's distance behind the lead, across the field (toward you, +), and how much
 * lower (yards) — the lead, the left wing, the right wing, the slot. */
const FORMATION: [back: number, z: number, lower: number][] = [
  [0, 0, 0],
  [10, -9, 0.5],
  [10, 9, 0.5],
  [20, 0, 1],
];
/** A jet seen from above, nose first along +u, wings across v: a fighter's delta, its tailplanes, outlined round. */
const JET_HALF: [number, number][] = [
  [4.6, 0],
  [3.4, 0.35],
  [1.8, 0.6],
  [0.6, 0.75],
  [-1.5, 4.1],
  [-2.3, 4.1],
  [-2.0, 0.9],
  [-3.1, 0.9],
  [-4.1, 2.1],
  [-4.6, 2.1],
  [-4.3, 0.55],
  [-4.6, 0.35],
];
const JET: [number, number][] = [...JET_HALF, ...JET_HALF.slice(1).reverse().map(([u, v]): [number, number] => [u, -v])];

/** How far round its long axis the ball's laces sit at rest (rad, from facing you): a little up its near side. */
const LACE_REST = 0.32;
/** How fast a thrown ball spirals, and a tumbling one rolls over, round its long axis (rad/s) — slow enough to see. */
const SPIRAL_RAD_S = 14;
const TUMBLE_ROLL_RAD_S = 5;
/** How quickly a field eases to where it's laid (ms), and fades on or off the floor. */
const EASE_MS = 140;
/** Plays waiting their turn on a field, at most. */
const QUEUE = 3;
/** How far a swipe goes before it moves the fields (px). */
const SWIPE_PX = 28;
/** How long a finger's held on a field, still, before it's picked up to be dragged (a mouse takes it at once). */
const HOLD_MS = 350;

/** Where a game stands: who has the ball, how far they have to go to the end zone, and for a first down (null: to the
 * goal line, or off a down). */
interface Situation {
  possession: string | null;
  toGo: number | null;
  distance: number | null;
}

/** A play sent down a field: its ball's flight, the team with the ball as it's snapped, where it's snapped from (x),
 * and how far that team had to go for a first down. */
interface FieldPlay {
  flight: Flight;
  offense: string;
  los: number;
  distance: number | null;
}

/** A game's field as it's drawn: where it lies now (easing to where it's laid), its line, its plays. */
interface FieldState {
  game: NFLGame;
  spot: FieldSpot | null;
  alpha: number;
  /** Where it's laid (null: going, its game no longer on). */
  target: FieldSpot | null;
  lastPlayId: string | null;
  situation: Situation;
  /** Its line of scrimmage as drawn (x), easing to where it is. */
  los: number | null;
  /** The play going on (when it started, and whether it's been told it's done moving), those waiting, and the last
   * one sent down it — acted out again when the field's tapped. */
  playing: (FieldPlay & { start: number; told: boolean; replay?: number }) | null;
  waiting: FieldPlay[];
  last: FieldPlay | null;
  /** Whether it came on before its game's kickoff (and jets are to fly over it as that comes), and the flyover going on
   * (when it started, as the draw loop's clock has it). */
  awaitingKickoff: boolean;
  flyover: number | null;
}

const situationOf = (game: NFLGame): Situation => ({
  possession: game.live?.possession ?? null,
  toGo: game.live?.yardsToEndzone ?? null,
  distance: distanceOf(game.live?.downDistance ?? null),
});

/** The yards to go in a down and distance ("2nd & 6 at BUF 23": 6) — null for "& Goal", or none given. */
const distanceOf = (downDistance: string | null) => {
  const m = /&\s*(\d+)/.exec(downDistance ?? "");
  return m ? Number(m[1]) : null;
};

/** Which way a team goes on its game's field: the road team toward the right end zone, the home team toward the left. */
const dirOf = (game: NFLGame, team: string | null): 1 | -1 => (team === game.homeTeam ? -1 : 1);
/** Where a team with `toGo` yards to the end zone has the ball (x, from the left goal line). */
const spotOf = (dir: 1 | -1, toGo: number) => (dir > 0 ? 100 - toGo : toGo);

/** A team's highlight, as the starters list tints its side of a game's header (see .team-bar): its color, lifted
 * toward white by `lift` (0–1, on a dark page), as `rgba` at `alpha` — the page's ink, for a team it doesn't know. */
function teamTint(team: string, lift: number, alpha: number, ink: string): string {
  return tint(teamColor(team), lift, alpha, ink);
}

/** A `#rrggbb` color lifted toward white by `lift`, at `alpha` — `ink`, for anything else. */
function tint(color: string, lift: number, alpha: number, ink: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return withAlpha(ink, alpha);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((c) => Math.round(c + (255 - c) * lift));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The largest the end zones' names are lettered at, flat, before they're laid on the field (px) — they're lettered
 * at about the size they'll show at (see drawNames), in steps of NAME_STEP_PX, no smaller than NAME_MIN_PX. */
const NAME_PX = 160;
const NAME_STEP_PX = 8;
const NAME_MIN_PX = 16;
/** A team's name lettered flat, once, in bold capitals in `font`'s family, in `color`, at a size (see paintedName). */
const names = new Map<string, { image: HTMLCanvasElement; wide: number; ascent: number; pad: number }>();

/** `name` lettered flat on a canvas of its own, `size` px, its baseline `pad + ascent` down — kept for the next time. */
function paintedName(name: string, family: string, color: string, size = NAME_PX) {
  const key = `${name}|${family}|${color}|${size}`;
  let painted = names.get(key);
  if (painted) return painted;
  const font = `700 ${size}px ${family}`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const m = measure.measureText(name);
  const ascent = m.actualBoundingBoxAscent || size * 0.7;
  const descent = m.actualBoundingBoxDescent || 0;
  const pad = Math.ceil(size / 20);
  const image = document.createElement("canvas");
  image.width = Math.ceil(m.width + 2 * pad);
  image.height = Math.ceil(ascent + descent + 2 * pad);
  const g = image.getContext("2d")!;
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = "alphabetic";
  g.fillText(name, pad, pad + ascent);
  painted = { image, wide: m.width, ascent, pad };
  names.set(key, painted);
  return painted;
}

/** A CSS color at `alpha`, by the canvas mixing it with transparent. */
const withAlpha = (color: string, alpha: number) => `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;

/**
 * Every game being played, a field of its own laid on the room's floor (see field-layout): its line of scrimmage, and
 * the logo of the team with the ball standing behind it, the way they're going — and each play as it comes in, told by
 * the ball (see ball-flight). From tablet width up the fields share the floor between the Red Zone and the starters
 * list, the floor looked down on more the more fields there are (`tilt`, see floor-tilt.ts — its horizon where it is);
 * on a phone, the game in view across the floor's front and the rest behind it — swiped up or down (or tapped) to
 * bring another to the front.
 */
export function FloorFields({
  games,
  width,
  height,
  share,
  floor,
  focused = false,
  onPick,
  onPlayed,
  replay = null,
  onReplayed,
  tilt: tiltStore,
  shown,
}: {
  /** The games being played, in order. */
  games: NFLGame[];
  width: number;
  height: number;
  share: number;
  /** The floor they're laid on (see FieldFloor). */
  floor: Omit<FieldFloor, "width" | "height" | "share">;
  /** A phone's floor: one game in view at a time (see layFocused). */
  focused?: boolean;
  /** Told when a field's tapped (or clicked), and which game's it is. */
  onPick?: (gameId: string) => void;
  /** Told when a field's done acting out the plays sent down it, and which game's it is. */
  onPlayed?: (gameId: string) => void;
  /**
   * A play picked to be acted out again on its game's field (one of `games`), each pick its own `key` — on a phone,
   * its field brought to the front while it's on. Nothing waiting cuts it short.
   */
  replay?: { game: NFLGame; play: GamePlay; key: number } | null;
  /** Told when the picked play's over (or couldn't be acted out), with its `key`. */
  onReplayed?: (key: number) => void;
  /** How far the floor's laid back, eased here to suit how many fields there are (from tablet width up) — for what
   * draws the floor to follow. */
  tilt?: FloorTiltStore;
  /** Where across the screen they show (px from its left): what's out past these is behind something standing on the
   * floor (from tablet width up, the columns at its sides) — hidden. */
  shown?: { left: number; right: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fields = useRef(new Map<string, FieldState>());
  const room = useRef({ width, height, share, floor, focused });
  // The game in view on a phone, and the games on, in order.
  const front = useRef<string | null>(null);
  const order = useRef<string[]>([]);
  // Whether fields have been dragged to other spots (see the pointer handling below): then they stay where they've
  // been put, the games' own order only placing new ones, after them.
  const arranged = useRef(false);
  // The field being dragged, if any: which, and how far its spot is from the floor point under the pointer.
  const dragging = useRef<{ id: string; across: number; near: number } | null>(null);
  // Drawn again (and on, while anything's moving).
  const kick = useRef(() => {});
  // How far the floor's laid back now (easing to suit how many fields there are), and its store.
  const tilt = useRef(tiltStore?.get() ?? FLOOR_TILT);
  const tilts = useRef(tiltStore);
  useEffect(() => {
    tilts.current = tiltStore;
    // Gone, the floor laid back as it lies again.
    return () => tiltStore?.set(FLOOR_TILT);
  }, [tiltStore]);
  const pick = useRef(onPick);
  const played = useRef(onPlayed);
  const replayed = useRef(onReplayed);
  useEffect(() => {
    pick.current = onPick;
    played.current = onPlayed;
    replayed.current = onReplayed;
  }, [onPick, onPlayed, onReplayed]);
  // On a phone, the game that was in view before a picked play's field was brought to the front for it.
  const frontBefore = useRef<string | null>(null);

  // Laid out again: where each field goes for the games on, and the room as it is — straight there (`glued`), as the
  // floor's tilting under them.
  const relay = useRef((glued = false) => {
    const { width: w, height: h, share: sh, floor: f, focused: phone } = room.current;
    const ids = order.current;
    if (phone && (!front.current || !ids.includes(front.current))) front.current = ids[0] ?? null;
    const at = phone && front.current ? ids.indexOf(front.current) : 0;
    const shown = (phone ? [...ids.slice(at), ...ids.slice(0, at)] : ids).slice(0, MOST_FIELDS);
    const lay = { ...f, width: w, height: h, share: sh, tilt: tilt.current };
    const spots = phone ? layFocused(shown.length, lay) : layFields(shown.length, lay);
    for (const [id, state] of fields.current) {
      // The one being dragged goes where it's dragged.
      if (dragging.current?.id === id) continue;
      const k = shown.indexOf(id);
      state.target = k >= 0 ? (spots[k] ?? null) : null;
      if ((!state.spot || glued) && state.target) state.spot = state.target;
    }
    kick.current();
  });

  useEffect(() => {
    room.current = { width, height, share, floor, focused };
    relay.current();
  }, [width, height, share, floor, focused]);

  // The games on: each one's field, and a play that's come in since it was last seen, sent down its field.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = performance.now();
    for (const game of games) {
      const lastPlay = game.live?.lastPlay ?? null;
      let state = fields.current.get(game.id);
      if (!state) {
        const awaitingKickoff = !reduced && game.state === "pre" && Date.now() < Date.parse(game.kickoff);
        state = { game, spot: null, alpha: 0, target: null, lastPlayId: lastPlay?.id ?? null, situation: situationOf(game), los: null, playing: null, waiting: [], last: null, awaitingKickoff, flyover: null };
        fields.current.set(game.id, state);
      }
      const before = state.situation;
      state.game = game;
      state.situation = situationOf(game);
      if (!lastPlay || lastPlay.id === state.lastPlayId) continue;
      state.lastPlayId = lastPlay.id;
      if (reduced) continue;
      let play = playFromLastPlay(game.id, lastPlay, Date.now());
      // Where it was snapped from: where the game stood just before it came in.
      if (play.yardsToEndzone === undefined && before.toGo !== null && (!play.offense || play.offense === before.possession)) {
        play = { ...play, yardsToEndzone: before.toGo, offense: play.offense ?? before.possession };
      }
      const scene = sceneFor(play, [game.homeTeam, game.awayTeam]);
      if (!scene) continue;
      const lastLos = before.toGo !== null && before.possession ? spotOf(dirOf(game, before.possession), before.toGo) : null;
      const place = (s: PlayScene): FieldPlace => {
        const dir = dirOf(game, s.offense);
        return { dir, los: s.toGoal !== null && s.kind !== "kickoff" ? spotOf(dir, s.toGoal) : (lastLos ?? 50) };
      };
      const seed = [...lastPlay.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1e6, 7);
      // How far they had to go for a first down: the line's word for it — or, the scoreboard's latest play not saying,
      // where the game stood just before it.
      const distance = scene.toGo ?? (scene.offense === before.possession ? before.distance : null);
      state.waiting.push({ flight: flightFor(scene, place, seed), offense: scene.offense, los: place(scene).los, distance });
      while (state.waiting.length > QUEUE) state.waiting.shift();
      if (!state.playing) {
        const next = state.waiting.shift()!;
        state.playing = { ...next, start: now, told: false };
        state.last = next;
      }
    }
    const ids = games.map((g) => g.id);
    order.current = arranged.current ? [...order.current.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.current.includes(id))] : ids;
    relay.current();
  }, [games]);

  // A play picked to be acted out again: sent down its game's field (laid by the effect above) straight away, in place
  // of whatever's on — on a phone, its field brought to the front till it's over.
  const replayKey = replay?.key ?? null;
  useEffect(() => {
    if (!replay) return;
    const { game, play, key } = replay;
    const state = fields.current.get(game.id);
    const scene = state ? sceneFor(play, [game.homeTeam, game.awayTeam]) : null;
    if (!state || !scene) {
      queueMicrotask(() => replayed.current?.(key));
      return;
    }
    // Snapped from where the play says — or, it not saying, where the game stands now.
    const { possession, toGo } = state.situation;
    const nowLos = possession && toGo !== null ? spotOf(dirOf(game, possession), toGo) : null;
    const place = (s: PlayScene): FieldPlace => {
      const dir = dirOf(game, s.offense);
      return { dir, los: s.toGoal !== null && s.kind !== "kickoff" ? spotOf(dir, s.toGoal) : (nowLos ?? 50) };
    };
    const seed = [...play.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1e6, 7);
    const sent: FieldPlay = { flight: flightFor(scene, place, seed), offense: scene.offense, los: place(scene).los, distance: scene.toGo };
    state.playing = { ...sent, start: performance.now(), told: false, replay: key };
    if (room.current.focused && front.current !== game.id) {
      frontBefore.current = front.current;
      front.current = game.id;
      relay.current();
    }
    kick.current();
    // (Read once per pick: `replay` itself is new each render.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey]);

  useEffect(() => {
    const el = ref.current;
    const context = el?.getContext("2d");
    if (!el || !context) return;
    const [canvas, ctx] = [el, context];
    const logos = new Map<string, HTMLImageElement>();
    const logo = (team: string) => {
      let img = logos.get(team);
      if (!img) {
        img = new Image();
        img.onload = () => kick.current();
        img.src = nflLogoUrl(team);
        logos.set(team, img);
      }
      return img.complete && img.naturalWidth > 0 ? img : null;
    };
    const css = () => {
      const s = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
      return {
        ink: v("--ink-primary", "#fff"),
        page: v("--page", "#000"),
        good: v("--status-good", "#2e7d32"),
        bad: v("--status-critical", "#d03b3b"),
        lift: (parseFloat(v("--team-lift", "0%")) || 0) / 100,
      };
    };
    const type = getComputedStyle(document.body).fontFamily;
    // Drawn again once the page's fonts are in (the end zones are lettered in its type, see drawNames).
    document.fonts?.ready.then(() => kick.current()).catch(() => {});
    let frame = 0;
    // Woken at the next kickoff a field's waiting on, for its flyover.
    let kickoffTimer = 0;
    let last = performance.now();
    let looping = false;
    const loop = () => {
      if (looping) return;
      looping = true;
      frame = requestAnimationFrame(draw);
    };
    kick.current = loop;

    function draw(now: number) {
      looping = false;
      const { width: w, height: h, share: sh } = room.current;
      const dt = Math.min(100, now - last);
      last = now;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = css();
      const k = 1 - Math.exp(-dt / EASE_MS);
      let moving = false;

      // The floor laid back to suit how many fields there are (from tablet width up), the fields laid out again on it.
      const tiltTo = room.current.focused ? FLOOR_TILT : tiltFor(Math.min(order.current.length, MOST_FIELDS));
      if (Math.abs(tilt.current - tiltTo) > 0.01) {
        tilt.current += (tiltTo - tilt.current) * k;
        if (Math.abs(tilt.current - tiltTo) <= 0.01) tilt.current = tiltTo;
        tilts.current?.set(tilt.current);
        relay.current(true);
        moving = true;
      } else tilts.current?.set(tilt.current);

      // Each field eased to where it's laid (or faded off the floor), its line to where the ball is.
      for (const [id, f] of fields.current) {
        const goal = f.target;
        if (goal && f.spot) {
          const next = { across: f.spot.across + (goal.across - f.spot.across) * k, near: f.spot.near + (goal.near - f.spot.near) * k, yard: f.spot.yard + (goal.yard - f.spot.yard) * k };
          if (Math.abs(next.across - goal.across) + Math.abs(next.near - goal.near) + Math.abs(next.yard - goal.yard) * 50 > 0.05) moving = true;
          else Object.assign(next, goal);
          f.spot = next;
        }
        const alpha = goal ? 1 : 0;
        f.alpha += (alpha - f.alpha) * k;
        if (Math.abs(f.alpha - alpha) > 0.01) moving = true;
        else f.alpha = alpha;
        if (!goal && f.alpha === 0 && !order.current.includes(id)) {
          fields.current.delete(id);
          continue;
        }
        // The play on, done moving: told so. Over (its end held a while, see HOLD_S) — or done moving with another
        // waiting: the next in.
        if (f.playing) {
          const t = (now - f.playing.start) / 1000;
          if (t > f.playing.flight.settled && !f.playing.told) {
            f.playing.told = true;
            played.current?.(id);
          }
          if (t > f.playing.flight.length || (t > f.playing.flight.settled && f.waiting.length > 0 && f.playing.replay === undefined)) {
            // A picked play over: told so, and on a phone, the game that was in view back in front.
            const over = f.playing.replay;
            if (over !== undefined) {
              if (frontBefore.current !== null && order.current.includes(frontBefore.current)) {
                front.current = frontBefore.current;
                relay.current();
              }
              frontBefore.current = null;
              queueMicrotask(() => replayed.current?.(over));
            }
            const next = f.waiting.shift();
            f.playing = next ? { ...next, start: now, told: false } : null;
            if (next) f.last = next;
          }
        }
        if (f.playing) moving = true;
        const { possession, toGo } = f.situation;
        // (None while a kickoff's on.)
        const lineTo = f.playing ? (f.playing.flight.kickoff ? null : f.playing.los) : possession && toGo !== null ? spotOf(dirOf(f.game, possession), toGo) : null;
        if (lineTo === null) f.los = null;
        else {
          f.los = f.los === null ? lineTo : f.los + (lineTo - f.los) * k;
          if (Math.abs(f.los - lineTo) > 0.05) moving = true;
          else f.los = lineTo;
        }
      }
      // Kickoff: jets flown over a field that came on before it, as its time comes (or its game's started) — and the
      // next one waited on.
      let nextKickoff = Infinity;
      for (const f of fields.current.values()) {
        if (f.awaitingKickoff) {
          const kickoff = Date.parse(f.game.kickoff);
          if (Date.now() >= kickoff || f.game.state !== "pre") {
            f.awaitingKickoff = false;
            f.flyover = now;
          } else nextKickoff = Math.min(nextKickoff, kickoff);
        }
        if (f.flyover !== null) {
          if ((now - f.flyover) / 1000 < FLYOVER_S + TRAIL_FADE_S) moving = true;
          else f.flyover = null;
        }
      }
      clearTimeout(kickoffTimer);
      if (Number.isFinite(nextKickoff)) kickoffTimer = window.setTimeout(loop, Math.min(nextKickoff - Date.now() + 20, 2 ** 31 - 1));
      // What's flown over the fields, drawn over them all.
      const skies: (() => void)[] = [];

      // Farthest first, so nearer ones are drawn over them.
      const drawn = [...fields.current.values()].filter((f) => f.spot && f.alpha > 0.01).sort((a, b) => a.spot!.near - b.spot!.near);
      // The one being dragged over the rest.
      const held = dragging.current && fields.current.get(dragging.current.id);
      if (held && drawn.includes(held)) drawn.push(...drawn.splice(drawn.indexOf(held), 1));
      for (const f of drawn) drawField(f, now);
      for (const sky of skies) sky();
      if (moving) loop();

      function drawField(f: FieldState, now: number) {
        const spot = f.spot!;
        const half = FIELD_WIDE / 2;
        // Where field point (x, z) shows: x yards along it from its left goal line, z across it from its middle, toward you.
        const depth = (z: number) => spot.near - (half - z) * spot.yard;
        const at = (x: number, z: number) => floorPoint(spot.across + (x - 50) * spot.yard, depth(z), w, h, sh, tilt.current);
        // A yard on the screen, where z is.
        const yardPx = (z: number) => spot.yard * floorScale(depth(z), tilt.current);
        const alpha = f.alpha;
        const path = (pts: [number, number][]) => {
          ctx.beginPath();
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        };
        const quad = (x0: number, x1: number, z0 = -half, z1 = half) => path([at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)]);
        const line = (x0: number, z0: number, x1: number, z1: number) => {
          path([at(x0, z0), at(x1, z1)]);
          ctx.stroke();
        };

        ctx.save();
        // The field: the floor's grid hidden under it; its end zones a shade lighter; its lines faint, the goal lines
        // and its edges stronger, the 50 between.
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = colors.page;
        quad(-10, 110);
        ctx.closePath();
        ctx.fill();
        // Each end zone the highlight of the team it's theirs (the one going away from it — the road team's on the
        // left), as the starters list tints its side of the game.
        for (const [x0, x1, team] of [
          [-10, 0, f.game.awayTeam],
          [100, 110, f.game.homeTeam],
        ] as const) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = teamTint(team, colors.lift, 0.22, colors.ink);
          quad(x0, x1);
          ctx.closePath();
          ctx.fill();
        }
        drawNames();
        ctx.strokeStyle = colors.ink;
        ctx.lineWidth = 1;
        for (let x = 10; x < 100; x += 10) {
          ctx.globalAlpha = alpha * (x === 50 ? 0.3 : 0.14);
          line(x, -half, x, half);
        }
        ctx.globalAlpha = alpha * 0.5;
        line(0, -half, 0, half);
        line(100, -half, 100, half);
        quad(-10, 110);
        ctx.closePath();
        ctx.stroke();

        // What's going on: the play's marks under the ball (the ground shaken, an end zone lit).
        const t = f.playing ? (now - f.playing.start) / 1000 : -1;
        const marks = f.playing ? f.playing.flight.marks.filter((m) => t >= m.t) : [];
        const tone = (name: "ink" | "good" | "bad") => (name === "good" ? colors.good : name === "bad" ? colors.bad : colors.ink);
        for (const m of marks) {
          if (m.kind === "flash" && t - m.t < 1.4) {
            ctx.globalAlpha = alpha * 0.4 * (1 - (t - m.t) / 1.4);
            ctx.fillStyle = tone(m.tone);
            quad(m.end > 0 ? 100 : -10, m.end > 0 ? 110 : 0);
            ctx.closePath();
            ctx.fill();
          } else if (m.kind === "ripple" && t - m.t < 0.8) drawRipple(m, t - m.t);
          else if (m.kind === "cross") drawCross(m);
        }

        // The line of scrimmage, sideline to sideline, and the line to gain for a first down; the team with the ball's
        // logo standing behind it, reflected in the field.
        if (f.los !== null) {
          const team = f.playing ? f.playing.offense : f.situation.possession;
          const dir = dirOf(f.game, team);
          const distance = f.playing ? f.playing.distance : f.situation.distance;
          const lineWide = Math.max(1.5, Math.min(3, yardPx(0) * 0.35));
          const gain = distance !== null ? f.los + dir * distance : null;
          if (gain !== null && gain > 0 && gain < 100) {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = FIRST_DOWN;
            ctx.lineWidth = lineWide;
            line(gain, -half, gain, half);
          }
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = SCRIMMAGE;
          ctx.lineWidth = lineWide;
          line(f.los, -half, f.los, half);
          const img = team ? logo(team) : null;
          if (team && img) {
            const [lx, ly] = at(Math.max(-8, Math.min(108, f.los - dir * 9)), 0);
            const size = nflLogoSize(team, Math.max(4, yardPx(0) * 8));
            // Standing a little up off the field, its reflection as far under it: the two clear of each other.
            const gap = size.height * 0.08;
            const top = ly - gap - size.height;
            ctx.globalAlpha = alpha * 0.92;
            ctx.drawImage(img, lx - size.width / 2, top, size.width, size.height);
            // Its reflection, upside down under its foot, faint.
            ctx.save();
            ctx.globalAlpha = alpha * 0.18;
            ctx.translate(0, 2 * ly);
            ctx.scale(1, -1);
            ctx.drawImage(img, lx - size.width / 2, top, size.width, size.height);
            ctx.restore();
          }
        }

        if (f.playing) {
          for (const m of marks) if (m.kind === "posts" && t <= m.until + 0.3) drawPosts(m, Math.min(1, (m.until + 0.3 - t) / 0.3));
          for (const m of marks) if (m.kind === "flag") drawFlag(m, t);
          const ball = ballAt(f.playing.flight, t);
          if (ball) drawBall(ball.at, ball.alpha, ball.spin, t, f.playing.flight, ball.team);
          drawLabel(f.playing.flight, t);
        }
        ctx.restore();
        if (f.flyover !== null) {
          const started = f.flyover;
          skies.push(() => {
            ctx.save();
            // From tablet width up, flown behind what stands at the floor's sides (the Red Zone, the starters list).
            if (!room.current.focused) {
              const { left, right } = room.current.floor;
              ctx.beginPath();
              ctx.rect(left, 0, right - left, h);
              ctx.clip();
            }
            drawFlyover((now - started) / 1000);
            ctx.restore();
          });
        }

        // Jets in formation flown the length of the field, high over it, at kickoff: their shadows sweeping across it
        // under them, smoke trailing from them — the wingmen's in the two teams' highlights — that drifts and fades
        // once they're gone.
        function drawFlyover(t: number) {
          const fade = alpha * Math.min(1, Math.max(0, (FLYOVER_S + TRAIL_FADE_S - t) / TRAIL_FADE_S));
          if (fade <= 0) return;
          // How far along the lead's flown (x), the road team's end zone to the home team's.
          const from = -FLYOVER_RUN;
          const lead = from + ((100 + 2 * FLYOVER_RUN) * Math.min(t, FLYOVER_S)) / FLYOVER_S;
          const up = (x: number, z: number, hgt: number): [number, number] => {
            const [px, py] = at(x, z);
            return [px, py - hgt * yardPx(z)];
          };
          const smoke = [colors.ink, teamTint(f.game.awayTeam, colors.lift, 1, colors.ink), teamTint(f.game.homeTeam, colors.lift, 1, colors.ink), colors.ink];
          const jets = FORMATION.map(([back, z, lower], i) => ({ x: lead - back, z, hgt: FLYOVER_HEIGHT - lower, color: smoke[i] }));
          // Their shadows on the field, where they're over it.
          ctx.save();
          quad(-10, 110);
          ctx.closePath();
          ctx.clip();
          ctx.globalAlpha = fade * 0.35;
          ctx.fillStyle = "#000";
          if (t < FLYOVER_S) for (const j of jets) jetShadow(j.x, j.z + SHADOW_SHIFT);
          ctx.restore();
          // Their smoke, from where they came on over the field (or as far back as it lasts) to their tails: thin and
          // thick at the tail, wider and fainter back along it.
          ctx.lineCap = "butt";
          for (const j of jets) {
            const tail = Math.min(j.x - JET_LONG / 2, 110 + FLYOVER_RUN);
            const start = Math.max(from, tail - TRAIL_LONG);
            if (tail <= start) continue;
            const steps = 14;
            for (let k = 0; k < steps; k++) {
              const a = tail - ((tail - start) * k) / steps;
              const b = tail - ((tail - start) * (k + 1)) / steps;
              const age = k / steps;
              ctx.globalAlpha = fade * 0.55 * (1 - age);
              ctx.strokeStyle = j.color;
              ctx.lineWidth = Math.max(1, yardPx(j.z) * (0.8 + 2.2 * age));
              ctx.beginPath();
              ctx.moveTo(...up(a, j.z, j.hgt + age * 1.5));
              ctx.lineTo(...up(b, j.z, j.hgt + (age + 1 / steps) * 1.5));
              ctx.stroke();
            }
          }
          if (t >= FLYOVER_S) return;
          // The jets: silver, lit from above, their canopies dark, their afterburners glowing — seen more from above than
          // the floor is (a jet laid as flat as the field would show as a sliver), their size where they are.
          for (const j of jets) {
            const [cx, cy] = up(j.x, j.z, j.hgt);
            const [ax, ay] = up(j.x + 1, j.z, j.hgt);
            const size = (yardPx(j.z) * JET_LONG) / 9.2;
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.translate(cx, cy);
            ctx.rotate(Math.atan2(ay - cy, ax - cx));
            ctx.scale(size, size * JET_SQUASH);
            const body = ctx.createLinearGradient(0, -4.2, 0, 4.2);
            body.addColorStop(0, "#f2f4f7");
            body.addColorStop(0.5, "#c3c8cf");
            body.addColorStop(1, "#7f8690");
            ctx.fillStyle = body;
            path(JET);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#555b63";
            ctx.lineWidth = 0.7 / size;
            ctx.stroke();
            ctx.fillStyle = "#1d2733";
            ctx.beginPath();
            ctx.ellipse(2.1, 0, 1.1, 0.38, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = fade * 0.9;
            ctx.fillStyle = "#ffb347";
            ctx.beginPath();
            ctx.ellipse(-4.9, 0, 0.6 * (0.85 + 0.15 * Math.sin(t * 60 + j.z)), 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // A jet's shadow on the field, its middle at (x, z), nose toward the home team's end zone.
        function jetShadow(x: number, z: number) {
          const s = JET_LONG / 9.2;
          path(JET.map(([u, v]) => at(x + u * s, z + v * s)));
          ctx.closePath();
          ctx.fill();
        }

        // What the play was, over the field's far sideline while it's on: just its letters, popping up — and fading
        // out at its end.
        function drawLabel(flight: Flight, t: number) {
          const label = flight.labels.filter((l) => t >= l.t).at(-1);
          if (!label) return;
          const fade = Math.min(1, (t - label.t) / 0.15, (flight.length - t) / 0.4);
          if (fade <= 0) return;
          const pop = Math.min(1, (t - label.t) / 0.25);
          const font = Math.max(10, Math.min(13, yardPx(-half) * 2.4)) * (0.7 + 0.3 * (1 - (1 - pop) * (1 - pop)));
          ctx.font = `700 ${font}px ${type}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          const [cx, farY] = at(50, -half);
          const y = farY - 6 - (1 - pop) * 4;
          ctx.globalAlpha = alpha * fade;
          // A thin edge of the page's color round the letters, so they read over the grid and the field behind.
          ctx.lineJoin = "round";
          ctx.lineWidth = 3;
          ctx.strokeStyle = colors.page;
          ctx.strokeText(label.text, cx, y);
          ctx.fillStyle = colors.ink;
          ctx.fillText(label.text, cx, y);
        }

        // Each team's name in its end zone, as a field's painted: in bold capitals in the page's own type, running
        // along it from one sideline to the other — facing in, the letters' feet toward the field, so they read from
        // it: the left one up the screen, the right one down it. Lettered flat at about the size it'll show at (see
        // paintedName, kept sharp), then laid on the field a thin slice at a time, each in the perspective where it
        // lies, so its letters stay straight and even. Left off where it'd be too small to make out.
        function drawNames() {
          const dpr = window.devicePixelRatio || 1;
          // How big a team's name comes out: its capitals as tall as fits the end zone, it as long as fits most of the
          // way across.
          const sized = (text: string) => {
            const flat = paintedName(text, type, colors.ink);
            const perYard = Math.max(flat.ascent / 8, flat.wide / (FIELD_WIDE * 0.9));
            return { text, long: flat.wide / perYard, tall: flat.ascent / perYard, capRatio: flat.ascent / NAME_PX };
          };
          const texts = [f.game.awayTeam, f.game.homeTeam].map((team) => sized(teamName(team).toUpperCase()));
          for (const [end, name] of [
            [-1, texts[0]],
            [1, texts[1]],
          ] as const) {
            const middle = end < 0 ? -5 : 105;
            const { long, tall } = name;
            if (tall * yardPx(0) < 5) continue;
            // Lettered at about the size it shows at, so it stays sharp.
            const size = Math.max(NAME_MIN_PX, Math.min(NAME_PX, Math.ceil((tall * yardPx(0) * dpr) / name.capRatio / NAME_STEP_PX) * NAME_STEP_PX));
            const painted = paintedName(name.text, type, colors.ink, size);
            const perYard = painted.ascent / tall;
            // Its letters' feet along the end zone's field side; read toward the far sideline on the left, toward you
            // on the right.
            const foot = middle - (end < 0 ? -1 : 1) * (tall / 2);
            const up = end < 0 ? -1 : 1;
            const read = end < 0 ? -1 : 1;
            const { image, pad, ascent } = painted;
            // A point on the flat name (px across it, and down it), on the field.
            const put = (u: number, v: number) => at(foot + up * ((pad + ascent - v) / perYard), read * ((u - pad) / perYard - long / 2));
            const slices = Math.max(8, Math.min(48, Math.ceil(Math.abs(put(image.width, 0)[1] - put(0, 0)[1]) / 5)));
            ctx.globalAlpha = alpha * 0.9;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            for (let i = 0; i < slices; i++) {
              const u0 = (i * image.width) / slices;
              const u1 = Math.min(image.width, ((i + 1) * image.width) / slices + 1);
              const [p0, p1, p2] = [put(u0, 0), put(u1, 0), put(u0, image.height)];
              const a = [(p1[0] - p0[0]) / (u1 - u0), (p1[1] - p0[1]) / (u1 - u0)];
              const c = [(p2[0] - p0[0]) / image.height, (p2[1] - p0[1]) / image.height];
              ctx.save();
              ctx.transform(a[0], a[1], c[0], c[1], p0[0] - a[0] * u0, p0[1] - a[1] * u0);
              ctx.drawImage(image, u0, 0, u1 - u0, image.height, u0, 0, u1 - u0, image.height);
              ctx.restore();
            }
          }
        }

        // A grey cross lying on the field: where a pass came down incomplete, or a kickoff was kicked from.
        function drawCross(m: Extract<FieldMark, { kind: "cross" }>) {
          const r = 1.1;
          ctx.globalAlpha = alpha * 0.55;
          ctx.strokeStyle = colors.ink;
          ctx.lineWidth = Math.max(1, Math.min(2.5, yardPx(m.z) * 0.3));
          line(m.x - r, m.z - r, m.x + r, m.z + r);
          line(m.x - r, m.z + r, m.x + r, m.z - r);
        }

        function drawRipple(m: Extract<FieldMark, { kind: "ripple" }>, age: number) {
          const u = age / 0.8;
          const [cx, cy] = at(m.x, m.z);
          const rx = yardPx(m.z) * (0.6 + 3.2 * u);
          // As flat as the floor lies there.
          const flat = Math.max(0.12, Math.min(1, Math.abs(at(m.x, m.z + 1)[1] - at(m.x, m.z - 1)[1]) / 2 / yardPx(m.z)));
          ctx.globalAlpha = alpha * 0.8 * (1 - u);
          ctx.strokeStyle = tone(m.tone);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, rx * flat, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        function drawPosts(m: Extract<FieldMark, { kind: "posts" }>, fade: number) {
          const x = m.end > 0 ? 110 : -10;
          const up = (z: number, hgt: number): [number, number] => {
            const [sx, sy] = at(x, z);
            return [sx, sy - hgt * yardPx(z)];
          };
          ctx.globalAlpha = alpha * Math.min(1, fade);
          ctx.strokeStyle = POSTS;
          ctx.lineWidth = Math.max(1, yardPx(0) * 0.25);
          for (const [a, b] of [
            [up(0, 0), up(0, 3.3)],
            [up(-3.1, 3.3), up(3.1, 3.3)],
            [up(-3.1, 3.3), up(-3.1, 11.5)],
            [up(3.1, 3.3), up(3.1, 11.5)],
          ]) {
            path([a, b]);
            ctx.stroke();
          }
        }

        // A flag thrown in: fluttering down out of the air, then lying where it landed.
        function drawFlag(m: Extract<FieldMark, { kind: "flag" }>, t: number) {
          const u = Math.min(1, (t - m.t) / 0.9);
          const sway = Math.sin(u * Math.PI * 3) * 1.2 * (1 - u);
          const [sx, sy] = at(m.x + sway, m.z);
          const yp = yardPx(m.z);
          const hgt = 9 * (1 - u * u);
          const s = Math.max(4, yp * 1.2);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = FLAG[m.color];
          ctx.save();
          ctx.translate(sx, sy - hgt * yp);
          if (u < 1) ctx.rotate(Math.sin(t * 9) * 0.9);
          ctx.fillRect(-s / 2, -s * (u < 1 ? 0.6 : 0.2), s, s * (u < 1 ? 0.8 : 0.35));
          ctx.restore();
        }

        // The ball: its shadow on the ground under it, and the ball up off it — pointed the way it's going, spinning
        // on a throw, end over end on a kick or a bounce.
        function drawBall([x, z, hgt]: Point, fade: number, spin: BallLeg["spin"], t: number, flight: Flight, team: string | null) {
          const yp = yardPx(z);
          const [gx, gy] = at(x, z);
          const by = gy - hgt * yp;
          // Its shadow, under it all the way, in the highlight of the team that has it (see teamTint).
          ctx.globalAlpha = alpha * fade * Math.max(0.55, 1 - hgt / 30);
          ctx.fillStyle = team ? teamTint(team, colors.lift, 0.75, colors.ink) : withAlpha(colors.ink, 0.3);
          ctx.beginPath();
          const shadow = Math.max(1.5, yp * 1.5);
          ctx.ellipse(gx, gy, shadow, shadow * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          let angle: number;
          if (spin === "tumble") angle = t * 13;
          else if (spin === "backspin") {
            // Kicked, it spins back over itself: against the way it's going across the screen.
            const before = ballAt(flight, Math.max(0, t - 0.03));
            const way = before ? Math.sign(gx - at(before.at[0], before.at[1])[0]) || 1 : 1;
            angle = -way * t * 9;
          } else {
            const before = ballAt(flight, Math.max(0, t - 0.03));
            if (before) {
              const [px, py] = at(before.at[0], before.at[1]);
              const dy = by - (py - before.at[2] * yardPx(before.at[1]));
              const dx = gx - px;
              angle = Math.abs(dx) + Math.abs(dy) > 0.05 ? Math.atan2(dy, dx) : 0;
            } else angle = 0;
          }
          // As big as the field it's on makes it: smaller, the farther off (and the smaller) the field.
          const long = Math.max(3, yp * 2.2);
          // How far round its long axis it's turned, its laces with it: spinning on a throw, rolling over as it tumbles,
          // still as it's carried or kicked (a kick turns it end over end, above) — at rest, a little up its near side.
          const roll = LACE_REST + (spin === "spiral" ? t * SPIRAL_RAD_S : spin === "tumble" ? t * TUMBLE_ROLL_RAD_S : 0);
          const girth = Math.max(2, yp * 1.3) * (spin === "spiral" ? 0.85 + 0.15 * Math.abs(Math.cos(roll)) : 1);
          // Its reflection, upside down in the field under it, faint (as the logo's is) — clear of it as it lies there,
          // and fainter the higher it goes, gone by 25 yards up.
          const mirror = gy + girth * 0.6;
          ctx.globalAlpha = alpha * fade * 0.18 * Math.max(0, 1 - hgt / 25);
          ctx.save();
          ctx.translate(gx, 2 * mirror - by);
          ctx.scale(1, -1);
          ctx.rotate(angle);
          ball();
          ctx.restore();
          ctx.globalAlpha = alpha * fade;
          ctx.save();
          ctx.translate(gx, by);
          ctx.rotate(angle);
          ball();
          ctx.restore();

          function ball() {
            // Pointed at both ends, leather brown, lit from above — with its laces along its top, where it's big enough to
            // show them.
            const [l, g] = [long / 2, girth / 2];
            const shade = ctx.createLinearGradient(0, -g, 0, g);
            shade.addColorStop(0, BALL_LIT);
            shade.addColorStop(0.45, BALL);
            shade.addColorStop(1, BALL_DARK);
            ctx.fillStyle = shade;
            ctx.beginPath();
            ctx.moveTo(-l, 0);
            ctx.bezierCurveTo(-l * 0.5, -g * 1.32, l * 0.5, -g * 1.32, l, 0);
            ctx.bezierCurveTo(l * 0.5, g * 1.32, -l * 0.5, g * 1.32, -l, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = BALL_DARK;
            ctx.lineWidth = Math.max(0.4, girth * 0.06);
            ctx.stroke();
            // Its laces where its turn has them: across its near side, sliding over its top or bottom out of sight as it
            // turns, back round the far side to come up again — fainter and narrower the farther round they are.
            const face = Math.cos(roll);
            if (long >= 7 && face > 0.05) {
              const lace = -g * 0.9 * Math.sin(roll);
              const shown = ctx.globalAlpha;
              ctx.save();
              ctx.clip();
              ctx.globalAlpha = shown * Math.min(1, face * 2);
              ctx.strokeStyle = "#f4efe6";
              ctx.lineCap = "round";
              ctx.lineWidth = Math.max(0.5, girth * 0.09 * (0.5 + 0.5 * face));
              ctx.beginPath();
              ctx.moveTo(-l * 0.3, lace);
              ctx.lineTo(l * 0.3, lace);
              ctx.stroke();
              ctx.lineWidth = Math.max(0.4, girth * 0.07);
              ctx.beginPath();
              for (let k = 0; k < 5; k++) {
                const x = -l * 0.24 + (k * l * 0.48) / 4;
                ctx.moveTo(x, lace - g * 0.2 * face);
                ctx.lineTo(x, lace + g * 0.2 * face);
              }
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      }
    }

    // The field at screen point (x, y), if any: inside its four corners as they show.
    const fieldAt = (x: number, y: number, except?: string): string | null => {
      const { width: w, height: h, share: sh } = room.current;
      const half = FIELD_WIDE / 2;
      for (const [id, f] of fields.current) {
        const s = f.target;
        if (!s || id === except) continue;
        const p = (fx: number, z: number) => floorPoint(s.across + (fx - 50) * s.yard, s.near - (half - z) * s.yard, w, h, sh, tilt.current);
        const corners = [p(-10, -half), p(110, -half), p(110, half), p(-10, half)];
        const inside = corners.every(([ax, ay], i) => {
          const [bx, by] = corners[(i + 1) % 4];
          return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
        });
        if (inside) return id;
      }
      return null;
    };

    // A field dragged onto another: the two swap spots, no other moving. It's picked up at once with a mouse; with a
    // finger, once held still on it a moment (a swipe across the floor, on a phone, brings the next field forward).
    const swap = (a: string, b: string) => {
      const ids = [...order.current];
      const [i, j] = [ids.indexOf(a), ids.indexOf(b)];
      if (i < 0 || j < 0) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      order.current = ids;
      arranged.current = true;
      // On a phone, the one in view's spot taken: the one put there's in view.
      if (front.current === a) front.current = b;
      else if (front.current === b) front.current = a;
    };
    // The floor point under screen point (x, y) — held a little below the horizon.
    const floorUnder = (x: number, y: number) => {
      const { width: w, height: h, share: sh } = room.current;
      return floorAt(x, Math.max(y, h * sh + 4), w, h, sh, tilt.current);
    };
    const pickUp = (id: string, x: number, y: number) => {
      const spot = fields.current.get(id)?.spot;
      if (!spot) return;
      const [across, d] = floorUnder(x, y);
      dragging.current = { id, across: spot.across - across, near: spot.near - d };
      kick.current();
    };
    let grabbed: { id: string; x: number; y: number; mouse: boolean } | null = null;
    let hold = 0;

    // On a phone: the fields swiped up or down the floor, the next one brought to the front — or one tapped. Anywhere,
    // a field tapped is told (see onPick), and acts out its last play again.
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      const { height: h, share: sh, floor: f, focused: phone } = room.current;
      down = null;
      grabbed = null;
      clearTimeout(hold);
      if (e.clientY < h * sh || e.clientY > (phone ? f.front + 12 : h)) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("button, a, input, select, textarea, label, [role='button'], [data-scroll-list], [data-floor-ui], header, nav")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      const id = fieldAt(e.clientX, e.clientY);
      if (!id) return;
      grabbed = { id, x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse" };
      if (!grabbed.mouse) hold = window.setTimeout(() => grabbed && pickUp(grabbed.id, grabbed.x, grabbed.y), HOLD_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (!grabbed) return;
      const drag = dragging.current;
      if (!drag) {
        if (grabbed.mouse) {
          // A mouse's press on a field is its, not the floor's to slide.
          e.stopPropagation();
          if (Math.hypot(e.clientX - grabbed.x, e.clientY - grabbed.y) > 3) pickUp(grabbed.id, grabbed.x, grabbed.y);
        } else if (Math.hypot(e.clientX - grabbed.x, e.clientY - grabbed.y) > 8) {
          // Moved before it was held long enough: a swipe, not a drag.
          clearTimeout(hold);
          grabbed = null;
        }
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      const f = fields.current.get(drag.id);
      if (!f?.target) return;
      const [across, d] = floorUnder(e.clientX, e.clientY);
      f.target = { ...f.target, across: across + drag.across, near: d + drag.near };
      kick.current();
    };
    const onUp = (e: PointerEvent) => {
      clearTimeout(hold);
      grabbed = null;
      const drag = dragging.current;
      if (drag) {
        dragging.current = null;
        down = null;
        const onto = fieldAt(e.clientX, e.clientY, drag.id);
        if (onto) swap(drag.id, onto);
        relay.current();
        return;
      }
      if (!down) return;
      const [dx, dy] = [e.clientX - down.x, e.clientY - down.y];
      down = null;
      const ids = order.current;
      const at = front.current ? ids.indexOf(front.current) : 0;
      const phone = room.current.focused;
      if (phone && ids.length > 1 && Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx) * 1.2) {
        // Pulled toward you: the one behind comes to the front (the one there going to the back). Pushed away: back.
        const step = dy > 0 ? 1 : -1;
        front.current = ids[(at + step + ids.length) % ids.length];
        relay.current();
        return;
      }
      if (Math.hypot(dx, dy) > 8) return;
      const id = fieldAt(e.clientX, e.clientY);
      if (!id) return;
      pick.current?.(id);
      // On a phone, a field tapped behind the one in view comes to the front. The one in view (or any, from tablet
      // width up) acts out its last play again.
      if (phone && id !== front.current) {
        front.current = id;
        relay.current();
        return;
      }
      const f = fields.current.get(id);
      if (f?.last) {
        f.waiting = [];
        f.playing = { ...f.last, start: performance.now(), told: false };
        kick.current();
      }
    };
    const onCancel = () => {
      clearTimeout(hold);
      grabbed = null;
      down = null;
      if (dragging.current) {
        dragging.current = null;
        relay.current();
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    loop();
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      clearTimeout(kickoffTimer);
      kick.current = () => {};
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[4]"
      style={{ width, height, clipPath: shown ? `inset(0 ${Math.max(0, width - shown.right)}px 0 ${Math.max(0, shown.left)}px)` : undefined }}
    />
  );
}
