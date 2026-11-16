"use client";

import { useEffect, useMemo, useState } from "react";
import { isOutsideUS } from "@/lib/nfl-schedule";
import { gameLonLat, gameState, internationalSlotLonLat } from "@/lib/game-map";
import type { FloorCameraStore } from "@/lib/floor-camera";
import { GlobePlace, GlobeView, globeLine, globePoint, globeRing, globeStemTip, globeView, readRing } from "@/lib/globe";
import { LINE_OPACITY, useFloorCamera } from "./FloorGrid";
import type { MappedGame } from "./GameMap";

// A game's ring on the globe, wider the more players it counts (degrees), and its stem standing straight out of the
// globe from it, longer the more it counts (rem) — each player a good deal longer, so counts tell apart at a glance.
function ringDegrees(count: number): number {
  return count === 0 ? 0.55 : Math.min(0.7 + count * 0.18, 3.2);
}
function stemRem(count: number): number {
  return Math.min(0.4 + count * 0.6, 6);
}
// The states on Mountain and Pacific time: their games' tags hang off the right of the stem, the rest off the left.
const WEST_STATES = new Set(["AZ", "CO", "NM", "UT", "WY", "MT", "ID", "NV", "CA", "OR", "WA"]);
const TAG_REM = 0.625;
/** How faint the farthest of the games' tags is (the nearest, whole). */
const FARTHEST_TAG = 0.4;
/** How far round toward its edge a game can be and still have its stem and tag (how much it faces you, 0 to 1). */
const SHOWN_FROM = 0.08;
/** How flat its shadow on the floor is, seen as the floor is (its depth to its width). */
const SHADOW_FLAT = 0.22;

export interface GlobeSite {
  id: string;
  /** Where on the globe: longitude and latitude. */
  at: [number, number];
  label: string;
  count: number;
  /** Played on Mountain or Pacific time: its tag on the stem's right. */
  west: boolean;
}

/** Where each game is on the globe — those played abroad in slots off the coast. */
export function globeSites(games: MappedGame[]): GlobeSite[] {
  let abroad = 0;
  return games.flatMap((entry) => {
    const at = isOutsideUS(entry.game) ? internationalSlotLonLat(abroad++) : gameLonLat(entry.game);
    if (!at) return [];
    const count = entry.count ?? entry.starters.length + entry.opponentStarters.length;
    const west = WEST_STATES.has(gameState(entry.game) ?? "");
    return [{ id: entry.game.id, at, label: `${entry.game.awayTeam} @ ${entry.game.homeTeam}`, count, west }];
  });
}

/** The globe as it shows now: turned and zoomed (`globe`), over the floor where it's been moved (`floor`). */
function useGlobeView(place: GlobePlace, globe?: FloorCameraStore, floor?: FloorCameraStore): GlobeView {
  const turned = useFloorCamera(globe).camera;
  const moved = useFloorCamera(floor).camera;
  return useMemo(() => globeView(place, turned, moved), [place, turned, moved]);
}

/** One device pixel, in CSS px — a wire, whatever the browser's zoom. */
function useWire(): number {
  const [wire, setWire] = useState(1);
  useEffect(() => {
    const update = () => setWire(1 / (window.devicePixelRatio || 1));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return wire;
}

// The land and the US, read once (a sizable download, loaded the first time the globe's drawn).
let rings: { land: Float64Array[]; us: Float64Array[] } | null = null;
let loading: Promise<void> | null = null;
function loadRings(): Promise<void> {
  loading ??= import("@/lib/globe-land").then(({ GLOBE_LAND, GLOBE_US }) => {
    rings = { land: GLOBE_LAND.map(readRing), us: GLOBE_US.map(readRing) };
  });
  return loading;
}
function useRings() {
  const [loaded, setLoaded] = useState(rings);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    void loadRings().then(() => live && setLoaded(rings));
    return () => {
      live = false;
    };
  }, [loaded]);
  return loaded;
}

/**
 * The week's globe, in the middle of the room's floor, floating a little over it, its shadow on the floor under it
 * (see globe.ts): the land outlined in wires like the grid's, the US outlined solid in ink (white, or black in light
 * mode), and each game's ring on it. Drawn in the room, behind everything; the games' stems and tags stand out in front
 * (see FloorGlobeTags). Turned and zoomed (`globe`), and slid with the floor under it (`floor`).
 */
