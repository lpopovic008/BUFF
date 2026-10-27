"use client";

import { useEffect, useMemo, useState } from "react";
import { isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, gameState, internationalSlotPosition } from "@/lib/game-map";
import { US_MAP_VIEWBOX, US_SIMPLE_OUTLINE_PATH, US_SIMPLE_STATE_LINES_PATH } from "@/lib/team-cities";
import { US_STATE_SHAPES } from "@/lib/us-states";
import { OUTLINE_POINTS } from "@/lib/map-perspective";
import { FLOOR_TILT, HORIZON_SHARE, PERSPECTIVE_PX, fitMap, screenAt } from "@/lib/grid-floor";
import type { MappedGame } from "./GameMap";

const [, , MAP_W, MAP_H] = US_MAP_VIEWBOX.split(" ").map(Number);
// The floor's grid, in floor px.
const GRID_PX = 64;
// The room kept between the map and the screen's sides and bottom, in px.
const SIDE_PX = 24;
const BOTTOM_PX = 24;
// The map's lines, and each game's ring outline, in screen-ish px (at the floor's horizon, where it's least magnified).
const LINE_PX = 1;
const RING_PX = 1.5;
// A game's stem and tag, standing up off the floor as on the map (see GameMap): the stem taller the more players
// the game counts, the tag a steady size nudged bigger nearer you and smaller farther back, and fading farther back.
const TAG_REM = 0.625;
const STEM_REM = 0.6;
const STEM_REM_PER_PLAYER = 0.3;
const MAX_STEM_REM = 4;
const STEM_GAP_EM = 0.35;
const MIN_TAG_SCALE = 0.85;
const MAX_TAG_SCALE = 1.2;
const FAR_OPACITY = 0.35;

/** A game site's ring radius in map units, wider the more players it counts — as on the map (see GameMap). */
function ringRadius(count: number): number {
  return count === 0 ? 2.8 : Math.min(3.6 + count * 0.9, 16);
}

/**
 * The home page's room, from tablet width up: a grid floor running back to the horizon with the US map laid on it,
 * as large as it fits on the screen, and the week's games on it — a ring on the floor at each, and a stem standing
 * up from it with the matchup's tag on top.
 */
export function GridRoom({ games }: { games: MappedGame[] }) {
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const measure = () => setView({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const fit = useMemo(() => (view ? fitMap(OUTLINE_POINTS, view, SIDE_PX, BOTTOM_PX) : null), [view]);
  const sites = useMemo(() => {
    let abroad = 0;
    return games.flatMap((entry) => {
      const pos = isOutsideUS(entry.game) ? internationalSlotPosition(abroad++) : gameMapPosition(entry.game);
      if (!pos) return [];
      const count = entry.count ?? entry.starters.length + entry.opponentStarters.length;
      return [{ id: entry.game.id, pos, label: `${entry.game.awayTeam} @ ${entry.game.homeTeam}`, count }];
    });
  }, [games]);
  const activeStates = useMemo(() => [...new Set(games.map(({ game }) => gameState(game)).filter((c) => c !== null))], [games]);

  // Each site on the screen, with how magnified the floor is there; drawn far to near, so nearer tags sit on top.
  const placed = useMemo(() => {
    if (!view || !fit) return [];
    const a = (FLOOR_TILT * Math.PI) / 180;
    const scaleAt = (d: number) => PERSPECTIVE_PX / (PERSPECTIVE_PX - d * Math.sin(a));
    const at = sites.map((s) => {
      const d = fit.d + fit.k * s.pos[1];
      const [x, y] = screenAt(fit.u + fit.k * s.pos[0], d, view);
      return { ...s, x, y, scale: scaleAt(d) };
    });
    // Near and far by the map's own edges, so a game's tag reads the same whichever other games are on.
    const ys = OUTLINE_POINTS.filter((_, i) => i % 2 === 1);
    const [far, near] = [scaleAt(fit.d + fit.k * Math.min(...ys)), scaleAt(fit.d + fit.k * Math.max(...ys))];
    const mid = (far + near) / 2;
    return at
      .map((s) => ({
        ...s,
        tag: Math.min(MAX_TAG_SCALE, Math.max(MIN_TAG_SCALE, s.scale / mid)),
        opacity: near > far ? FAR_OPACITY + (1 - FAR_OPACITY) * ((s.scale - far) / (near - far)) : 1,
      }))
      .sort((p, q) => p.y - q.y);
  }, [sites, view, fit]);

  const ink = (percent: number) => `color-mix(in srgb, var(--ink-primary) ${percent}%, transparent)`;
  const unit = fit ? 1 / fit.k : 1;
  return (
    <div
      aria-hidden
      className="grid-room max-md:hidden"
      style={{ perspective: `${PERSPECTIVE_PX}px`, perspectiveOrigin: `50% ${HORIZON_SHARE * 100}%`, ["--horizon" as string]: `${HORIZON_SHARE * 100}%` }}
    >
      <div
        className="grid-room-floor"
        // The grid lined up with the map's corner.
        style={{ transform: `rotateX(${FLOOR_TILT}deg)`, backgroundSize: `${GRID_PX}px ${GRID_PX}px`, ...(fit ? { backgroundPosition: `${fit.u}px ${fit.d}px` } : {}) }}
      >
        {fit ? (
          <svg
            viewBox={US_MAP_VIEWBOX}
            width={MAP_W * fit.k}
            height={MAP_H * fit.k}
            className="absolute left-0 top-0 overflow-visible"
            style={{ transform: `translate(${fit.u}px, ${fit.d}px)` }}
          >
            <path d={US_SIMPLE_OUTLINE_PATH} fill={ink(6)} />
            {activeStates.map((code) => (US_STATE_SHAPES[code] ? <path key={code} d={US_STATE_SHAPES[code]} fill={ink(11)} /> : null))}
            <path d={US_SIMPLE_STATE_LINES_PATH} fill="none" stroke={ink(25)} strokeWidth={LINE_PX * unit} />
            <path d={US_SIMPLE_OUTLINE_PATH} fill="none" stroke={ink(55)} strokeWidth={LINE_PX * 1.5 * unit} />
            {sites.map((s) => (
              <circle key={s.id} cx={s.pos[0]} cy={s.pos[1]} r={ringRadius(s.count)} fill="none" stroke="var(--map-edge)" strokeWidth={RING_PX * unit} />
            ))}
          </svg>
        ) : null}
      </div>

      {/* Standing up off the floor: each game's stem, and its tag hung off the stem's top on the left. */}
      {placed.map((p) => {
        const stem = Math.min(STEM_REM + p.count * STEM_REM_PER_PLAYER, MAX_STEM_REM);
        return (
          <div key={p.id} className="absolute left-0 top-0" style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: p.opacity }}>
            <span className="absolute bottom-0 left-0 w-px bg-[var(--map-edge)]" style={{ height: `${stem}rem` }} />
            <span
              className="absolute right-0 whitespace-nowrap bg-[var(--map-tag)] px-[0.35em] py-[0.12em] font-bold leading-[1.3] text-[var(--map-tag-ink)]"
              style={{ bottom: `${stem}rem`, marginRight: `${STEM_GAP_EM}em`, fontSize: `${TAG_REM * p.tag}rem`, transform: "translateY(100%)" }}
            >
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
