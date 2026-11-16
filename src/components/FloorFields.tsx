"use client";

import { useEffect, useRef } from "react";
import { BallLeg, ballAt, FieldMark, FieldPlace, Flight, flightFor, Point } from "@/lib/ball-flight";
import { FIELD_WIDE, FieldFloor, FieldSpot, layFields, layFocused, MOST_FIELDS } from "@/lib/field-layout";
import { floorPoint, floorScale } from "@/lib/grid-room";
import { nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import type { NFLGame } from "@/lib/nfl-schedule";
import { playFromLastPlay } from "@/lib/play-by-play";
import { PlayScene, sceneFor } from "@/lib/play-scene";

// As on television: the line of scrimmage in blue.
const SCRIMMAGE = "#2f7cf6";
const FLAG = { yellow: "#f5d020", red: "#e5484d" };
const POSTS = "#f2c94c";
const BALL = "#8b5a2b";
/** How quickly a field eases to where it's laid (ms), and fades on or off the floor. */
const EASE_MS = 140;
/** Plays waiting their turn on a field, at most. */
const QUEUE = 3;
/** How far a swipe goes before it moves the fields (px). */
const SWIPE_PX = 28;

/** Where a game stands: who has the ball, and how far they have to go to the end zone. */
interface Situation {
  possession: string | null;
  toGo: number | null;
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
  /** The play going on, and those waiting. */
  playing: { flight: Flight; start: number; offense: string; los: number } | null;
  waiting: { flight: Flight; offense: string; los: number }[];
}

const situationOf = (game: NFLGame): Situation => ({
  possession: game.live?.possession ?? null,
  toGo: game.live?.yardsToEndzone ?? null,
});

/** Which way a team goes on its game's field: the road team toward the right end zone, the home team toward the left. */
const dirOf = (game: NFLGame, team: string | null): 1 | -1 => (team === game.homeTeam ? -1 : 1);
/** Where a team with `toGo` yards to the end zone has the ball (x, from the left goal line). */
const spotOf = (dir: 1 | -1, toGo: number) => (dir > 0 ? 100 - toGo : toGo);

/**
 * Every game being played, a field of its own laid on the room's floor (see field-layout): its line of scrimmage, and
 * the logo of the team with the ball standing behind it, the way they're going — and each play as it comes in, told by
 * the ball (see ball-flight). From tablet width up the fields share the floor between the Red Zone and the starters
 * list; on a phone, the game in view across the floor's front and the rest behind it — swiped up or down (or tapped)
 * to bring another to the front.
 */
export function FloorFields({
  games,
  width,
  height,
  share,
  floor,
  focused = false,
  onPick,
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
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fields = useRef(new Map<string, FieldState>());
  const room = useRef({ width, height, share, floor, focused });
  // The game in view on a phone, and the games on, in order.
  const front = useRef<string | null>(null);
  const order = useRef<string[]>([]);
  // Drawn again (and on, while anything's moving).
  const kick = useRef(() => {});
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  // Laid out again: where each field goes for the games on, and the room as it is.
  const relay = useRef(() => {
    const { width: w, height: h, share: sh, floor: f, focused: phone } = room.current;
    const ids = order.current;
    if (phone && (!front.current || !ids.includes(front.current))) front.current = ids[0] ?? null;
    const at = phone && front.current ? ids.indexOf(front.current) : 0;
    const shown = (phone ? [...ids.slice(at), ...ids.slice(0, at)] : ids).slice(0, MOST_FIELDS);
    const lay = { ...f, width: w, height: h, share: sh };
    const spots = phone ? layFocused(shown.length, lay) : layFields(shown.length, lay);
    for (const [id, state] of fields.current) {
      const k = shown.indexOf(id);
      state.target = k >= 0 ? (spots[k] ?? null) : null;
      if (!state.spot && state.target) state.spot = state.target;
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
        state = { game, spot: null, alpha: 0, target: null, lastPlayId: lastPlay?.id ?? null, situation: situationOf(game), los: null, playing: null, waiting: [] };
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
      state.waiting.push({ flight: flightFor(scene, place, seed), offense: scene.offense, los: place(scene).los });
      while (state.waiting.length > QUEUE) state.waiting.shift();
      if (!state.playing) {
        const next = state.waiting.shift()!;
        state.playing = { ...next, start: now };
      }
    }
    order.current = games.map((g) => g.id);
    relay.current();
  }, [games]);

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
        tag: v("--map-tag", "#1f1f1f"),
        tagInk: v("--map-tag-ink", "#f4f4f4"),
      };
    };
    const type = getComputedStyle(document.body).fontFamily;
    let frame = 0;
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
        // The play on, over: the next in.
        if (f.playing && (now - f.playing.start) / 1000 > f.playing.flight.length) {
          const next = f.waiting.shift();
          f.playing = next ? { ...next, start: now } : null;
        }
        if (f.playing) moving = true;
        const { possession, toGo } = f.situation;
        const lineTo = f.playing ? f.playing.los : possession && toGo !== null ? spotOf(dirOf(f.game, possession), toGo) : null;
        if (lineTo === null) f.los = null;
        else {
          f.los = f.los === null ? lineTo : f.los + (lineTo - f.los) * k;
          if (Math.abs(f.los - lineTo) > 0.05) moving = true;
          else f.los = lineTo;
        }
      }
      // Farthest first, so nearer ones are drawn over them.
      const drawn = [...fields.current.values()].filter((f) => f.spot && f.alpha > 0.01).sort((a, b) => a.spot!.near - b.spot!.near);
      for (const f of drawn) drawField(f, now);
      if (moving) loop();

      function drawField(f: FieldState, now: number) {
        const spot = f.spot!;
        const half = FIELD_WIDE / 2;
        // Where field point (x, z) shows: x yards along it from its left goal line, z across it from its middle, toward you.
        const depth = (z: number) => spot.near - (half - z) * spot.yard;
        const at = (x: number, z: number) => floorPoint(spot.across + (x - 50) * spot.yard, depth(z), w, h, sh);
        // A yard on the screen, where z is.
        const yardPx = (z: number) => spot.yard * floorScale(depth(z));
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
        ctx.fillStyle = colors.ink;
        for (const [x0, x1] of [
          [-10, 0],
          [100, 110],
        ]) {
          ctx.globalAlpha = alpha * 0.06;
          quad(x0, x1);
          ctx.closePath();
          ctx.fill();
        }
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
        }

        // The line of scrimmage, sideline to sideline; the team with the ball's logo standing behind it.
        if (f.los !== null) {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = SCRIMMAGE;
          ctx.lineWidth = Math.max(1.5, Math.min(3, yardPx(0) * 0.35));
          line(f.los, -half, f.los, half);
          const team = f.playing ? f.playing.offense : f.situation.possession;
          const img = team ? logo(team) : null;
          if (team && img) {
            const dir = dirOf(f.game, team);
            const [lx, ly] = at(Math.max(-8, Math.min(108, f.los - dir * 9)), 0);
            const size = nflLogoSize(team, Math.max(10, yardPx(0) * 8));
            ctx.globalAlpha = alpha * 0.92;
            ctx.drawImage(img, lx - size.width / 2, ly - size.height * 0.85, size.width, size.height);
          }
        }

        // Each team's name, standing in its own end zone — as small as keeps it clear of the field beside it.
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = colors.ink;
        ctx.globalAlpha = alpha * 0.75;
        const room = 1.7 * Math.abs(at(0, -half * 0.2)[0] - at(-10, -half * 0.2)[0]);
        for (const [x, team] of [
          [-5, f.game.awayTeam],
          [105, f.game.homeTeam],
        ] as const) {
          const [sx, sy] = at(x, -half * 0.2);
          let font = Math.max(9, Math.min(15, yardPx(0) * 3.2));
          ctx.font = `600 ${font}px ${type}`;
          const wide = ctx.measureText(team).width;
          if (wide > room) {
            font = Math.max(7, (font * room) / wide);
            ctx.font = `600 ${font}px ${type}`;
          }
          ctx.fillText(team, sx, sy - 2);
        }

        if (f.playing) {
          for (const m of marks) if (m.kind === "posts" && t <= m.until + 0.3) drawPosts(m, Math.min(1, (m.until + 0.3 - t) / 0.3));
          for (const m of marks) if (m.kind === "flag") drawFlag(m, t);
          const ball = ballAt(f.playing.flight, t);
          if (ball) drawBall(ball.at, ball.alpha, ball.spin, t, f.playing.flight);
          drawLabel(f.playing.flight, t);
        }
        ctx.restore();

        // What the play was, on a tag over the field's far sideline while it's on — faded in, and out at its end.
        function drawLabel(flight: Flight, t: number) {
          const label = flight.labels.filter((l) => t >= l.t).at(-1);
          if (!label) return;
          const fade = Math.min(1, (t - label.t) / 0.2, (flight.length - t) / 0.4);
          if (fade <= 0) return;
          const font = Math.max(10, Math.min(13, yardPx(-half) * 2.4));
          ctx.font = `600 ${font}px ${type}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const [cx, farY] = at(50, -half);
          const tall = font + 8;
          const wide = ctx.measureText(label.text).width + 14;
          const y = farY - 6 - tall / 2;
          ctx.globalAlpha = alpha * fade;
          ctx.fillStyle = colors.tag;
          ctx.fillRect(cx - wide / 2, y - tall / 2, wide, tall);
          ctx.fillStyle = colors.tagInk;
          ctx.fillText(label.text, cx, y + 0.5);
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
        function drawBall([x, z, hgt]: Point, fade: number, spin: BallLeg["spin"], t: number, flight: Flight) {
          const yp = yardPx(z);
          const [gx, gy] = at(x, z);
          const by = gy - hgt * yp;
          ctx.globalAlpha = alpha * fade * 0.3 * Math.max(0.25, 1 - hgt / 16);
          ctx.fillStyle = colors.ink;
          ctx.beginPath();
          const shadow = Math.max(4, yp * 1.1);
          ctx.ellipse(gx, gy, shadow, shadow * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          let angle: number;
          if (spin === "tumble") angle = t * 13;
          else {
            const before = ballAt(flight, Math.max(0, t - 0.03));
            if (before) {
              const [px, py] = at(before.at[0], before.at[1]);
              const dy = by - (py - before.at[2] * yardPx(before.at[1]));
              const dx = gx - px;
              angle = Math.abs(dx) + Math.abs(dy) > 0.05 ? Math.atan2(dy, dx) : 0;
            } else angle = 0;
          }
          const long = Math.max(9, yp * 2.2);
          const girth = Math.max(5.5, yp * 1.3) * (spin === "spiral" ? 0.8 + 0.2 * Math.abs(Math.sin(t * 40)) : 1);
          ctx.globalAlpha = alpha * fade;
          ctx.save();
          ctx.translate(gx, by);
          ctx.rotate(angle);
          ctx.fillStyle = BALL;
          ctx.beginPath();
          ctx.ellipse(0, 0, long / 2, girth / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#f2f2f2";
          ctx.lineWidth = Math.max(0.75, girth * 0.14);
          ctx.beginPath();
          ctx.moveTo(-long * 0.16, 0);
          ctx.lineTo(long * 0.16, 0);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // The field at screen point (x, y), if any: inside its four corners as they show.
    const fieldAt = (x: number, y: number): string | null => {
      const { width: w, height: h, share: sh } = room.current;
      const half = FIELD_WIDE / 2;
      for (const [id, f] of fields.current) {
        const s = f.target;
        if (!s) continue;
        const p = (fx: number, z: number) => floorPoint(s.across + (fx - 50) * s.yard, s.near - (half - z) * s.yard, w, h, sh);
        const corners = [p(-10, -half), p(110, -half), p(110, half), p(-10, half)];
        const inside = corners.every(([ax, ay], i) => {
          const [bx, by] = corners[(i + 1) % 4];
          return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
        });
        if (inside) return id;
      }
      return null;
    };

    // On a phone: the fields swiped up or down the floor, the next one brought to the front — or one tapped. Anywhere,
    // a field tapped is told (see onPick).
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      const { height: h, share: sh, floor: f, focused: phone } = room.current;
      down = null;
      const swipes = phone && order.current.length > 1;
      if ((!swipes && !pick.current) || e.clientY < h * sh || e.clientY > f.front + 12) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("button, a, input, select, textarea, label, [role='button'], [data-scroll-list], [data-floor-ui], header, nav")) return;
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
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
      // On a phone, a field tapped behind the one in view comes to the front.
      if (phone && id !== front.current) {
        front.current = id;
        relay.current();
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    loop();
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      cancelAnimationFrame(frame);
      kick.current = () => {};
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[4]" style={{ width, height }} />;
}
