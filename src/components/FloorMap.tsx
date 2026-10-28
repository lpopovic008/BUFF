"use client";

import { useEffect, useMemo, useState } from "react";
import { isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, gameState, internationalSlotPosition } from "@/lib/game-map";
import { US_SIMPLE_OUTLINE_PATH, US_SIMPLE_STATE_LINES_PATH } from "@/lib/team-cities";
import { US_STATE_SHAPES } from "@/lib/us-states";
import { FloorMapFit, floorMapPath, floorMapPoint, floorMapRing } from "@/lib/floor-map";
import type { FloorCameraStore } from "@/lib/floor-camera";
import { LINE_OPACITY, useFloorCamera } from "./FloorGrid";
import type { MappedGame } from "./GameMap";

// A game's ring on the floor, wider the more players it counts (in map units), and its stem standing up from it,
// taller the more it counts (in rem) — each player a good deal taller, so counts tell apart at a glance.
function ringRadius(count: number): number {
  return count === 0 ? 2.8 : Math.min(3.6 + count * 0.9, 16);
}
function stemRem(count: number): number {
  return Math.min(0.4 + count * 0.6, 6);
}
// The states on Mountain and Pacific time: their games' tags hang off the right of the stem, the rest off the left.
const WEST_STATES = new Set(["AZ", "CO", "NM", "UT", "WY", "MT", "ID", "NV", "CA", "OR", "WA"]);
const TAG_REM = 0.625;

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

function useSites(games: MappedGame[]): MapSite[] {
  return useMemo(() => mapSites(games), [games]);
}

/** The map's fit, moved with the floor. */
function useMovedFit(fit: FloorMapFit, store?: FloorCameraStore): FloorMapFit {
  const { camera } = useFloorCamera(store);
  return useMemo(() => ({ ...fit, camera }), [fit, camera]);
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
 * The week's map lying on the room's floor, at the front, nearest you (see floor-map.ts): the land the floor's own
 * color (no grid lines across it), its borders and coast wires like the grid's, the states with a game outlined
 * solid in ink (white, or black in light mode), and each game's ring on it. Drawn in the room,
 * behind everything; the games' stems and tags stand up in front (see FloorMapTags). Moved with the floor
 * (`camera`), none of it past the horizon.
 */
export function FloorMapLand({ fit: lying, games, camera }: { fit: FloorMapFit; games: MappedGame[]; camera?: FloorCameraStore }) {
  const fit = useMovedFit(lying, camera);
  const sites = useSites(games);
  const wire = useWire();
  const active = useMemo(() => [...new Set(games.map(({ game }) => gameState(game)).filter((c) => c !== null))], [games]);
  const paths = useMemo(
    () => ({
      outline: floorMapPath(fit, US_SIMPLE_OUTLINE_PATH),
      lines: floorMapPath(fit, US_SIMPLE_STATE_LINES_PATH),
      active: active.flatMap((code) => (US_STATE_SHAPES[code] ? [floorMapPath(fit, US_STATE_SHAPES[code])] : [])),
    }),
    [fit, active]
  );
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      <clipPath id="floor-map-floor">
        <rect x={0} y={fit.height * fit.share} width={fit.width} height={fit.height * (1 - fit.share)} />
      </clipPath>
      <g clipPath="url(#floor-map-floor)">
        <path d={paths.outline} fill="var(--page)" />
        <g fill="none" stroke="var(--ink-primary)" strokeOpacity={LINE_OPACITY} strokeWidth={wire}>
          <path d={paths.lines} />
          <path d={paths.outline} />
        </g>
        <g fill="none" stroke="var(--ink-primary)" strokeWidth={wire}>
          {paths.active.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {sites.map((s) => (
          <path key={s.id} d={floorMapRing(fit, s.pos[0], s.pos[1], ringRadius(s.count))} fill="none" stroke="var(--ink-primary)" strokeWidth={wire * 1.5} />
        ))}
      </g>
    </svg>
  );
}

/**
 * The week's games standing up off the map on the floor, in front of everything (the starters list sinks into the
 * floor behind them): each game's stem from its ring, taller the more players it counts, with the matchup's tag
 * hung off its top on the left (on Mountain or Pacific time, the right) — and, set over them, `overhead` (the kickoff countdown), above the map's middle as
 * it lies. Moved with the floor (`camera`), those on the floor still on the screen.
 */
export function FloorMapTags({
  fit: lying,
  games,
  overhead,
  top,
  camera,
}: {
  fit: FloorMapFit;
  games: MappedGame[];
  overhead?: React.ReactNode;
  top: number;
  camera?: FloorCameraStore;
}) {
  const fit = useMovedFit(lying, camera);
  const sites = useSites(games);
  // Nearer tags on top of farther ones.
  const placed = sites
    .map((s) => {
      const [x, y] = floorMapPoint(fit, s.pos[0], s.pos[1]);
      return { ...s, x, y };
    })
    .filter((s) => s.y >= fit.height * fit.share && s.y <= fit.height && s.x >= 0 && s.x <= fit.width)
    .sort((a, b) => a.y - b.y);
  const [midX] = floorMapPoint(lying, 160, 200);
  return (
    <div className="pointer-events-none fixed inset-0 z-10" aria-hidden>
      {overhead ? (
        <div className="absolute -translate-x-1/2 -translate-y-full" style={{ left: midX, top }}>
          {overhead}
        </div>
      ) : null}
      {placed.map((s) => (
        <div key={s.id} className="absolute left-0 top-0" style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>
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
