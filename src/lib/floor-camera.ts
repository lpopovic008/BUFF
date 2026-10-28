// Moving the home page's floor (see grid-room.ts) — its grid and the map lying on it — around under you, and
// zooming in on it: where it's been moved to is a FloorCamera, the floor's own points ("world") showing at
// `point * zoom + (x, d)` on it. Points here are [across, back] in floor px.

import { FloorCamera, HOME_CAMERA } from "./grid-room";

export type FloorPt = readonly [number, number];

/** As far out, and in, as the floor zooms. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 6;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Where the floor's own point `p` shows, the floor moved by `camera`. */
export function cameraShows(camera: FloorCamera, p: FloorPt): [number, number] {
  return [p[0] * camera.zoom + camera.x, p[1] * camera.zoom + camera.d];
}

/** The floor's own point showing at `at`, the floor moved by `camera`. */
export function cameraUnder(camera: FloorCamera, at: FloorPt): [number, number] {
  return [(at[0] - camera.x) / camera.zoom, (at[1] - camera.d) / camera.zoom];
}

/** The floor moved so its own point `grab` shows at `at`, as zoomed as `zoom`. */
export function cameraPutting(grab: FloorPt, at: FloorPt, zoom: number): FloorCamera {
  const z = clampZoom(zoom);
  return { zoom: z, x: at[0] - grab[0] * z, d: at[1] - grab[1] * z };
}

/** The floor zoomed by `factor` about where it shows at `at`. */
export function zoomCameraAt(camera: FloorCamera, factor: number, at: FloorPt): FloorCamera {
  return cameraPutting(cameraUnder(camera, at), at, camera.zoom * factor);
}

/** Two of the floor's own points held under two fingers, now at `ats`: the floor zoomed and moved to keep them there. */
export function pinchCamera(grabs: readonly [FloorPt, FloorPt], ats: readonly [FloorPt, FloorPt]): FloorCamera {
  const apart = (p: FloorPt, q: FloorPt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const mid = (p: FloorPt, q: FloorPt): FloorPt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const held = apart(grabs[0], grabs[1]);
  const zoom = held > 0 ? apart(ats[0], ats[1]) / held : 1;
  return cameraPutting(mid(grabs[0], grabs[1]), mid(ats[0], ats[1]), zoom);
}

/** Part way, `t` (0 to 1), from one camera to another — zooming evenly, and moving along with it. */
export function cameraBetween(from: FloorCamera, to: FloorCamera, t: number): FloorCamera {
  const zoom = from.zoom * Math.pow(to.zoom / from.zoom, t);
  // The offset moving in step with the zoom, so the point the two leave in place stays put along the way.
  const s = from.zoom === to.zoom ? t : (zoom - from.zoom) / (to.zoom - from.zoom);
  return { zoom, x: from.x + (to.x - from.x) * s, d: from.d + (to.d - from.d) * s };
}

export function isHome(camera: FloorCamera): boolean {
  return camera.zoom === HOME_CAMERA.zoom && camera.x === HOME_CAMERA.x && camera.d === HOME_CAMERA.d;
}

/**
 * The floor's camera, shared by what's drawn on the floor without the page re-rendering as it moves: where it is, and
 * whether it's "home" — following the starters list (see FloorCameraControls) — or wherever you've moved it.
 */
export interface FloorCameraStore {
  get: () => { camera: FloorCamera; following: boolean };
  subscribe: (listener: () => void) => () => void;
  /** Moved by you: no longer following. */
  move: (camera: FloorCamera) => void;
  /** Glides to `camera`, following again if `follow`. */
  glide: (camera: FloorCamera, follow?: boolean) => void;
}

const GLIDE_MS = 650;

export function createFloorCameraStore(): FloorCameraStore {
  let state = { camera: HOME_CAMERA, following: true };
  let frame = 0;
  const listeners = new Set<() => void>();
  const set = (next: typeof state) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    move: (camera) => {
      stop();
      set({ camera, following: false });
    },
    glide: (camera, follow = state.following) => {
      stop();
      const from = state.camera;
      const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return set({ camera, following: follow });
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / GLIDE_MS);
        // Ease in and out.
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        set({ camera: t === 1 ? camera : cameraBetween(from, camera, e), following: follow });
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    },
  };
}
