"use client";

import { useEffect, useRef, useState } from "react";
import type { FloorMapFit } from "@/lib/floor-map";
import type { FloorCameraStore } from "@/lib/floor-camera";
import type { FloorCamera } from "@/lib/grid-room";
import { STADIUM_MODELS } from "@/lib/stadium-models";
import { paintStadium, placeStadium } from "@/lib/stadium-clay";
import { useFloorCamera } from "./FloorGrid";

/** How long a stadium takes to come up out of the floor (ms). */
const RISE_MS = 520;

/** A stadium being looked at: whose, where it stands (map units), and the floor's camera on it. */
export interface StadiumFocus {
  team: string;
  at: [number, number];
  camera: FloorCamera;
}

/** Whether the floor's at the close look at a stadium (`b`). */
export const atFocus = (a: FloorCamera, b: FloorCamera) => Math.abs(a.zoom - b.zoom) < 1e-6 * b.zoom && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.d - b.d) < 0.5;

/**
 * The stadium a game's tag was tapped for (`focus`), a clay model (see stadium-clay.ts) shown only in the close look
 * at it the floor glided to: once it's there, it pops up out of the floor; the floor moved, it's gone. Painted on a
 * canvas only as big as it is on the screen.
 */
export function FloorStadiums({ fit: lying, camera: store, focus }: { fit: FloorMapFit; camera?: FloorCameraStore; focus: StadiumFocus | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { camera } = useFloorCamera(store);
  const parts = focus ? STADIUM_MODELS[focus.team] : undefined;
  const there = !!focus && !!parts && atFocus(camera, focus.camera);
  // How far up out of the floor it's come: from nothing, each time the floor gets there, a little past, and settling.
  const [rise, setRise] = useState(0);
  useEffect(() => {
    if (!there) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / RISE_MS);
      // Ease out, with a little overshoot.
      const c = 1.4;
      setRise(1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      setRise(0);
    };
  }, [there]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!there || !focus || !parts || rise <= 0) {
      canvas.style.display = "none";
      return;
    }
    const fit = { ...lying, camera };
    const horizon = fit.height * fit.share;
    const placed = placeStadium(fit, focus.at, parts, rise);
    // Only as big as it is on the screen (with room for its shadow): a big canvas costs every frame it's redrawn.
    const pad = 24;
    const left = Math.max(0, Math.floor(placed.box[0] - pad));
    const top = Math.max(horizon, Math.floor(placed.box[1] - pad));
    const right = Math.min(fit.width, Math.ceil(placed.box[2] + pad));
    const bottom = Math.min(fit.height, Math.ceil(placed.box[3] + pad));
    if (right <= left || bottom <= top) {
      canvas.style.display = "none";
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const [w, h] = [Math.round((right - left) * dpr), Math.round((bottom - top) * dpr)];
    if (canvas.width !== w || canvas.height !== h) [canvas.width, canvas.height] = [w, h];
    Object.assign(canvas.style, { display: "", left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    ctx.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
    ctx.clearRect(left, top, right - left, bottom - top);
    paintStadium(ctx, placed, fit.width, horizon, 1 / dpr);
  }, [lying, camera, there, focus, parts, rise]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute" style={{ display: "none" }} />;
}
