"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FloorCamera, floorAt, floorDepth, floorScale, floorY, GRID_PX, HOME_CAMERA } from "@/lib/grid-room";
import { FloorMapFit, floorMapFloor, MAP_BOUNDS } from "@/lib/floor-map";
import { cameraPutting, cameraUnder, FloorCameraStore, FloorPt, keepOnFloor, pinchCamera, zoomCameraAt } from "@/lib/floor-camera";
import { mapSites } from "./FloorMap";
import { useFloorCamera } from "./FloorGrid";
import type { MappedGame } from "./GameMap";

/** How far in the floor zooms on the game it glides to, and how much a button zooms it by. */
const FOCUS_ZOOM = 1.6;
const ZOOM_STEP = 1.25;
/** How far a finger or the mouse goes before it's moving the floor, not tapping it (px). */
const SLOP = 4;
/** How much of the map's kept on the screen, however far it's moved off it (px). */
const MAP_MARGIN_PX = 40;
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

/** Bare floor — the page's own wrappers marked data-floor, or nothing at all — not anything standing on it. */
function onFloor(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.hasAttribute("data-floor") || target === document.body || target === document.documentElement || target.tagName === "MAIN";
}

/**
 * The home page's floor, moved around and zoomed: dragged (a finger, or the mouse) and pinched (two fingers, or a
 * trackpad) wherever it's bare below the horizon, a trackpad's two-finger scroll sliding it — a pinch zooming just
 * it, never the page, and leaving it where it's put. At home it follows the
 * starters list (`list`): scrolled down it, it glides to the map's game at the list's top, zoomed in a little — and
 * back to the whole map scrolled back to the top. Moved by you, it stays where you put it, the list scrolling on its
 * own, until its home button takes it back. Its Red Zone button slides the floor toward you, whole squares at a time,
 * till the map's gone off the screen's bottom — and the Red Zone comes up out of it (see page); again, it sinks
 * back, and the floor slides back home. The floor holds still while it's up.
 */
