"use client";

import { useEffect, useMemo, useState } from "react";
import { isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, gameState, internationalSlotPosition } from "@/lib/game-map";
import { US_SIMPLE_OUTLINE_PATH, US_SIMPLE_STATE_LINES_PATH } from "@/lib/team-cities";
import { US_STATE_SHAPES } from "@/lib/us-states";
import { FloorMapFit, floorMapPath, floorMapPoint, floorMapRing } from "@/lib/floor-map";
import type { MappedGame } from "./GameMap";

// A game's ring on the floor, wider the more players it counts (in map units), and its stem standing up from it,
// taller the more it counts (in rem) — as on the map (see GameMap).
function ringRadius(count: number): number {
  return count === 0 ? 2.8 : Math.min(3.6 + count * 0.9, 16);
}
function stemRem(count: number): number {
  return Math.min(0.6 + count * 0.3, 4);
}
const TAG_REM = 0.625;

interface Site {
  id: string;
  pos: [number, number];
  label: string;
  count: number;
}

function useSites(games: MappedGame[]): Site[] {
  return useMemo(() => {
    let abroad = 0;
    return games.flatMap((entry) => {
      const pos = isOutsideUS(entry.game) ? internationalSlotPosition(abroad++) : gameMapPosition(entry.game);
      if (!pos) return [];
      const count = entry.count ?? entry.starters.length + entry.opponentStarters.length;
      return [{ id: entry.game.id, pos, label: `${entry.game.awayTeam} @ ${entry.game.homeTeam}`, count }];
    });
  }, [games]);
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
 * The week's map lying on the room's floor, at the front, nearest you (see floor-map.ts): the land — the states
 * with a game a shade fuller — its borders and coast in wires, and each game's ring on it. Drawn in the room,
 * behind everything; the games' stems and tags stand up in front (see FloorMapTags).
 */
export function FloorMapLand({ fit, games }: { fit: FloorMapFit; games: MappedGame[] }) {
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
      <path d={paths.outline} fill="var(--map-land-quiet)" />
      {paths.active.map((d, i) => (
        <path key={i} d={d} fill="var(--map-land)" />
      ))}
      <path d={paths.lines} fill="none" stroke="var(--map-state-line)" strokeWidth={wire} />
      <path d={paths.outline} fill="none" stroke="var(--map-edge)" strokeWidth={wire} />
      {sites.map((s) => (
        <path key={s.id} d={floorMapRing(fit, s.pos[0], s.pos[1], ringRadius(s.count))} fill="none" stroke="var(--map-edge)" strokeWidth={wire * 1.5} />
      ))}
    </svg>
  );
}

/**
 * The week's games standing up off the map on the floor, in front of everything (the starters list sinks into the
 * floor behind them): each game's stem from its ring, taller the more players it counts, with the matchup's tag
 * hung off its top on the left — and, set over them, `overhead` (the kickoff countdown), above the map's middle.
 */
export function FloorMapTags({ fit, games, overhead, top }: { fit: FloorMapFit; games: MappedGame[]; overhead?: React.ReactNode; top: number }) {
  const sites = useSites(games);
  // Nearer tags on top of farther ones.
  const placed = sites
    .map((s) => {
      const [x, y] = floorMapPoint(fit, s.pos[0], s.pos[1]);
      return { ...s, x, y };
    })
    .sort((a, b) => a.y - b.y);
  const [midX] = floorMapPoint(fit, 160, 200);
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
            className="absolute right-0 whitespace-nowrap bg-[var(--map-tag)] px-[0.35em] py-[0.12em] font-bold leading-[1.3] text-[var(--map-tag-ink)]"
            style={{ bottom: `${stemRem(s.count)}rem`, marginRight: "0.35em", fontSize: `${TAG_REM}rem`, transform: "translateY(100%)" }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
