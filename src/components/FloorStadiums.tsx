"use client";

import { useEffect, useRef } from "react";
import type { FloorMapFit } from "@/lib/floor-map";
import type { FloorCameraStore } from "@/lib/floor-camera";
import { STADIUM_MODELS } from "@/lib/stadium-models";
import { paintStadium, placeStadium } from "@/lib/stadium-clay";
import { TEAM_CITIES } from "@/lib/team-cities";
import { useFloorCamera } from "./FloorGrid";

/**
 * The stadiums made so far, clay models standing at their teams' homes on the floor map (see stadium-clay.ts) —
 * painted onto one canvas over the map, repainted as the floor moves (a first try: Soldier Field, whatever the week's
 * games).
 */
export function FloorStadiums({ fit: lying, camera: store }: { fit: FloorMapFit; camera?: FloorCameraStore }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { camera } = useFloorCamera(store);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const fit = { ...lying, camera };
    const horizon = fit.height * fit.share;
    const placed = Object.entries(STADIUM_MODELS).flatMap(([team, parts]) => (TEAM_CITIES[team] ? [placeStadium(fit, TEAM_CITIES[team].pos, parts)] : []));
    // Only as big as they are on the screen (with room for their shadows), not the whole screen: a big canvas costs
    // every frame it's redrawn.
    const pad = 24;
    const left = Math.max(0, Math.floor(Math.min(...placed.map((p) => p.box[0])) - pad));
    const top = Math.max(horizon, Math.floor(Math.min(...placed.map((p) => p.box[1])) - pad));
    const right = Math.min(fit.width, Math.ceil(Math.max(...placed.map((p) => p.box[2])) + pad));
    const bottom = Math.min(fit.height, Math.ceil(Math.max(...placed.map((p) => p.box[3])) + pad));
    if (!placed.length || right <= left || bottom <= top) {
      canvas.style.display = "none";
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const [w, h] = [Math.round((right - left) * dpr), Math.round((bottom - top) * dpr)];
    if (canvas.width !== w || canvas.height !== h) [canvas.width, canvas.height] = [w, h];
    Object.assign(canvas.style, { display: "", left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    ctx.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
    ctx.clearRect(left, top, right - left, bottom - top);
    for (const p of placed) paintStadium(ctx, p, fit.width, horizon, 1 / dpr);
  }, [lying, camera]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute" />;
}