export function FloorCameraControls({
  store,
  fit,
  games,
  list,
  desktop,
  redZone,
}: {
  store: FloorCameraStore;
  /** The map as it lies on the floor. */
  fit: FloorMapFit;
  games: MappedGame[];
  list: HTMLElement | null;
  desktop: boolean;
  /** Whether the Red Zone's up out of the floor, and its switch. */
  redZone?: { on: boolean; onChange: (on: boolean) => void };
}) {
  const redZoneUp = redZone?.on ?? false;
  const { following } = useFloorCamera(store);
  // Where the map's middle lies on the floor: where a game it glides to is put, and what the buttons zoom about.
  const middle = useMemo<FloorPt>(
    () => floorMapFloor(fit, (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2, (MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2),
    [fit]
  );
  const sites = useMemo(() => new Map(mapSites(games).map((s) => [s.id, floorMapFloor(fit, s.pos[0], s.pos[1])])), [games, fit]);
  // Wherever it's moved, the map's never lost: at its own size never taken off the back of the room — past the horizon —
  // and off the screen's sides or bottom only so far as a little of it still shows, so anywhere on it can be zoomed in
  // on (see keepOnFloor).
  const keep = useMemo(() => {
    const [minX, minD] = floorMapFloor(fit, MAP_BOUNDS.minX, MAP_BOUNDS.minY);
    const [maxX, maxD] = floorMapFloor(fit, MAP_BOUNDS.maxX, MAP_BOUNDS.maxY);
    // The floor shown: back to the horizon, forward to a margin up from the screen's bottom (a phone's tab bar).
    const edge = floorDepth(floorY(fit.nearDepth, fit.height, fit.share) - MAP_MARGIN_PX, fit.height, fit.share);
    const view = { far: 0, edge, halfWidthAt: (d: number) => fit.width / 2 / floorScale(d), perPx: (d: number) => 1 / floorScale(d) };
    return (camera: FloorCamera) => keepOnFloor(camera, { minX, maxX, minD, maxD }, view, MAP_MARGIN_PX);
  }, [fit]);

  // Dragged and pinched — not while the Red Zone's up.
  useEffect(() => {
    if (redZoneUp) return;
    const { width, height, share } = fit;
    const horizon = height * share;
    const toFloor = (x: number, y: number) => floorAt(x, Math.max(y, horizon + 2), width, height, share);
    const pointers = new Map<number, { at: [number, number]; grab: FloorPt }>();
    let start: [number, number] | null = null;
    let moving = false;
    // Once two fingers have pinched, the floor stays put until they're all off it: a finger left down doesn't drag it.
    let pinched = false;
    // A zoom's own scrolls, and a moment after, aren't taken for a slide.
    let zoomedAt = 0;
    // A pinch on a Safari trackpad: the camera it started from, and the floor point under it.
    let gesture: { camera: FloorCamera; at: FloorPt } | null = null;
    // Each finger holding the floor's point under it now.
    const regrab = () => {
      const { camera } = store.get();
      for (const p of pointers.values()) p.grab = cameraUnder(camera, toFloor(...p.at));
      const first = pointers.values().next().value;
      start = first ? first.at : null;
    };
    const down = (e: PointerEvent) => {
      if (!onFloor(e.target) || e.clientY <= horizon + 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (e.pointerType === "mouse") e.preventDefault();
      pointers.set(e.pointerId, { at: [e.clientX, e.clientY], grab: [0, 0] });
      moving = pointers.size > 1 && moving;
      regrab();
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.at = [e.clientX, e.clientY];
      const [a, b] = [...pointers.values()];
      if (b) {
        pinched = true;
        moving = true;
        zoomedAt = performance.now();
        store.move(keep(pinchCamera([a.grab, b.grab], [toFloor(...a.at), toFloor(...b.at)])));
        return;
      }
      if (pinched) return;
      if (!moving && start && Math.hypot(p.at[0] - start[0], p.at[1] - start[1]) < SLOP) return;
      moving = true;
      store.move(keep(cameraPutting(a.grab, toFloor(...a.at), store.get().camera.zoom)));
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) moving = pinched = false;
      regrab();
    };
    // A pinch on a trackpad (or Ctrl/⌘ + scroll) anywhere over the floor zooms it, about the pointer, and never the
    // page; a two-finger scroll on the bare floor slides it.
    const wheel = (e: WheelEvent) => {
      if (e.clientY <= horizon + 2) return;
      const zoom = e.ctrlKey || e.metaKey;
      if (!zoom && !onFloor(e.target)) return;
      e.preventDefault();
      if (gesture) return;
      const { camera } = store.get();
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
      const at = toFloor(e.clientX, e.clientY);
      if (zoom) {
        zoomedAt = performance.now();
        store.move(keep(zoomCameraAt(camera, Math.exp(-e.deltaY * px * 0.01), at)));
      } else if (performance.now() - zoomedAt > 300) {
        store.move(keep(cameraPutting(cameraUnder(camera, at), toFloor(e.clientX - e.deltaX * px, e.clientY - e.deltaY * px), camera.zoom)));
      }
    };
    // Safari's own pinch (a Mac's trackpad, or two fingers on an iPhone): never the page's zoom while it's on the
    // floor. Fingers on the floor already pinch it (above); a trackpad's pinch zooms it here.
    type Gesture = UIEvent & { scale: number; clientX: number; clientY: number };
    const gestureStart = (e: Event) => {
      const g = e as Gesture;
      if (pointers.size === 0 && (!onFloor(g.target) || g.clientY <= horizon + 2)) return;
      g.preventDefault();
      gesture = pointers.size === 0 ? { camera: store.get().camera, at: toFloor(g.clientX, g.clientY) } : null;
    };
    const gestureChange = (e: Event) => {
      const g = e as Gesture;
      if (!gesture && pointers.size === 0) return;
      g.preventDefault();
      if (gesture) {
        zoomedAt = performance.now();
        store.move(keep(zoomCameraAt(gesture.camera, g.scale, gesture.at)));
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
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.removeEventListener("wheel", wheel);
      document.removeEventListener("gesturestart", gestureStart);
      document.removeEventListener("gesturechange", gestureChange);
      document.removeEventListener("gestureend", gestureEnd);
    };
  }, [store, fit, redZoneUp, keep]);

  // At home, following the starters list: the game at its top (the first on the map from there down), or, at the
  // list's top, the whole map.
  const followed = useRef<string | null>(null);
  const follow = useCallback(
    (force = false) => {
      if (!store.get().following) return;
      let target: string | null = null;
      if (list && list.scrollTop > 4) {
        // The top of what's seen of it: under its padding (on a phone, under the ticker).
        const top = list.getBoundingClientRect().top + (parseFloat(getComputedStyle(list).paddingTop) || 0) + 12;
        for (const box of list.querySelectorAll<HTMLElement>("[data-game]")) {
          const id = box.dataset.game!;
          if (box.getBoundingClientRect().bottom > top && sites.has(id)) {
            target = id;
            break;
          }
        }
      }
      if (!force && target === followed.current) return;
      followed.current = target;
      const site = target ? sites.get(target) : undefined;
      store.glide(site ? cameraPutting(site, middle, FOCUS_ZOOM) : HOME_CAMERA, true);
    },
    [store, list, sites, middle]
  );
  useEffect(() => {
    if (!list) return;
    const onScroll = () => follow();
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => list.removeEventListener("scroll", onScroll);
  }, [list, follow]);
  // Its games or the screen changed: where it's following, again.
  useEffect(() => {
    if (store.get().following) follow(true);
  }, [follow, store]);

  const goHome = () => {
    if (redZoneUp) return toggleRedZone();
    followed.current = null;
    store.glide(HOME_CAMERA, true);
    follow(true);
  };
  const toggleRedZone = () => redZone?.onChange(!redZoneUp);
  // The Red Zone coming up (switched on here, or on its own as the week's first game kicks off): the floor slid toward
  // you a whole number of squares (so its lines end up where they were), the map's far edge past the screen's bottom.
  // Going back down: once it's sunk, the floor back home. (Up already when these first show: slid all the same.)
  const wasUp = useRef(false);
  useEffect(() => {
    if (wasUp.current === redZoneUp) return;
    wasUp.current = redZoneUp;
    if (redZoneUp) {
      const far = fit.nearDepth - (MAP_BOUNDS.maxY - MAP_BOUNDS.minY) * fit.k;
      const bottom = floorDepth(fit.height, fit.height, fit.share);
      store.glide({ zoom: 1, x: 0, d: Math.ceil((bottom - far + 8) / GRID_PX) * GRID_PX }, false);
      return;
    }
    window.setTimeout(() => {
      followed.current = null;
      store.glide(HOME_CAMERA, true);
      follow(true);
    }, RED_ZONE_SINK_MS);
  }, [redZoneUp, fit, store, follow]);
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
  const zoomBy = (factor: number) => store.glide(keep(zoomCameraAt(store.get().camera, factor, middle)), false);

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
        {desktop && !redZoneUp ? (
          <>
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} className={plate}>
              −
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} className={plate}>
              +
            </button>
          </>
        ) : null}
        {following || redZoneUp ? null : home}
      </div>
    </>
  );
}
