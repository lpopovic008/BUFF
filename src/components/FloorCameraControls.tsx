"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { floorAt, HOME_CAMERA } from "@/lib/grid-room";
import { FloorMapFit, floorMapFloor, MAP_BOUNDS } from "@/lib/floor-map";
import { cameraPutting, cameraUnder, FloorCameraStore, FloorPt, pinchCamera, zoomCameraAt } from "@/lib/floor-camera";
import { mapSites } from "./FloorMap";
import { useFloorCamera } from "./FloorGrid";
import type { MappedGame } from "./GameMap";

/** How far in the floor zooms on the game it glides to, and how much a button zooms it by. */
const FOCUS_ZOOM = 1.6;
const ZOOM_STEP = 1.25;
/** How far a finger or the mouse goes before it's moving the floor, not tapping it (px). */
const SLOP = 4;

/** Bare floor — the page's own wrappers marked data-floor, or nothing at all — not anything standing on it. */
function onFloor(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.hasAttribute("data-floor") || target === document.body || target === document.documentElement || target.tagName === "MAIN";
}

/**
 * The home page's floor, moved around and zoomed: dragged (a finger, or the mouse) and pinched (two fingers, or a
 * trackpad) wherever it's bare below the horizon, a trackpad's two-finger scroll sliding it. At home it follows the
 * starters list (`list`): scrolled down it, it glides to the map's game at the list's top, zoomed in a little — and
 * back to the whole map scrolled back to the top. Moved by you, it stays where you put it, the list scrolling on its
 * own, until its home button takes it back.
 */
export function FloorCameraControls({
  store,
  fit,
  games,
  list,
  desktop,
}: {
  store: FloorCameraStore;
  /** The map as it lies on the floor. */
  fit: FloorMapFit;
  games: MappedGame[];
  list: HTMLElement | null;
  desktop: boolean;
}) {
  const { following } = useFloorCamera(store);
  // Where the map's middle lies on the floor: where a game it glides to is put, and what the buttons zoom about.
  const middle = useMemo<FloorPt>(
    () => floorMapFloor(fit, (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2, (MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2),
    [fit]
  );
  const sites = useMemo(() => new Map(mapSites(games).map((s) => [s.id, floorMapFloor(fit, s.pos[0], s.pos[1])])), [games, fit]);

  // Dragged and pinched.
  useEffect(() => {
    const { width, height, share } = fit;
    const horizon = height * share;
    const toFloor = (x: number, y: number) => floorAt(x, Math.max(y, horizon + 2), width, height, share);
    const pointers = new Map<number, { at: [number, number]; grab: FloorPt }>();
    let start: [number, number] | null = null;
    let moving = false;
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
      if (!moving && start && Math.hypot(p.at[0] - start[0], p.at[1] - start[1]) < SLOP && pointers.size === 1) return;
      moving = true;
      const [a, b] = [...pointers.values()];
      store.move(
        b ? pinchCamera([a.grab, b.grab], [toFloor(...a.at), toFloor(...b.at)]) : cameraPutting(a.grab, toFloor(...a.at), store.get().camera.zoom)
      );
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) moving = false;
      regrab();
    };
    // A pinch on a trackpad (or Ctrl/⌘ + scroll) zooms about the pointer; a two-finger scroll slides the floor.
    const wheel = (e: WheelEvent) => {
      if (!onFloor(e.target) || e.clientY <= horizon + 2) return;
      e.preventDefault();
      const { camera } = store.get();
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
      const at = toFloor(e.clientX, e.clientY);
      store.move(
        e.ctrlKey || e.metaKey
          ? zoomCameraAt(camera, Math.exp(-e.deltaY * px * 0.01), at)
          : cameraPutting(cameraUnder(camera, at), toFloor(e.clientX - e.deltaX * px, e.clientY - e.deltaY * px), camera.zoom)
      );
    };
    document.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.addEventListener("wheel", wheel, { passive: false });
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.removeEventListener("wheel", wheel);
    };
  }, [store, fit]);

  // At home, following the starters list: the game at its top (the first on the map from there down), or, at the
  // list's top, the whole map.
  const followed = useRef<string | null>(null);
  const follow = useCallback(
    (force = false) => {
      if (!store.get().following) return;
      let target: string | null = null;
      if (list && list.scrollTop > 4) {
        const top = list.getBoundingClientRect().top + 12;
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
    followed.current = null;
    store.glide(HOME_CAMERA, true);
    follow(true);
  };
  const zoomBy = (factor: number) => store.glide(zoomCameraAt(store.get().camera, factor, middle), false);

  const plate =
    "pointer-events-auto flex h-7 min-w-7 cursor-pointer items-center justify-center bg-[var(--map-tag)] px-1.5 text-xs font-bold leading-none text-[var(--map-tag-ink)] transition-opacity hover:opacity-90";
  const home = (
    <button type="button" aria-label="Back home" title="Back home" onClick={goHome} className={plate}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
        <path d="M2 7.5 8 2l6 5.5M3.5 6.5V14h3.5v-4h2v4h3.5V6.5" />
      </svg>
    </button>
  );
  // From tablet width up, zoom buttons too (for a mouse with no pinch), in the screen's bottom-left corner; on a phone,
  // just the way home, over the map's right end.
  return desktop ? (
    <div className="pointer-events-none fixed bottom-3 left-4 z-20 flex gap-1">
      <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} className={plate}>
        −
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} className={plate}>
        +
      </button>
      {following ? null : home}
    </div>
  ) : following ? null : (
    <div className="pointer-events-none fixed bottom-[calc(var(--tabbar-h,0px)+0.75rem)] right-4 z-20">{home}</div>
  );
}
