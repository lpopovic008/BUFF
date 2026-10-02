"use client";

import { KeyboardEvent, MouseEvent, PointerEvent, RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CAMERA,
  MapCamera,
  buildMapScene,
  clampTarget,
  clampTilt,
  clampZoom,
  isDefaultCamera,
  normalizeYaw,
  unproject,
} from "@/lib/map-perspective";

// Degrees per pixel dragged, relative to the map's width: a full-width swipe
// turns the map a bit over half way round.
const YAW_PER_WIDTH = 200;
const TILT_PER_WIDTH = 110;
const RESET_MS = 450;
// A pointer that moves less than this between down and up was a tap, not a drag.
const DRAG_SLOP = 6;
// Degrees per millisecond a released flick may keep spinning at.
const MAX_COAST_SPEED = 0.3;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Where a client (page) point falls in the camera's projected space, given the map box it's drawn in. */
function toProjected(camera: MapCamera, box: DOMRect, clientX: number, clientY: number): [number, number] {
  const { view } = buildMapScene(camera);
  const k = box.width / view.width;
  return [view.x + (clientX - box.left) / k, view.y + (clientY - box.top) / k];
}

/** The camera moved so the map follows a drag of (dx, dy) px. */
function panned(camera: MapCamera, box: DOMRect, dx: number, dy: number): MapCamera {
  const { view, project } = buildMapScene(camera);
  const k = box.width / view.width;
  const [cx, cy] = project(camera.tx, camera.ty);
  const [tx, ty] = clampTarget(...unproject(camera, cx - dx / k, cy - dy / k));
  return { ...camera, tx, ty };
}

/** The camera zoomed by `factor`, keeping whatever's under the client point (x, y) in place. */
function zoomedAt(camera: MapCamera, box: DOMRect, factor: number, x: number, y: number): MapCamera {
  const zoom = clampZoom(camera.zoom * factor);
  const [ax, ay] = toProjected(camera, box, x, y);
  const { project } = buildMapScene(camera);
  const [cx, cy] = project(camera.tx, camera.ty);
  // The anchor keeps its screen offset from the center, shrunk by the zoom change.
  const ratio = camera.zoom / zoom;
  const [tx, ty] = clampTarget(...unproject(camera, ax - (ax - cx) * ratio, ay - (ay - cy) * ratio));
  return { ...camera, zoom, tx, ty };
}

/**
 * The dashboard map's orbit camera. Drag (or one-finger swipe) sideways to
 * spin it, up/down to tilt it. Pan by dragging with two fingers, with Shift
 * held, or with the right mouse button. Zoom toward any part of the country
 * with a pinch, Ctrl/⌘ + scroll (or a trackpad pinch) — whatever's under the
 * fingers or cursor stays put — or with the +/- keys and zoomBy for
 * on-screen buttons, which zoom about the middle of the view. Touches on the
 * map belong to it alone — the page never scrolls or zooms under them (the
 * map element sets touch-action: none). A flick keeps spinning and eases to
 * a stop. Double-click (or the reset button) eases back to the default view,
 * which is also where every page load starts — the camera is deliberately
 * never persisted.
 *
 * `boxRef` is the map box the scene's view is drawn into — needed to turn
 * pointer positions into points on the map.
 */
