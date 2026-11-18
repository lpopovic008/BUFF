"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FloorCamera, GRID_PX, HOME_CAMERA } from "@/lib/grid-room";
import { cameraBetween, FloorCameraStore } from "@/lib/floor-camera";
import { keepMap, mapPutting, ProjectorPlace, projectorUnder, projectorView } from "@/lib/projector";
import { useFloorCamera } from "./FloorGrid";

/** How much a button zooms the map by. */
const ZOOM_STEP = 1.25;
/** How far a finger or the mouse goes before it's moving the map, not tapping it (px). */
const SLOP = 4;
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

/** A mouse wheel's zoom: how much a px of its scroll zooms the map, and how quickly it eases there (ms). */
const WHEEL_ZOOM_PER_PX = 0.0025;
const WHEEL_EASE_MS = 90;

/** Bare floor — the page's own wrappers marked data-floor, or nothing at all — not anything standing on it. */
function onFloor(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.hasAttribute("data-floor") || target === document.body || target === document.documentElement || target.tagName === "MAIN";
}

/**
 * The projected map on the home page (see projector.ts), moved and zoomed within its frame: dragged (a finger, or the
 * mouse) to move it, and pinched (two fingers, or a trackpad) or scrolled (a mouse's wheel) to zoom it, about where
 * you're pinching or pointing, wherever the floor's bare below the horizon or on the frame — a pinch zooming just it,
 * never the page, and leaving it where it's put. At home the whole map's in its frame; moved by you, it stays where
 * you put it until its home button (or a double-click on it) takes it back. Its Red Zone button slides the floor (`store`) toward you, whole squares at a time, till the
 * projector's gone off the screen's bottom — and the Red Zone comes up out of it (see page); again, it sinks back, and
 * the floor slides back home. The map holds still while it's up.
 */
