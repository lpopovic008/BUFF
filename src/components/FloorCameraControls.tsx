"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FloorCamera, GRID_PX, HOME_CAMERA } from "@/lib/grid-room";
import { cameraBetween, FloorCameraStore } from "@/lib/floor-camera";
import { GlobePlace, GLOBE_MIN_ZOOM, globeFacingCamera, globePoint, globeStemTip, globeView, keepGlobe } from "@/lib/globe";
import { globeSites } from "./FloorGlobe";
import { useFloorCamera } from "./FloorGrid";
import type { MappedGame } from "./GameMap";

/** How far in the globe zooms on the next game, at most (several at once, as far as fits them all), and how much a button zooms it by. */
const FOCUS_ZOOM = 2;
const ZOOM_STEP = 1.25;
/** How far a finger or the mouse goes before it's turning the globe, not tapping it (px). */
const SLOP = 4;
/** How long a stem the next games' tags stand on, about, in rem (see FloorGlobe): kept on the screen at home. */
const STEM_REM = 3;
/** How long the Red Zone takes to sink back into the floor before the floor slides back (ms; see page). */
export const RED_ZONE_SINK_MS = 1000;
// The Red Zone coming up, step by step, from its switch (ms from when it's switched on): its switch spells out its
// whole name; rises to where the Red Zone's header stands, and lands as its title; the rest of the header runs out to
// the right from there; and the plays fade in under it. Going away, the same backwards.
const SPELL_STEP_MS = 45;
const RISE_AT_MS = 380;
const RISE_MS = 500;
const LANDED_MS = 100;
const HEAD_AT_MS = RISE_AT_MS + RISE_MS + 70;
const HEAD_MS = 450;
export const RED_ZONE_PLAYS_AT_MS = HEAD_AT_MS + HEAD_MS - 50;
export const RED_ZONE_PLAYS_MS = 400;
// Going away: the plays fade out; the header runs back into its title; the switch drops from there back to its corner,
// and goes back to RZ.
const AWAY_PLAYS_MS = 250;
const AWAY_HEAD_AT_MS = 200;
const AWAY_HEAD_MS = 300;
const DROP_AT_MS = AWAY_HEAD_AT_MS + AWAY_HEAD_MS - 20;
const DROP_MS = 520;
/** The Red Zone's name as its switch spells it out, a letter at a time. */
const SPELLING = ["RZ", "R", "RE", "RED", "RED Z", "RED ZO", "RED ZON", "RED ZONE"];

/** A mouse wheel's zoom: how much a px of its scroll zooms the globe, and how quickly it eases there (ms). */
const WHEEL_ZOOM_PER_PX = 0.0025;
const WHEEL_EASE_MS = 90;

/** Bare floor — the page's own wrappers marked data-floor, or nothing at all — not anything standing on it. */
function onFloor(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.hasAttribute("data-floor") || target === document.body || target === document.documentElement || target.tagName === "MAIN";
}

/**
 * The globe on the home page's floor (see globe.ts), turned and zoomed: dragged (a finger, or the mouse) to turn it,
 * and pinched (two fingers, or a trackpad) or scrolled (a mouse's wheel) to zoom it, wherever the floor's bare below
 * the horizon or on the globe — a pinch zooming just it, never the page, and leaving it where it's put. It turns only
 * so far, never round to the eastern hemisphere. At home it faces the week's next game to kick off, zoomed in on it —
 * or, several kicking off at once, on all of them, as close as fits them all on the screen (none still to come, the
 * US) — and moves on to the next as each kicks off. Turned by you, it stays where you put it until its home button
 * takes it back. Its Red Zone button slides the floor (`store`) toward you, whole squares at a time, till the globe's
 * gone off the screen's bottom — and the Red Zone comes up out of it (see page); again, it sinks back, and the floor
 * slides back home. The globe holds still while it's up.
 */
