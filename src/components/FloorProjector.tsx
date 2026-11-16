"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, gameState, internationalSlotPosition } from "@/lib/game-map";
import type { FloorCameraStore } from "@/lib/floor-camera";
import { ProjectorPlace, ProjectorView, projectorPath, projectorPoint, projectorView } from "@/lib/projector";
import { US_SIMPLE_OUTLINE_PATH } from "@/lib/team-cities";
import { useFloorCamera } from "./FloorGrid";
import type { MappedGame } from "./GameMap";

// A game's ring on the map, wider the more players it counts (in map units), and its stem standing up from it, taller
// the more it counts (in rem) — each player a good deal taller, so counts tell apart at a glance.
function ringRadius(count: number): number {
  return count === 0 ? 1.6 : Math.min(2.2 + count * 0.55, 9);
}
function stemRem(count: number): number {
  return Math.min(0.4 + count * 0.6, 6);
}
// The states on Mountain and Pacific time: their games' tags hang off the right of the stem, the rest off the left.
const WEST_STATES = new Set(["AZ", "CO", "NM", "UT", "WY", "MT", "ID", "NV", "CA", "OR", "WA"]);
const TAG_REM = 0.625;
/** How faint the lowest of the games' tags is (the highest, whole) — the farther back on the map, the fainter. */
const FARTHEST_TAG = 0.55;

export interface MapSite {
  id: string;
  /** Where on the map, in map units. */
  pos: [number, number];
  label: string;
  count: number;
  /** Played on Mountain or Pacific time: its tag on the stem's right. */
  west: boolean;
}

/** Where each game is on the map — those played abroad in slots off its coast. */
export function mapSites(games: MappedGame[]): MapSite[] {
  let abroad = 0;
  return games.flatMap((entry) => {
    const pos = isOutsideUS(entry.game) ? internationalSlotPosition(abroad++) : gameMapPosition(entry.game);
    if (!pos) return [];
    const count = entry.count ?? entry.starters.length + entry.opponentStarters.length;
    const west = WEST_STATES.has(gameState(entry.game) ?? "");
    return [{ id: entry.game.id, pos, label: `${entry.game.awayTeam} @ ${entry.game.homeTeam}`, count, west }];
  });
}