export function FloorCameraControls({
  store,
  map: picture,
  place,
  desktop,
  redZone,
  out = true,
}: {
  /** The floor's camera: slid toward you for the Red Zone. */
  store: FloorCameraStore;
  /** The map's: moved within its frame (x, d: map units from its middle) and zoomed. */
  map: FloorCameraStore;
  /** Where the projector stands. */
  place: ProjectorPlace;
  desktop: boolean;
  /** Whether the Red Zone's up out of the floor, and its switch. */
  redZone?: { on: boolean; onChange: (on: boolean) => void };
  /** Whether the map's out (between weeks): without it, nothing moves, zooms or follows — and only the Red Zone's
   * switch is here. */
  out?: boolean;
}) {
  const map = out;
  const redZoneUp = redZone?.on ?? false;
  const { following } = useFloorCamera(picture);
  // Where the projector's spot is now (the floor under it slid, or not): its buttons stand under it.
  const slid = useFloorCamera(store).camera;
  const [spotX, spotY] = projectorView(place, HOME_CAMERA, slid).source;
  // Back home, as its home button takes it (double-clicked; see below) — kept for the handlers set up once.
  const homeAgain = useRef(() => {});

  // Moved and zoomed — not while the Red Zone's up, or with no map out.
  useEffect(() => {
    if (redZoneUp || !map) return;
    const { height, share } = place;
    const horizon = height * share;
    // The projector as it shows now, and whether a point's on its frame.
    const view = () => projectorView(place, picture.get().camera, store.get().camera);
    const onFrame = (x: number, y: number) => {
      const { frame } = view();
      return x >= frame.left && x <= frame.left + frame.width && y >= frame.top && y <= frame.top + frame.height;
    };
    const pointers = new Map<number, [number, number]>();
    // What it was when the fingers (or the mouse) took hold of it: its camera, the map point under them, where they
    // were, and how far apart.
    let held: { camera: FloorCamera; grab: [number, number]; at: [number, number]; apart: number } | null = null;
    let moving = false;
    // A zoom's own scrolls, and a moment after, aren't taken for a slide.
    let zoomedAt = 0;
    // A pinch on a Safari trackpad: the camera it started from, and the map point under it.
    let gesture: { camera: FloorCamera; grab: [number, number]; at: [number, number] } | null = null;
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
      if (pointers.size === 0) return void (held = null);
      const at = middleOf();
      held = { camera: picture.get().camera, grab: projectorUnder(view(), ...at), at, apart: apartOf() };
    };
    const put = (grab: [number, number], at: [number, number], zoom: number) => mapPutting(place, grab, at, zoom, store.get().camera);
    const down = (e: PointerEvent) => {
      if (!onFloor(e.target) || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (e.clientY <= horizon + 2 && !onFrame(e.clientX, e.clientY)) return;
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
      // The map point they took hold of kept under them, zoomed as far as they've spread.
      const zoom = pointers.size > 1 && held.apart > 0 ? held.camera.zoom * (apartOf() / held.apart) : held.camera.zoom;
      if (pointers.size > 1) zoomedAt = performance.now();
      picture.move(put(held.grab, at, zoom));
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) moving = false;
      rehold();
    };
    // A mouse's wheel zooms it smoothly about the pointer, notch on notch — each going on from where the last was
    // headed, eased toward a little of the way each frame.
    let wheelTarget: FloorCamera | null = null;
    let wheelFrame = 0;
    let wheelLast = 0;
    const wheelZoom = (factor: number, at: [number, number]) => {
      const from = wheelFrame && wheelTarget ? wheelTarget : picture.get().camera;
      const grab = projectorUnder(projectorView(place, from, store.get().camera), ...at);
      wheelTarget = put(grab, at, from.zoom * factor);
      zoomedAt = performance.now();
      if (wheelFrame) return;
      wheelLast = performance.now();
      const step = (now: number) => {
        const target = wheelTarget;
        if (!target) return void (wheelFrame = 0);
        const t = 1 - Math.exp(-(now - wheelLast) / WHEEL_EASE_MS);
        wheelLast = now;
        const next = cameraBetween(picture.get().camera, target, t);
        const done = Math.abs(next.zoom - target.zoom) < 0.002 && Math.abs(next.x - target.x) < 0.05 && Math.abs(next.d - target.d) < 0.05;
        picture.move(done ? target : next);
        if (done) {
          wheelTarget = null;
          wheelFrame = 0;
        } else wheelFrame = requestAnimationFrame(step);
      };
      wheelFrame = requestAnimationFrame(step);
    };
    // A pinch on a trackpad (or Ctrl/⌘ + scroll) anywhere over the floor or the frame zooms it, and never the page; so
    // does a wheel (or a trackpad's two-finger scroll) over them.
    const wheel = (e: WheelEvent) => {
      if (e.clientY <= horizon + 2 && !onFrame(e.clientX, e.clientY)) return;
      const zoom = e.ctrlKey || e.metaKey;
      if (!zoom && !onFloor(e.target)) return;
      e.preventDefault();
      if (gesture) return;
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
      const at: [number, number] = [e.clientX, e.clientY];
      if (zoom) {
        zoomedAt = performance.now();
        const camera = picture.get().camera;
        picture.move(put(projectorUnder(view(), ...at), at, camera.zoom * Math.exp(-e.deltaY * px * 0.01)));
      } else if (performance.now() - zoomedAt > 300) {
        wheelZoom(Math.exp(-e.deltaY * px * WHEEL_ZOOM_PER_PX), at);
      }
    };
    // Safari's own pinch (a Mac's trackpad, or two fingers on an iPhone): never the page's zoom while it's on the
    // floor. Fingers on the floor already pinch it (above); a trackpad's pinch zooms it here.
    type Gesture = UIEvent & { scale: number; clientX: number; clientY: number };
    const gestureStart = (e: Event) => {
      const g = e as Gesture;
      if (pointers.size === 0 && (!onFloor(g.target) || (g.clientY <= horizon + 2 && !onFrame(g.clientX, g.clientY)))) return;
      g.preventDefault();
      const at: [number, number] = [g.clientX, g.clientY];
      gesture = pointers.size === 0 ? { camera: picture.get().camera, grab: projectorUnder(view(), ...at), at } : null;
    };
    const gestureChange = (e: Event) => {
      const g = e as Gesture;
      if (!gesture && pointers.size === 0) return;
      g.preventDefault();
      if (gesture) {
        zoomedAt = performance.now();
        picture.move(put(gesture.grab, gesture.at, gesture.camera.zoom * g.scale));
      }
    };
    const gestureEnd = (e: Event) => {
      if (!gesture && pointers.size === 0) return;
      e.preventDefault();
      gesture = null;
    };
    // Double-clicked on the floor or the frame: the map back home.
    const twice = (e: MouseEvent) => {
      if (!onFloor(e.target) || (e.clientY <= horizon + 2 && !onFrame(e.clientX, e.clientY))) return;
      e.preventDefault();
      homeAgain.current();
    };
    document.addEventListener("dblclick", twice);
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
      document.removeEventListener("dblclick", twice);
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.removeEventListener("wheel", wheel);
      document.removeEventListener("gesturestart", gestureStart);
      document.removeEventListener("gesturechange", gestureChange);
      document.removeEventListener("gestureend", gestureEnd);
    };
  }, [store, picture, place, redZoneUp, map]);

  // Home: the whole map in its frame.
  const nextGames = useMemo(() => ({ key: `${map}|${place.width}x${place.height}`, camera: HOME_CAMERA }), [place, map]);
  // At home, it goes back there whenever the room's resized or the map comes out.
  const atHome = useRef<string | null>(null);
  useEffect(() => {
    if (!picture.get().following || atHome.current === nextGames.key) return;
    atHome.current = nextGames.key;
    picture.glide(nextGames.camera, true);
  }, [nextGames, picture]);
  const goToNextGames = useCallback(() => {
    atHome.current = nextGames.key;
    picture.glide(nextGames.camera, true);
  }, [nextGames, picture]);
  useEffect(() => {
    homeAgain.current = goToNextGames;
  }, [goToNextGames]);

  const goHome = () => {
    if (redZoneUp) return toggleRedZone();
    goToNextGames();
  };
  const toggleRedZone = () => redZone?.onChange(!redZoneUp);
  // The Red Zone coming up (switched on here, or on its own as the week's first game kicks off): the floor slid toward
  // you a whole number of squares (so its lines end up where they were), the projector on it gone off the screen's
  // bottom. Going back down: once it's sunk, the floor back home, and the map on the next games. (Up already when these
  // first show: slid all the same.)
  const wasUp = useRef(false);
  useEffect(() => {
    if (wasUp.current === redZoneUp) return;
    wasUp.current = redZoneUp;
    if (redZoneUp) {
      // (With no map out, there's nothing to slide out of its way.)
      if (!map) return;
      let squares = 1;
      while (squares < 200 && projectorView(place, HOME_CAMERA, { zoom: 1, x: 0, d: squares * GRID_PX }).frame.top <= place.height + 8) squares++;
      store.glide({ zoom: 1, x: 0, d: squares * GRID_PX }, false);
      return;
    }
    window.setTimeout(() => {
      store.glide(HOME_CAMERA, true);
      goToNextGames();
    }, RED_ZONE_SINK_MS);
  }, [redZoneUp, place, store, goToNextGames, map]);
  // The map put away (the week's under way): the floor back home, and the whole map in its frame again.
  useEffect(() => {
    if (map) return;
    store.glide(HOME_CAMERA, true);
    picture.glide(HOME_CAMERA, true);
  }, [map, store, picture]);
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
    const camera = picture.get().camera;
    picture.glide(keepMap({ ...camera, zoom: camera.zoom * factor }), false);
  };

  const plate =
    "pointer-events-auto flex h-7 min-w-7 cursor-pointer items-center justify-center bg-[var(--map-tag)] px-1.5 text-xs font-bold leading-none text-[var(--map-tag-ink)] transition-opacity hover:opacity-90";
  // The Red Zone's switch bigger to tap (its text no bigger).
  const big = "!h-10 !min-w-10 !px-3";
  // The map's own buttons: see-through, just outlined.
  const clear =
    "pointer-events-auto flex h-8 min-w-8 cursor-pointer items-center justify-center border border-[color-mix(in_srgb,var(--ink-primary)_30%,transparent)] bg-transparent px-2 text-xs font-bold leading-none text-ink-primary transition-colors hover:border-[color-mix(in_srgb,var(--ink-primary)_65%,transparent)]";
  const home = (
    <button type="button" aria-label="Back home" title="Back home (or double-click the map)" onClick={goHome} className={clear}>
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
  // The Red Zone's switch in the screen's bottom-left corner (on a phone, over the tab bar). The map's buttons in the
  // middle under the projector's spot (kept up off the screen's bottom, or a phone's tab bar): from tablet width up,
  // zoom buttons (for a mouse with no pinch); and the way home while it's away.
  const corner = desktop ? "bottom-3" : "bottom-[calc(var(--tabbar-h,0px)+0.75rem)]";
  const zooms = map && desktop && !redZoneUp;
  const homeShown = !(following || redZoneUp || !map);
  return (
    <>
      <div className={`pointer-events-none fixed left-4 z-20 flex gap-1 ${corner}`}>{redZoneButton}</div>
      {zooms || homeShown ? (
        <div className="pointer-events-none fixed z-20 flex -translate-x-1/2 gap-1" style={{ left: spotX, top: `min(${spotY + 12}px, calc(100dvh - var(--tabbar-h, 0px) - 2.75rem))` }}>
          {zooms ? (
            <>
              <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} className={clear}>
                −
              </button>
              <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} className={clear}>
                +
              </button>
            </>
          ) : null}
          {/* (Its place kept beside the zoom buttons while it's not needed, so they hold still.) */}
          {homeShown ? home : zooms ? <span className="invisible">{home}</span> : null}
        </div>
      ) : null}
    </>
  );
}
