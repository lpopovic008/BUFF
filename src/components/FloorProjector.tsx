"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { formatCountdown } from "@/lib/format";
import { isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, gameState, internationalSlotPosition } from "@/lib/game-map";
import type { FloorCameraStore } from "@/lib/floor-camera";
import { ProjectorPlace, ProjectorView, projectorPath, projectorPoint, projectorView } from "@/lib/projector";
import { US_PROJECTED_OUTLINE_PATH } from "@/lib/us-outline";
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

/** Where the outline's points show (screen px), each ring of it apart. */
function outlineRings(view: ProjectorView): [number, number][][] {
  return US_PROJECTED_OUTLINE_PATH.split("M")
    .filter(Boolean)
    .map((ring) => [...ring.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => projectorPoint(view, Number(m[1]), Number(m[2]))));
}

/** How many rays of light go from the lens to the map's edge, about. */
const RAYS = 14;

/** The countdown to the next of `kickoffs` (ms), ticking each second — null once they've all kicked off. */
function useCountdown(kickoffs: number[] | undefined): string | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!kickoffs?.length) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [kickoffs]);
  if (now === null || !kickoffs) return null;
  const next = kickoffs.find((t) => t > now);
  return next === undefined ? null : formatCountdown(next - now);
}

/** The countdown's size over the map (px), and how far over its frame it stands. */
const COUNTDOWN_PX = 26;
const COUNTDOWN_GAP_PX = 10;

/**
 * The week's map, projected (see projector.ts): from a lens of light on the floor, in its middle near the front, light
 * thrown up into the air over the floor, the lower 48 lit where it lands — facing you square on, see-through (the room
 * showing through it), their outline glowing in ink (white, or black in light mode) and faintly scanned across, each
 * game's ring on it. Rays fan from the lens to the map's edge, a haze of light between them, its two outermost
 * brightest — flickering a little, as a projector's light does; over it, the countdown to the next kickoff, lit as the
 * map is. Drawn in the room, behind everything; the games' stems and tags stand up in front (see
 * FloorProjectionTags). Its picture moved and zoomed (`map`), and all of it slid with the floor under it (`floor`).
 */