/** The projector as it shows now: its picture moved and zoomed (`map`), over the floor where it's been moved (`floor`). */
function useProjectorView(place: ProjectorPlace, map?: FloorCameraStore, floor?: FloorCameraStore): ProjectorView {
  const picture = useFloorCamera(map).camera;
  const moved = useFloorCamera(floor).camera;
  return useMemo(() => projectorView(place, picture, moved), [place, picture, moved]);
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

/**
 * The week's map, projected (see projector.ts): from a spot of light on the floor, in its middle near the front, a
 * beam fanning up to a frame floating over the floor, facing you square on — the lower 48 lit in it, their outline
 * solid in ink (white, or black in light mode), and each game's ring on it. Drawn in the room, behind everything; the
 * games' stems and tags stand up in front (see FloorProjectionTags). Its picture moved and zoomed within the frame
 * (`map`), and all of it slid with the floor under it (`floor`).
 */
export function FloorProjection({ place, games, map, floor }: { place: ProjectorPlace; games: MappedGame[]; map?: FloorCameraStore; floor?: FloorCameraStore }) {
  const view = useProjectorView(place, map, floor);
  const sites = useMemo(() => mapSites(games), [games]);
  const wire = useWire();
  const id = useId().replace(/:/g, "");
  const outline = useMemo(() => projectorPath(view, US_SIMPLE_OUTLINE_PATH), [view]);
  const { frame, source } = view;
  const [l, t, r, b] = [frame.left, frame.top, frame.left + frame.width, frame.top + frame.height];
  const [sx, sy] = source;
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        {/* The beam: brightest where it leaves the spot, fading as it spreads up to the frame. */}
        <linearGradient id={`${id}-beam`} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={sx} y2={t}>
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity={0.2} />
          <stop offset="100%" stopColor="var(--ink-primary)" stopOpacity={0.03} />
        </linearGradient>
        <radialGradient id={`${id}-spot`}>
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity={0.5} />
          <stop offset="100%" stopColor="var(--ink-primary)" stopOpacity={0} />
        </radialGradient>
        {/* The frame lit: brighter toward its middle, as a projector's picture is. */}
        <radialGradient id={`${id}-screen`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity={0.07} />
          <stop offset="100%" stopColor="var(--ink-primary)" stopOpacity={0.025} />
        </radialGradient>
        <clipPath id={`${id}-frame`}>
          <rect x={l} y={t} width={frame.width} height={frame.height} />
        </clipPath>
      </defs>
      {/* The beam, fanned out from the spot to the frame's corners (what's behind the frame hidden by it). */}
      <path d={`M${sx},${sy}L${l},${b}L${l},${t}L${r},${t}L${r},${b}Z`} fill={`url(#${id}-beam)`} />
      <g stroke="var(--ink-primary)" strokeOpacity={0.22} strokeWidth={wire}>
        {[
          [l, t],
          [r, t],
          [l, b],
          [r, b],
        ].map(([x, y]) => (
          <line key={`${x},${y}`} x1={sx} y1={sy} x2={x} y2={y} />
        ))}
      </g>
      {/* The spot it comes from, a glow on the floor round a point of light. */}
      <ellipse cx={sx} cy={sy} rx={frame.width * 0.09} ry={frame.width * 0.022} fill={`url(#${id}-spot)`} />
      <circle cx={sx} cy={sy} r={2.5} fill="var(--ink-primary)" />
      {/* The frame: solid, so the room behind it doesn't show through, then lit. */}
      <rect x={l} y={t} width={frame.width} height={frame.height} fill="var(--page)" />
      <rect x={l} y={t} width={frame.width} height={frame.height} fill={`url(#${id}-screen)`} stroke="var(--ink-primary)" strokeOpacity={0.35} strokeWidth={wire} />
      <g clipPath={`url(#${id}-frame)`}>
        <path d={outline} fill="var(--ink-primary)" fillOpacity={0.05} stroke="var(--ink-primary)" strokeWidth={wire * 1.5} strokeLinejoin="round" />
        {sites.map((s) => {
          const [x, y] = projectorPoint(view, s.pos[0], s.pos[1]);
          return <circle key={s.id} cx={x} cy={y} r={ringRadius(s.count) * view.s} fill="none" stroke="var(--ink-primary)" strokeWidth={wire * 1.5} />;
        })}
      </g>
    </svg>
  );
}

/**
 * The week's games standing up off the projected map, in front of everything (the starters list sinks into the floor
 * behind them): each game's stem from its ring, taller the more players it counts, with the matchup's tag hung off its
 * top on the left (on Mountain or Pacific time, the right) — and, set over them, `overhead` (the kickoff countdown), in
 * the frame's middle across at screen y `top` (higher still, should the frame reach up past it). Those moved out of the frame
 * aren't there.
 */
export function FloorProjectionTags({
  place,
  games,
  overhead,
  top,
  map,
  floor,
}: {
  place: ProjectorPlace;
  games: MappedGame[];
  overhead?: React.ReactNode;
  top: number;
  map?: FloorCameraStore;
  floor?: FloorCameraStore;
}) {
  const view = useProjectorView(place, map, floor);
  const sites = useMemo(() => mapSites(games), [games]);
  // (Drawn only once the room's measured, in the browser.)
  const [rootPx] = useState(() => (typeof document === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
  const { frame } = view;
  // Lower on the map in front of higher; those out of the frame gone.
  const shown = sites
    .map((s) => {
      const [x, y] = projectorPoint(view, s.pos[0], s.pos[1]);
      return { ...s, x, y };
    })
    .filter((s) => s.x >= frame.left && s.x <= frame.left + frame.width && s.y >= frame.top && s.y <= frame.top + frame.height)
    .sort((a, b) => a.y - b.y);
  // Graded from the lowest on the map (nearest you, whole) up to the highest (faintest).
  const [highest, lowest] = [shown[0]?.y ?? 0, shown.at(-1)?.y ?? 0];
  const placed = shown.map((s) => ({
    ...s,
    fade: lowest > highest ? FARTHEST_TAG + (1 - FARTHEST_TAG) * ((s.y - highest) / (lowest - highest)) : 1,
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-10" aria-hidden>
      {/* Over the frame's middle. */}
      {overhead ? (
        <div className="absolute -translate-x-1/2 -translate-y-full" style={{ left: frame.left + frame.width / 2, top: Math.min(top, frame.top - 0.5 * rootPx) }}>
          {overhead}
        </div>
      ) : null}
      {placed.map((s) => (
        <div key={s.id} className="absolute left-0 top-0" style={{ transform: `translate(${s.x}px, ${s.y}px)`, opacity: s.fade }}>
          <span className="absolute bottom-0 left-0 w-px bg-[var(--map-edge)]" style={{ height: `${stemRem(s.count)}rem` }} />
          <span
            className={`absolute whitespace-nowrap bg-[var(--map-tag)] px-[0.35em] py-[0.12em] font-bold leading-[1.3] text-[var(--map-tag-ink)] ${s.west ? "left-0" : "right-0"}`}
            style={{ bottom: `${stemRem(s.count)}rem`, [s.west ? "marginLeft" : "marginRight"]: "0.35em", fontSize: `${TAG_REM}rem`, transform: "translateY(100%)" }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