export function useMapCamera(boxRef: RefObject<HTMLElement | null>) {
  const [camera, setCamera] = useState<MapCamera>(DEFAULT_CAMERA);
  // The latest camera, ahead of React: pointer moves update this and commit
  // at most once per frame.
  const live = useRef<MapCamera>(DEFAULT_CAMERA);
  const frame = useRef<number | null>(null);
  const animation = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panning = useRef(false);
  const travelled = useRef(0);
  const yawVelocity = useRef(0);
  const lastMoveAt = useRef(0);

  const commit = useCallback((next: MapCamera) => {
    live.current = next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setCamera(live.current);
    });
  }, []);

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);

  useEffect(
    () => () => {
      stopAnimation();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [stopAnimation]
  );

  const reset = useCallback(() => {
    stopAnimation();
    const from = { ...live.current, yaw: normalizeYaw(live.current.yaw) };
    if (prefersReducedMotion()) {
      commit(DEFAULT_CAMERA);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / RESET_MS);
      const ease = 1 - (1 - t) ** 3;
      const lerp = (a: number, b: number) => a + (b - a) * ease;
      commit({
        tilt: lerp(from.tilt, DEFAULT_CAMERA.tilt),
        yaw: lerp(from.yaw, DEFAULT_CAMERA.yaw),
        // Zoom eases geometrically, so zooming back from 4x feels as even as from 1.5x.
        zoom: from.zoom * (DEFAULT_CAMERA.zoom / from.zoom) ** ease,
        tx: lerp(from.tx, DEFAULT_CAMERA.tx),
        ty: lerp(from.ty, DEFAULT_CAMERA.ty),
      });
      animation.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    animation.current = requestAnimationFrame(step);
  }, [commit, stopAnimation]);

  const coast = useCallback(() => {
    if (prefersReducedMotion() || Math.abs(yawVelocity.current) < 0.02) return;
    // A hard flick coasts a fraction of a turn, never spins the map round.
    yawVelocity.current = Math.max(-MAX_COAST_SPEED, Math.min(MAX_COAST_SPEED, yawVelocity.current));
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      yawVelocity.current *= 0.9 ** (dt / 16);
      commit({ ...live.current, yaw: live.current.yaw + yawVelocity.current * dt });
      animation.current = Math.abs(yawVelocity.current) > 0.005 ? requestAnimationFrame(step) : null;
    };
    animation.current = requestAnimationFrame(step);
  }, [commit]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      stopAnimation();
      if (pointers.current.size === 0) {
        travelled.current = 0;
        // Right/middle button, or Shift, drags the map around instead of turning it.
        panning.current = e.pointerType === "mouse" && (e.button !== 0 || e.shiftKey);
      }
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      yawVelocity.current = 0;
    },
    [stopAnimation]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Only capture the pointer once it's clearly a drag: capturing on
      // pointerdown would retarget a tap's click away from whatever was
      // tapped (a game tag), and the tap would never register.
      travelled.current += Math.abs(dx) + Math.abs(dy);
      if (travelled.current > DRAG_SLOP && !e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      const box = boxRef.current?.getBoundingClientRect();
      const width = box?.width || e.currentTarget.clientWidth || 1;
      const cam = live.current;
      if (pointers.current.size > 1) {
        // Two fingers: the map follows their midpoint, and the spread
        // between them zooms about it.
        if (!box) return;
        const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
        if (!other) return;
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        let next = panned(cam, box, dx / 2, dy / 2);
        if (before > 10) next = zoomedAt(next, box, after / before, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
        commit(next);
        return;
      }
      if (panning.current) {
        if (box) commit(panned(cam, box, dx, dy));
        return;
      }
      // Grab-and-turn: dragging the near edge right spins the map that way.
      const dYaw = -dx * (YAW_PER_WIDTH / width);
      const now = performance.now();
      const dt = now - lastMoveAt.current;
      lastMoveAt.current = now;
      if (dt > 0 && dt < 100) yawVelocity.current = 0.6 * yawVelocity.current + 0.4 * (dYaw / dt);
      // Dragging up pushes the map away (more tilt); down pulls it toward straight-down.
      commit({ ...cam, yaw: cam.yaw + dYaw, tilt: clampTilt(cam.tilt - dy * (TILT_PER_WIDTH / width)) });
    },
    [boxRef, commit]
  );

  const endPointer = useCallback(
    (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
      if (!pointers.current.delete(e.pointerId)) return;
      if (pointers.current.size > 0) return;
      if (!cancelled && !panning.current && performance.now() - lastMoveAt.current < 80) coast();
      else yawVelocity.current = 0;
      panning.current = false;
    },
    [coast]
  );

  const onPointerUp = useCallback((e: PointerEvent<HTMLElement>) => endPointer(e, false), [endPointer]);
  const onPointerCancel = useCallback((e: PointerEvent<HTMLElement>) => endPointer(e, true), [endPointer]);
  // The right button pans, so its menu would only get in the way.
  const onContextMenu = useCallback((e: MouseEvent<HTMLElement>) => e.preventDefault(), []);

  /** True when the pointer gesture that just ended was a drag — tap targets on the map use it to ignore the click a drag ends with. */
  const wasDrag = useCallback(() => travelled.current > DRAG_SLOP, []);

  /** Zooms in (factor > 1) or out — toward a client point when given (a cursor), else about the middle of the view. */
  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      stopAnimation();
      const box = boxRef.current?.getBoundingClientRect();
      const cam = live.current;
      commit(at && box ? zoomedAt(cam, box, factor, at.x, at.y) : { ...cam, zoom: clampZoom(cam.zoom * factor) });
    },
    [boxRef, commit, stopAnimation]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const cam = live.current;
      const nudges: Record<string, MapCamera> = {
        ArrowLeft: { ...cam, yaw: cam.yaw + 10 },
        ArrowRight: { ...cam, yaw: cam.yaw - 10 },
        ArrowUp: { ...cam, tilt: clampTilt(cam.tilt + 4) },
        ArrowDown: { ...cam, tilt: clampTilt(cam.tilt - 4) },
        "+": { ...cam, zoom: clampZoom(cam.zoom * 1.25) },
        "=": { ...cam, zoom: clampZoom(cam.zoom * 1.25) },
        "-": { ...cam, zoom: clampZoom(cam.zoom / 1.25) },
      };
      if (e.key === "Home" || e.key === "0") {
        e.preventDefault();
        reset();
      } else if (nudges[e.key]) {
        e.preventDefault();
        stopAnimation();
        commit(nudges[e.key]);
      }
    },
    [commit, reset, stopAnimation]
  );

  return {
    camera,
    isDefault: isDefaultCamera(camera),
    reset,
    zoomBy,
    wasDrag,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown, onContextMenu, onDoubleClick: reset },
  };
}