export function FloorProjection({
  place,
  games,
  map,
  floor,
  countdown: kickoffs,
}: {
  place: ProjectorPlace;
  games: MappedGame[];
  map?: FloorCameraStore;
  floor?: FloorCameraStore;
  /** The week's kickoffs (ms): the countdown to the next one projected with the map, just over it. */
  countdown?: number[];
}) {
  const view = useProjectorView(place, map, floor);
  const sites = useMemo(() => mapSites(games), [games]);
  const wire = useWire();
  const id = useId().replace(/:/g, "");
  const countdown = useCountdown(kickoffs);
  const counting = countdown !== null;
  // Where the countdown's lit: over the middle of the frame's top.
  const clock = {
    x: view.frame.left + view.frame.width / 2,
    y: view.frame.top - COUNTDOWN_GAP_PX,
    wide: COUNTDOWN_PX * 0.62 * 8,
  };
  const drawn = useMemo(() => {
    const rings = outlineRings(view);
    const edge = rings.flat();
    // The rays go to the mainland's edge (its longest ring), not its islands.
    const mainland = rings.reduce((a, b) => (b.length > a.length ? b : a), []);
    const [sx, sy] = view.source;
    // The light's haze: a fan from the lens to every stretch of the map's edge (and over the countdown), so it ends
    // where the map does — no straight edges across from coast to coast. Each wedge wound the same way, so they add up.
    const wedge = ([ax, ay]: [number, number], [bx, by]: [number, number]) => {
      const turn = (ax - sx) * (by - sy) - (ay - sy) * (bx - sx);
      const [p, q] = turn >= 0 ? [[ax, ay], [bx, by]] : [[bx, by], [ax, ay]];
      return `M${sx},${sy}L${p[0].toFixed(1)},${p[1].toFixed(1)}L${q[0].toFixed(1)},${q[1].toFixed(1)}Z`;
    };
    const fan = rings.flatMap((ring) => ring.map((p, i) => wedge(p, ring[(i + 1) % ring.length])));
    if (counting) fan.push(wedge([clock.x - clock.wide / 2, clock.y - COUNTDOWN_PX], [clock.x + clock.wide / 2, clock.y - COUNTDOWN_PX]));
    // Its outermost rays: to the points of the edge farthest round either way from the lens.
    const angle = ([x, y]: [number, number]) => Math.atan2(x - sx, sy - y);
    const outer = edge.length ? [edge.reduce((a, b) => (angle(b) < angle(a) ? b : a)), edge.reduce((a, b) => (angle(b) > angle(a) ? b : a))] : [];
    // Rays to the edge all round, about evenly along it.
    const step = Math.max(1, Math.round(mainland.length / RAYS));
    const rays = mainland.filter((_, i) => i % step === 0);
    const top = Math.min(...edge.map((p) => p[1]), counting ? clock.y - COUNTDOWN_PX : Infinity);
    return {
      outline: projectorPath(view, US_PROJECTED_OUTLINE_PATH),
      haze: fan.join(""),
      rays: rays.map(([x, y]) => `M${sx},${sy}L${x.toFixed(1)},${y.toFixed(1)}`).join(""),
      outer: outer.map(([x, y]) => `M${sx},${sy}L${x.toFixed(1)},${y.toFixed(1)}`).join(""),
      top,
    };
  }, [view, counting, clock.x, clock.y, clock.wide]);
  const [sx, sy] = view.source;
  const spread = view.frame.width;
  return (
    <div className="absolute inset-0" aria-hidden>
    {/* The light, flickering as a projector's does — on a layer of its own, so it's cheap to. */}
    <svg className="projector-flicker absolute inset-0 h-full w-full">
      <defs>
        {/* The light: brightest as it leaves the lens, thinning as it spreads up to the map. */}
        <linearGradient id={`${id}-beam`} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={sx} y2={drawn.top}>
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity={0.16} />
          <stop offset="55%" stopColor="var(--ink-primary)" stopOpacity={0.05} />
          <stop offset="100%" stopColor="var(--ink-primary)" stopOpacity={0.015} />
        </linearGradient>
        <linearGradient id={`${id}-ray`} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={sx} y2={drawn.top}>
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--ink-primary)" stopOpacity={0.04} />
        </linearGradient>
        <radialGradient id={`${id}-lens`}>
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity={0.55} />
          <stop offset="35%" stopColor="var(--ink-primary)" stopOpacity={0.18} />
          <stop offset="100%" stopColor="var(--ink-primary)" stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* The light, from the lens to the map's edge. */}
      <path d={drawn.haze} fill={`url(#${id}-beam)`} />
      <path d={drawn.rays} fill="none" stroke={`url(#${id}-ray)`} strokeWidth={wire} strokeOpacity={0.55} />
      <path d={drawn.outer} fill="none" stroke={`url(#${id}-ray)`} strokeWidth={wire * 1.5} />
      {/* The lens, a glow on the floor round a point of light. */}
      <ellipse cx={sx} cy={sy} rx={spread * 0.11} ry={spread * 0.026} fill={`url(#${id}-lens)`} />
      <ellipse cx={sx} cy={sy} rx={3.5} ry={2} fill="var(--ink-primary)" />
    </svg>
    {/* The picture, with it, a little. */}
    <svg className="projector-flicker-soft absolute inset-0 h-full w-full">
      <defs>
        {/* Scan lines across the picture, as a projection's light has. */}
        <pattern id={`${id}-scan`} width={4} height={3} patternUnits="userSpaceOnUse">
          <rect width={4} height={1} fill="var(--ink-primary)" />
        </pattern>
        <clipPath id={`${id}-land`}>
          <path d={drawn.outline} />
        </clipPath>
        <filter id={`${id}-glow`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={2.5} />
        </filter>
      </defs>
      {/* The map where the light lands: see-through, scanned across, its outline glowing. */}
      <path d={drawn.outline} fill="var(--ink-primary)" fillOpacity={0.06} />
      <rect
        x={0}
        y={0}
        width={place.width}
        height={place.height}
        fill={`url(#${id}-scan)`}
        opacity={0.07}
        clipPath={`url(#${id}-land)`}
      />
      <path d={drawn.outline} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.5} strokeWidth={wire * 3} strokeLinejoin="round" filter={`url(#${id}-glow)`} />
      <path d={drawn.outline} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.85} strokeWidth={wire * 1.25} strokeLinejoin="round" />
      {sites.map((s) => {
        const [x, y] = projectorPoint(view, s.pos[0], s.pos[1]);
        return <circle key={s.id} cx={x} cy={y} r={ringRadius(s.count) * view.s} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.85} strokeWidth={wire * 1.5} />;
      })}
      {/* The countdown to the next kickoff, lit over the map as it is: glowing, see-through. */}
      {countdown !== null ? (
        <g fontSize={COUNTDOWN_PX} fontWeight={700} textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>
          <text x={clock.x} y={clock.y} fill="var(--ink-primary)" fillOpacity={0.5} filter={`url(#${id}-glow)`}>
            {countdown}
          </text>
          <text x={clock.x} y={clock.y} fill="var(--ink-primary)" fillOpacity={0.85}>
            {countdown}
          </text>
        </g>
      ) : null}
    </svg>
    </div>
  );
}

/**
 * The week's games standing up off the projected map, in front of everything (the starters list sinks into the floor
 * behind them): each game's stem from its ring, taller the more players it counts, with the matchup's tag hung off its
 * top on the left (on Mountain or Pacific time, the right). Those moved off the screen aren't there.
 */
export function FloorProjectionTags({ place, games, map, floor }: { place: ProjectorPlace; games: MappedGame[]; map?: FloorCameraStore; floor?: FloorCameraStore }) {
  const view = useProjectorView(place, map, floor);
  const sites = useMemo(() => mapSites(games), [games]);
  // Lower on the map in front of higher; those off the screen gone.
  const shown = sites
    .map((s) => {
      const [x, y] = projectorPoint(view, s.pos[0], s.pos[1]);
      return { ...s, x, y };
    })
    .filter((s) => s.x >= 0 && s.x <= place.width && s.y >= 0 && s.y <= place.height)
    .sort((a, b) => a.y - b.y);
  // Graded from the lowest on the map (nearest you, whole) up to the highest (faintest).
  const [highest, lowest] = [shown[0]?.y ?? 0, shown.at(-1)?.y ?? 0];
  const placed = shown.map((s) => ({
    ...s,
    fade: lowest > highest ? FARTHEST_TAG + (1 - FARTHEST_TAG) * ((s.y - highest) / (lowest - highest)) : 1,
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-10" aria-hidden>
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