export function FloorGlobe({ place, games, globe, floor }: { place: GlobePlace; games: MappedGame[]; globe?: FloorCameraStore; floor?: FloorCameraStore }) {
  const view = useGlobeView(place, globe, floor);
  const sites = useMemo(() => globeSites(games), [games]);
  const wire = useWire();
  const loaded = useRings();
  const paths = useMemo(() => {
    if (!loaded) return null;
    return {
      land: loaded.land.map((r) => globeLine(view, r, true)).join(""),
      us: loaded.us.map((r) => globeLine(view, r, true)).join(""),
    };
  }, [loaded, view]);
  // Its shadow: a circle on the floor under it, a little smaller than it — an ellipse, flattened as the floor's seen.
  const shadow = useMemo(() => {
    let d = "";
    const rx = view.R * 0.85;
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      d += `${i ? "L" : "M"}${(view.spot[0] + Math.cos(a) * rx).toFixed(1)},${(view.spot[1] + Math.sin(a) * rx * SHADOW_FLAT).toFixed(1)}`;
    }
    return d + "Z";
  }, [view]);
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="floor-globe-shadow">
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity={0.16} />
          <stop offset="100%" stopColor="var(--ink-primary)" stopOpacity={0} />
        </radialGradient>
        {/* Lit from up front on the left, as the room is. */}
        <radialGradient id="floor-globe-sheen" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity={0.09} />
          <stop offset="100%" stopColor="var(--ink-primary)" stopOpacity={0} />
        </radialGradient>
      </defs>
      <path d={shadow} fill="url(#floor-globe-shadow)" />
      {/* Solid, so the floor's grid doesn't show through it. */}
      <circle cx={view.cx} cy={view.cy} r={view.R} fill="var(--page)" />
      <circle cx={view.cx} cy={view.cy} r={view.R} fill="url(#floor-globe-sheen)" />
      {paths ? (
        <>
          <path d={paths.land} fill="none" stroke="var(--ink-primary)" strokeOpacity={LINE_OPACITY * 1.6} strokeWidth={wire} strokeLinejoin="round" />
          <path d={paths.us} fill="none" stroke="var(--ink-primary)" strokeWidth={wire * 1.5} strokeLinejoin="round" />
        </>
      ) : null}
      {sites.map((s) => (
        <path key={s.id} d={globeRing(view, s.at[0], s.at[1], ringDegrees(s.count))} fill="none" stroke="var(--ink-primary)" strokeWidth={wire * 1.5} />
      ))}
      <circle cx={view.cx} cy={view.cy} r={view.R} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.55} strokeWidth={wire} />
    </svg>
  );
}

/**
 * The week's games standing straight out of the globe, in front of everything (the starters list sinks into the
 * floor behind them): each game's stem from its ring, longer the more players it counts, with the matchup's tag
 * hung off its end on the left (on Mountain or Pacific time, the right) — and, set over them, `overhead` (the kickoff
 * countdown), in the middle of the screen across at screen y `top`. Those round toward the globe's edge fade, and
 * those round the back aren't there.
 */
export function FloorGlobeTags({
  place,
  games,
  overhead,
  top,
  globe,
  floor,
}: {
  place: GlobePlace;
  games: MappedGame[];
  overhead?: React.ReactNode;
  top: number;
  globe?: FloorCameraStore;
  floor?: FloorCameraStore;
}) {
  const view = useGlobeView(place, globe, floor);
  const sites = useMemo(() => globeSites(games), [games]);
  // (Drawn only once the room's measured, in the browser.)
  const [rootPx] = useState(() => (typeof document === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
  // Nearer the middle of the globe's face on top of those round toward its edge.
  const shown = sites
    .map((s) => {
      const [x, y, facing] = globePoint(view, s.at[0], s.at[1]);
      const tip = globeStemTip(view, s.at[0], s.at[1], stemRem(s.count) * rootPx);
      return { ...s, x, y, facing, tip };
    })
    .filter((s) => s.facing > SHOWN_FROM)
    .sort((a, b) => a.facing - b.facing);
  // Graded from the nearest of them (whole) back to the farthest (faintest), however near or far they all are — and
  // fading out as they go round its edge.
  const [farthest, nearest] = [shown[0]?.facing ?? 0, shown.at(-1)?.facing ?? 0];
  const placed = shown.map((s) => ({
    ...s,
    fade:
      (nearest > farthest ? FARTHEST_TAG + (1 - FARTHEST_TAG) * ((s.facing - farthest) / (nearest - farthest)) : 1) *
      Math.min(1, (s.facing - SHOWN_FROM) / 0.15),
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-10" aria-hidden>
      {/* In the middle of the screen, across — over the globe's top, however high it's zoomed. */}
      {overhead ? (
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-full" style={{ top: Math.min(top, view.cy - view.R - 0.5 * rootPx) }}>
          {overhead}
        </div>
      ) : null}
      <svg className="absolute inset-0 h-full w-full">
        {placed.map((s) => (
          <line key={s.id} x1={s.x} y1={s.y} x2={s.tip[0]} y2={s.tip[1]} stroke="var(--map-edge)" strokeWidth={1} opacity={s.fade} />
        ))}
      </svg>
      {placed.map((s) => (
        <div key={s.id} className="absolute left-0 top-0" style={{ transform: `translate(${s.tip[0]}px, ${s.tip[1]}px)`, opacity: s.fade }}>
          <span
            className={`absolute top-0 whitespace-nowrap bg-[var(--map-tag)] px-[0.35em] py-[0.12em] font-bold leading-[1.3] text-[var(--map-tag-ink)] ${s.west ? "left-0" : "right-0"}`}
            style={{ [s.west ? "marginLeft" : "marginRight"]: "0.35em", fontSize: `${TAG_REM}rem` }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