export function FloorCameraControls({
  store,
  globe,
  place,
  games,
  desktop,
  clearTo,
  clearFrom,
  redZone,
  map = true,
}: {
  /** The floor's camera: slid toward you for the Red Zone. */
  store: FloorCameraStore;
  /** The globe's: turned (x, d: longitude and latitude from facing the US) and zoomed. */
  globe: FloorCameraStore;
  /** Where the globe stands. */
  place: GlobePlace;
  games: MappedGame[];
  desktop: boolean;
  /** The screen x the floor's in the clear up to (from tablet width up, the starters list's left edge): the next games are kept left of it. */
  clearTo?: number;
  /** And the screen x it's in the clear from (from tablet width up, the Red Zone's column's right edge, while it's up): kept right of it. */
  clearFrom?: number;
  /** Whether the Red Zone's up out of the floor, and its switch. */
  redZone?: { on: boolean; onChange: (on: boolean) => void };
  /** Whether the globe's out on the floor (between weeks): without it, nothing turns, zooms or follows — and only the
   * Red Zone's switch is here. */
  map?: boolean;
}) {
  const redZoneUp = redZone?.on ?? false;
  const { following } = useFloorCamera(globe);
  const sites = useMemo(() => new Map(globeSites(games).map((s) => [s.id, s.at])), [games]);

  // Turned and zoomed — not while the Red Zone's up, or with no globe out.
  useEffect(() => {
    if (redZoneUp || !map) return;
    const { height, share } = place;
    const horizon = height * share;
    // The globe as it shows now: what's on it, and how far a px across it turns it.
    const view = () => globeView(place, globe.get().camera, store.get().camera);
    const onGlobe = (x: number, y: number) => {
      const v = view();
      return Math.hypot(x - v.cx, y - v.cy) <= v.R;
    };
    const pointers = new Map<number, [number, number]>();
    // What it was when the fingers (or the mouse) took hold of it: its camera, where they were, and how far apart.
    let held: { camera: FloorCamera; at: [number, number]; apart: number } | null = null;
    let moving = false;
    // A zoom's own scrolls, and a moment after, aren't taken for a slide.
    let zoomedAt = 0;
    // A pinch on a Safari trackpad: the camera it started from.
    let gesture: FloorCamera | null = null;
    const middleOf = (): [number, number] => {
      const ps = [...pointers.values()];
      return [ps.reduce((t, p) => t + p[0], 0) / ps.length, ps.reduce((t, p) => t + p[1], 0) / ps.length];
    };
    const apartOf = () => {
      const [a, b] = [...pointers.values()];
      return b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
    };
    // Taken hold of afresh, as it is now (a finger's come or gone).
    const rehold = () => {
      held = pointers.size > 0 ? { camera: globe.get().camera, at: middleOf(), apart: apartOf() } : null;
    };
    const down = (e: PointerEvent) => {
      if (!onFloor(e.target) || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (e.clientY <= horizon + 2 && !onGlobe(e.clientX, e.clientY)) return;
      if (e.pointerType === "mouse") e.preventDefault();
      // Grabbed: a wheel's zoom on its way stops where it is.
      wheelTarget = null;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      moving = pointers.size > 1 && moving;
      rehold();
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !held) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const at = middleOf();
      if (!moving && Math.hypot(at[0] - held.at[0], at[1] - held.at[1]) < SLOP && pointers.size < 2) return;
      moving = true;
      // Turned as far as they've gone (a px across it a px of its face), and zoomed as far as they've spread.
      const zoom = pointers.size > 1 && held.apart > 0 ? held.camera.zoom * (apartOf() / held.apart) : held.camera.zoom;
      if (pointers.size > 1) zoomedAt = performance.now();
      const per = 180 / Math.PI / (place.r * zoom);
      globe.move(
        keepGlobe({ zoom, x: held.camera.x - (at[0] - held.at[0]) * per, d: held.camera.d + (at[1] - held.at[1]) * per })
      );
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) moving = false;
      rehold();
    };
    // A mouse's wheel zooms it smoothly, notch on notch — each going on from where the last was headed, eased toward
    // a little of the way each frame.
    let wheelTarget: FloorCamera | null = null;
    let wheelFrame = 0;
    let wheelLast = 0;
    const wheelZoom = (factor: number) => {
      const from = wheelFrame && wheelTarget ? wheelTarget : globe.get().camera;
      wheelTarget = keepGlobe({ ...from, zoom: from.zoom * factor });
      zoomedAt = performance.now();
      if (wheelFrame) return;
      wheelLast = performance.now();
      const step = (now: number) => {
        const target = wheelTarget;
        if (!target) return void (wheelFrame = 0);
        const t = 1 - Math.exp(-(now - wheelLast) / WHEEL_EASE_MS);
        wheelLast = now;
        const next = cameraBetween(globe.get().camera, target, t);
        const done = Math.abs(next.zoom - target.zoom) < 0.002;
        globe.move(done ? target : next);
        if (done) {
          wheelTarget = null;
          wheelFrame = 0;
        } else wheelFrame = requestAnimationFrame(step);
      };
      wheelFrame = requestAnimationFrame(step);
    };
    // A pinch on a trackpad (or Ctrl/⌘ + scroll) anywhere over the floor or the globe zooms it, and never the page;
    // so does a wheel (or a trackpad's two-finger scroll) over them.
    const wheel = (e: WheelEvent) => {
      if (e.clientY <= horizon + 2 && !onGlobe(e.clientX, e.clientY)) return;
      const zoom = e.ctrlKey || e.metaKey;
      if (!zoom && !onFloor(e.target)) return;
      e.preventDefault();
      if (gesture) return;
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
      if (zoom) {
        zoomedAt = performance.now();
        const camera = globe.get().camera;
        globe.move(keepGlobe({ ...camera, zoom: camera.zoom * Math.exp(-e.deltaY * px * 0.01) }));
      } else if (performance.now() - zoomedAt > 300) {
        wheelZoom(Math.exp(-e.deltaY * px * WHEEL_ZOOM_PER_PX));
      }
    };
    // Safari's own pinch (a Mac's trackpad, or two fingers on an iPhone): never the page's zoom while it's on the
    // floor. Fingers on the floor already pinch it (above); a trackpad's pinch zooms it here.
    type Gesture = UIEvent & { scale: number; clientX: number; clientY: number };
    const gestureStart = (e: Event) => {
      const g = e as Gesture;
      if (pointers.size === 0 && (!onFloor(g.target) || (g.clientY <= horizon + 2 && !onGlobe(g.clientX, g.clientY)))) return;
      g.preventDefault();
      gesture = pointers.size === 0 ? globe.get().camera : null;
    };
    const gestureChange = (e: Event) => {
      const g = e as Gesture;
      if (!gesture && pointers.size === 0) return;
      g.preventDefault();
      if (gesture) {
        zoomedAt = performance.now();
        globe.move(keepGlobe({ ...gesture, zoom: gesture.zoom * g.scale }));
      }
    };
    const gestureEnd = (e: Event) => {
      if (!gesture && pointers.size === 0) return;
      e.preventDefault();
      gesture = null;
    };
    document.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("gesturestart", gestureStart, { passive: false });
    document.addEventListener("gesturechange", gestureChange, { passive: false });
    document.addEventListener("gestureend", gestureEnd, { passive: false });
    return () => {
      cancelAnimationFrame(wheelFrame);
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.removeEventListener("wheel", wheel);
      document.removeEventListener("gesturestart", gestureStart);
      document.removeEventListener("gesturechange", gestureChange);
      document.removeEventListener("gestureend", gestureEnd);
    };
  }, [store, globe, place, redZoneUp, map]);

  // Home: facing the next game to kick off (or the middle of those kicking off together), each on the screen between a
  // little in from its sides and its top, its stem and tag too — as zoomed in as fits them all, no more than
  // FOCUS_ZOOM, and the globe no higher than under the ticker (on a phone, than the horizon, the starters list over
  // it). With none still to come, facing the US.
  const nextGames = useMemo(() => {
    const upcoming = games.filter((g) => g.game.state === "pre" && sites.has(g.game.id));
    const kickoff = (g: MappedGame) => new Date(g.game.kickoff).getTime();
    const first = Math.min(...upcoming.map(kickoff));
    const next = upcoming.filter((g) => kickoff(g) === first).map((g) => g.game.id);
    const key = `${map ? next.join(",") : "no map"}|${desktop}|${place.width}x${place.height}|${Math.round(clearTo ?? 0)}|${Math.round(clearFrom ?? 0)}`;
    if (!map || next.length === 0) return { key, camera: HOME_CAMERA };
    const { width, height } = place;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const box = {
      left: Math.max(width * 0.12, (clearFrom ?? 0) + width * 0.06),
      right: Math.min(width * 0.88, (clearTo ?? width) - width * 0.06),
      top: height * 0.15,
      bottom: height,
    };
    const points = next.map((id) => sites.get(id)!);
    // The middle of them: their average direction from the globe's middle.
    const rad = Math.PI / 180;
    const sum = points.reduce(
      (t, [lon, lat]) => [t[0] + Math.cos(lat * rad) * Math.cos(lon * rad), t[1] + Math.cos(lat * rad) * Math.sin(lon * rad), t[2] + Math.sin(lat * rad)],
      [0, 0, 0]
    );
    const center = [Math.atan2(sum[1], sum[0]) / rad, Math.atan2(sum[2], Math.hypot(sum[0], sum[1])) / rad];
    const highest = desktop ? height * 0.18 : height * place.share - 12;
    const fits = (zoom: number) => {
      const view = globeView(place, globeFacingCamera(center[0], center[1], zoom), HOME_CAMERA);
      if (view.cy - view.R < highest) return false;
      return points.every(([lon, lat]) => {
        const [x, y] = globePoint(view, lon, lat);
        const [, tipY] = globeStemTip(view, lon, lat, STEM_REM * rootPx);
        return x >= box.left && x <= box.right && tipY >= box.top && y <= box.bottom;
      });
    };
    let zoom = FOCUS_ZOOM;
    if (!fits(zoom)) {
      let [lo, hi] = [GLOBE_MIN_ZOOM, FOCUS_ZOOM];
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      zoom = lo;
    }
    return { key, camera: globeFacingCamera(center[0], center[1], zoom) };
  }, [games, sites, place, clearTo, clearFrom, map, desktop]);
  // At home, it goes to the next games whenever they change (one kicks off) — not otherwise, live scores and all.
  const atHome = useRef<string | null>(null);
  useEffect(() => {
    if (!globe.get().following || atHome.current === nextGames.key) return;
    atHome.current = nextGames.key;
    globe.glide(nextGames.camera, true);
  }, [nextGames, globe]);
  const goToNextGames = useCallback(() => {
    atHome.current = nextGames.key;
    globe.glide(nextGames.camera, true);
  }, [nextGames, globe]);

  const goHome = () => {
    if (redZoneUp) return toggleRedZone();
    goToNextGames();
  };
  const toggleRedZone = () => redZone?.onChange(!redZoneUp);
  // The Red Zone coming up (switched on here, or on its own as the week's first game kicks off): the floor slid toward
  // you a whole number of squares (so its lines end up where they were), the globe on it gone off the screen's bottom.
  // Going back down: once it's sunk, the floor back home, and the globe on the next games. (Up already when these first
  // show: slid all the same.)
  const wasUp = useRef(false);
  useEffect(() => {
    if (wasUp.current === redZoneUp) return;
    wasUp.current = redZoneUp;
    if (redZoneUp) {
      // (With no globe out, there's nothing to slide out of its way.)
      if (!map) return;
      const turned = globe.get().camera;
      let squares = 1;
      while (squares < 200) {
        const view = globeView(place, turned, { zoom: 1, x: 0, d: squares * GRID_PX });
        if (view.cy - view.R > place.height + 8) break;
        squares++;
      }
      store.glide({ zoom: 1, x: 0, d: squares * GRID_PX }, false);
      return;
    }
    window.setTimeout(() => {
      store.glide(HOME_CAMERA, true);
      goToNextGames();
    }, RED_ZONE_SINK_MS);
  }, [redZoneUp, place, store, globe, goToNextGames, map]);
  // The globe put away (the week's under way): the floor back home, and the globe facing the US again.
  useEffect(() => {
    if (map) return;
    store.glide(HOME_CAMERA, true);
    globe.glide(HOME_CAMERA, true);
  }, [map, store, globe]);
  // Its switch becoming the Red Zone's header as it comes up (and back), step by step (see RISE_AT_MS and the rest): the
  // header's title (`data-rz-title`) its switch while it's up; the rest of the header (`data-rz-head`) and its plays
  // (`data-rz-plays`) brought in after it.
  const switchRef = useRef<HTMLButtonElement>(null);
  const [spelled, setSpelled] = useState(0);
  const flewUp = useRef(false);
  // (Before it's drawn, so nothing of it shows before its turn.)
  useLayoutEffect(() => {
    if (flewUp.current === redZoneUp) return;
    flewUp.current = redZoneUp;
    const button = switchRef.current;
    const title = document.querySelector<HTMLElement>("[data-rz-title]");
    const head = document.querySelector<HTMLElement>("[data-rz-head]");
    const plays = document.querySelector<HTMLElement>("[data-rz-plays]");
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const spell = (from: number, to: number, start: number) => {
      const step = to > from ? 1 : -1;
      for (let n = from + step, k = 1; step > 0 ? n <= to : n >= to; n += step, k++) {
        const letters = n;
        at(start + k * SPELL_STEP_MS, () => setSpelled(letters));
      }
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!button || !title || reduced) {
      at(0, () => setSpelled(redZoneUp ? SPELLING.length - 1 : 0));
      return () => timers.forEach(clearTimeout);
    }
    // Whatever was left over from the last time, done with.
    for (const el of [button, title, head, plays]) el?.getAnimations().forEach((a) => a.cancel());
    const titleBox = title.getBoundingClientRect();
    const headBox = head?.getBoundingClientRect();
    // Clipped to its title alone, from the right.
    const toTitle = headBox ? `inset(0 ${Math.max(0, headBox.right - titleBox.right)}px 0 0)` : "inset(0)";
    // Straight up (or down) to the title's level: the title stands right over the switch.
    const there = () => {
      const from = button.getBoundingClientRect();
      const to = title.getBoundingClientRect();
      return `translateY(${to.top + (to.height - from.height) / 2 - from.top}px)`;
    };
    // The switch as the title is: no plate, just its words in ink.
    const bare = { backgroundColor: "transparent", color: "var(--ink-primary)" };
    if (redZoneUp) {
      // Hidden till they come in.
      title.animate([{ opacity: 0 }, { opacity: 0 }], { duration: RISE_AT_MS + RISE_MS, fill: "backwards" });
      head?.animate([{ clipPath: toTitle }, { clipPath: "inset(0)" }], { duration: HEAD_MS, delay: HEAD_AT_MS, easing: "ease-out", fill: "backwards" });
      plays?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: RED_ZONE_PLAYS_MS, delay: RED_ZONE_PLAYS_AT_MS, easing: "ease-out", fill: "backwards" });
      button.animate([{ opacity: 1 }, { opacity: 1 }], { duration: RISE_AT_MS, fill: "backwards" });
      spell(0, SPELLING.length - 1, 0);
      at(RISE_AT_MS, () => {
        const to = there();
        // Up, then its plate falling away — its words the title's — and the title there in its place.
        const landed = RISE_MS / (RISE_MS + LANDED_MS);
        button.animate(
          [
            { transform: "none", opacity: 1 },
            { transform: to, opacity: 1, offset: landed },
            { transform: to, opacity: 1, ...bare, offset: 0.99 },
            { transform: to, opacity: 0, ...bare },
          ],
          { duration: RISE_MS + LANDED_MS, easing: "ease-in-out" }
        );
        title.animate([{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }], { duration: LANDED_MS, delay: RISE_MS });
      });
    } else {
      at(0, () => setSpelled(SPELLING.length - 1));
      plays?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: AWAY_PLAYS_MS, fill: "forwards" });
      head?.animate([{ clipPath: "inset(0)" }, { clipPath: toTitle }], { duration: AWAY_HEAD_MS, delay: AWAY_HEAD_AT_MS, easing: "ease-in", fill: "both" });
      title.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, delay: DROP_AT_MS, fill: "forwards" });
      button.animate([{ opacity: 0 }, { opacity: 0 }], { duration: DROP_AT_MS, fill: "backwards" });
      at(DROP_AT_MS, () => {
        const to = there();
        // The title turning back into the switch where it stands (its plate coming back), then down.
        button.animate(
          [
            { transform: to, opacity: 1, ...bare },
            { transform: to, opacity: 1, offset: LANDED_MS / (LANDED_MS + DROP_MS) },
            { transform: "none", opacity: 1 },
          ],
          { duration: LANDED_MS + DROP_MS, easing: "ease-in-out" }
        );
      });
      spell(SPELLING.length - 1, 0, DROP_AT_MS + LANDED_MS + DROP_MS);
    }
    return () => timers.forEach(clearTimeout);
  }, [redZoneUp]);
  const zoomBy = (factor: number) => {
    const camera = globe.get().camera;
    globe.glide(keepGlobe({ ...camera, zoom: camera.zoom * factor }), false);
  };

  const plate =
    "pointer-events-auto flex h-7 min-w-7 cursor-pointer items-center justify-center bg-[var(--map-tag)] px-1.5 text-xs font-bold leading-none text-[var(--map-tag-ink)] transition-opacity hover:opacity-90";
  // The Red Zone's switch and the way home bigger to tap (their text no bigger).
  const big = "!h-10 !min-w-10 !px-3";
  const home = (
    <button type="button" aria-label="Back home" title="Back home" onClick={goHome} className={`${plate} ${big}`}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
        <path d="M2 7.5 8 2l6 5.5M3.5 6.5V14h3.5v-4h2v4h3.5V6.5" />
      </svg>
    </button>
  );
  // The Red Zone's switch: its dot, and RZ (spelled out as it goes up into the Red Zone's header — gone from here
  // while it's up, its title its switch).
  const tucked = redZoneUp;
  const redZoneButton = redZone ? (
    <button
      ref={switchRef}
      type="button"
      aria-label="Red Zone"
      title="Red Zone"
      aria-pressed={redZoneUp}
      aria-hidden={tucked || undefined}
      tabIndex={tucked ? -1 : undefined}
      onClick={toggleRedZone}
      className={`${plate} ${big} gap-1 whitespace-pre ${tucked ? "!pointer-events-none opacity-0" : ""}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-status-critical" aria-hidden />
      {SPELLING[spelled]}
    </button>
  ) : null;
  // The Red Zone's switch in the screen's bottom-left corner; in its bottom-right, the way home while it's away, and
  // from tablet width up zoom buttons too (for a mouse with no pinch). On a phone, over the tab bar.
  const corner = desktop ? "bottom-3" : "bottom-[calc(var(--tabbar-h,0px)+0.75rem)]";
  return (
    <>
      <div className={`pointer-events-none fixed left-4 z-20 flex gap-1 ${corner}`}>{redZoneButton}</div>
      <div className={`pointer-events-none fixed right-4 z-20 flex items-end gap-1 ${corner}`}>
        {map && desktop && !redZoneUp ? (
          <>
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} className={plate}>
              −
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} className={plate}>
              +
            </button>
          </>
        ) : null}
        {following || redZoneUp || !map ? null : home}
      </div>
    </>
  );
}
