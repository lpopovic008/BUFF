"use client";

import { RefObject, useEffect, useMemo, useState } from "react";
import { isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, gameState, internationalSlotPosition } from "@/lib/game-map";
import { US_MAP_VIEWBOX, US_SIMPLE_OUTLINE_PATH, US_SIMPLE_STATE_LINES_PATH } from "@/lib/team-cities";
import { US_STATE_SHAPES } from "@/lib/us-states";
import { FLOOR_TILT, HORIZON_SHARE, PERSPECTIVE_PX, floorAt, frameOn, tourStops } from "@/lib/grid-floor";
import type { MappedGame } from "./GameMap";

const [, , MAP_W, MAP_H] = US_MAP_VIEWBOX.split(" ").map(Number);
// The floor's grid, in world px.
const GRID_PX = 64;
// Where on the screen the camera brings each game: under the middle of the column the map stood in, this far
// from the horizon down to the screen's bottom.
const FOCUS_DOWN = 0.3;
// While panning, about this share of the map's width shows across at that spot; landing on a game zooms in this much.
const MAP_SHARE = 0.9;
const LAND_ZOOM = 1.35;
// The tour's beats: the pan to a game, the zoom in on it, and how long it stays there.
const PAN_MS = 2800;
const LAND_MS = 1400;
const DWELL_MS = 3600;
// A game's tag type size and its plate's padding, in world px; its ring's outline.
const TAG_PX = 11;
const PAD_PX = 3;
const RING_PX = 1.5;

/** A game site's ring radius in map units, wider the more players it counts — as on the map (see GameMap). */
function ringRadius(count: number): number {
  return count === 0 ? 2.8 : Math.min(3.6 + count * 0.9, 16);
}

interface Site {
  entry: MappedGame;
  pos: [number, number];
  label: string;
  count: number;
}

/**
 * The home page's room, from tablet width up: a grid floor running back to the horizon with the week's games on
 * the US map drawn into it, and a camera that pans from game to game, zooming in a little as it lands on each
 * (every game, by kickoff). Still, under reduced motion: the whole map.
 */
export function GridRoom({ games, anchorRef }: { games: MappedGame[]; anchorRef: RefObject<HTMLElement | null> }) {
  const [view, setView] = useState<{ width: number; height: number; anchorX: number } | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const measure = () => {
      const box = anchorRef.current?.getBoundingClientRect();
      const width = window.innerWidth;
      setView({ width, height: window.innerHeight, anchorX: box && box.width > 0 ? box.left + box.width / 2 : width / 2 });
    };
    measure();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReduced(motion.matches);
    onMotion();
    window.addEventListener("resize", measure);
    motion.addEventListener("change", onMotion);
    return () => {
      window.removeEventListener("resize", measure);
      motion.removeEventListener("change", onMotion);
    };
  }, [anchorRef]);

  const sites = useMemo(() => {
    let abroad = 0;
    return games.flatMap((entry): Site[] => {
      const pos = isOutsideUS(entry.game) ? internationalSlotPosition(abroad++) : gameMapPosition(entry.game);
      if (!pos) return [];
      const count = entry.count ?? entry.starters.length + entry.opponentStarters.length;
      return [{ entry, pos, label: `${entry.game.awayTeam} @ ${entry.game.homeTeam}`, count }];
    });
  }, [games]);
  const stops = useMemo(() => {
    const byId = new Map(sites.map((s) => [s.entry.game.id, s]));
    return tourStops(sites.map((s) => s.entry.game)).map((g) => byId.get(g.id)!);
  }, [sites]);
  const activeStates = useMemo(() => [...new Set(games.map(({ game }) => gameState(game)).filter((c) => c !== null))], [games]);

  // The tour: pan to a stop, land (zoom in), stay, then on to the next. The first framing is set without moving.
  const [stop, setStop] = useState(0);
  const [landed, setLanded] = useState(false);
  const [moving, setMoving] = useState(false);
  const touring = !reduced && stops.length > 0 && view !== null;
  useEffect(() => {
    if (!touring) return;
    const timer = setTimeout(
      () => {
        setMoving(true);
        if (!landed) setLanded(true);
        else {
          setLanded(false);
          setStop((i) => i + 1);
        }
      },
      !moving ? 600 : landed ? LAND_MS + DWELL_MS : PAN_MS
    );
    return () => clearTimeout(timer);
  }, [touring, landed, stop, moving]);

  const focus = view ? floorAt(view.anchorX, view.height * (HORIZON_SHARE + (1 - HORIZON_SHARE) * FOCUS_DOWN), view) : null;
  // World px per map unit: the map sized so MAP_SHARE of it shows across the focus.
  const k = view && focus ? view.width / focus.scale / MAP_SHARE / MAP_W : 1;
  const current = touring ? stops[stop % stops.length] : null;
  const [wx, wy] = current ? current.pos : [MAP_W / 2, MAP_H / 2];
  const frame = focus ? frameOn(wx * k, wy * k, focus.u, focus.d, current && landed ? LAND_ZOOM : 1) : null;
  const ease = landed ? `${LAND_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1)` : `${PAN_MS}ms cubic-bezier(0.65, 0, 0.35, 1)`;
  const animate = touring && moving;

  const ink = (percent: number) => `color-mix(in srgb, var(--ink-primary) ${percent}%, transparent)`;
  const unit = 1 / k;
  return (
    <div
      aria-hidden
      className="grid-room max-md:hidden"
      style={{ perspective: `${PERSPECTIVE_PX}px`, perspectiveOrigin: `50% ${HORIZON_SHARE * 100}%`, ["--horizon" as string]: `${HORIZON_SHARE * 100}%` }}
    >
      <div
        className="grid-room-floor"
        style={{
          transform: `rotateX(${FLOOR_TILT}deg)`,
          ...(frame
            ? {
                backgroundSize: `${GRID_PX * frame.zoom}px ${GRID_PX * frame.zoom}px`,
                backgroundPosition: `${frame.x}px ${frame.y}px`,
                transition: animate ? `background-position ${ease}, background-size ${ease}` : "none",
              }
            : {}),
        }}
      >
        {frame ? (
          <svg
            viewBox={US_MAP_VIEWBOX}
            width={MAP_W * k}
            height={MAP_H * k}
            className="absolute left-0 top-0 origin-top-left overflow-visible"
            style={{ transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.zoom})`, transition: animate ? `transform ${ease}` : "none" }}
          >
            <path d={US_SIMPLE_OUTLINE_PATH} fill={ink(5)} />
            {activeStates.map((code) => (US_STATE_SHAPES[code] ? <path key={code} d={US_STATE_SHAPES[code]} fill={ink(9)} /> : null))}
            <path d={US_SIMPLE_STATE_LINES_PATH} fill="none" stroke={ink(22)} strokeWidth={unit} />
            <path d={US_SIMPLE_OUTLINE_PATH} fill="none" stroke={ink(50)} strokeWidth={RING_PX * unit} />
            {sites.map((site) => {
              const on = site === current;
              const r = ringRadius(site.count);
              const size = TAG_PX * unit;
              const pad = PAD_PX * unit;
              const w = site.label.length * 0.5 * size + pad * 2;
              const h = size * 1.3;
              const [x, y] = site.pos;
              return (
                <g key={site.entry.game.id} opacity={on || !current ? 1 : 0.35} className="transition-opacity duration-700">
                  <circle cx={x} cy={y} r={r} fill="none" stroke="var(--map-edge)" strokeWidth={(on ? 2.5 : RING_PX) * unit} />
                  <rect x={x - r - pad - w} y={y - h / 2} width={w} height={h} fill="var(--map-tag)" />
                  <text
                    x={x - r - pad - w / 2}
                    y={y}
                    fontSize={size}
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--map-tag-ink)"
                  >
                    {site.label}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
