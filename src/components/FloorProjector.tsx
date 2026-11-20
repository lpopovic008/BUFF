"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { formatCountdown } from "@/lib/format";
import { isOutsideUS } from "@/lib/nfl-schedule";
import { abroadOnMap, gameMapPosition, gameState } from "@/lib/game-map";
import type { FloorCameraStore } from "@/lib/floor-camera";
import { MAP_BOUNDS, ProjectorPlace, ProjectorView, projectorPath, projectorPoint, projectorView } from "@/lib/projector";
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

/** Where each game is on the map — those played abroad in their city in their country, drawn small under the
 * southwest (see abroadOnMap): the rightmost of them with its tag off the right of the stem as the southwest's are, any
 * left of it off the left, so they don't cover each other. */
export function mapSites(games: MappedGame[]): MapSite[] {
  const { positions } = abroadOnMap(games.map((entry) => entry.game));
  const rightmost = Math.max(...[...positions.values()].map(([x]) => x));
  return games.flatMap((entry) => {
    const outside = isOutsideUS(entry.game);
    const pos = outside ? (positions.get(entry.game.id) ?? null) : gameMapPosition(entry.game);
    if (!pos) return [];
    const count = entry.count ?? entry.starters.length + entry.opponentStarters.length;
    const west = outside ? pos[0] >= rightmost : WEST_STATES.has(gameState(entry.game) ?? "");
    return [{ id: entry.game.id, pos, label: `${entry.game.awayTeam} @ ${entry.game.homeTeam}`, count, west }];
  });
}

/** The projector as it shows now: its picture moved and zoomed (`map`), over the floor where it's been moved (`floor`). */
function useProjectorView(place: ProjectorPlace, map?: FloorCameraStore, floor?: FloorCameraStore): ProjectorView {
  const picture = useFloorCamera(map).camera;
  const moved = useFloorCamera(floor).camera;
  return useMemo(() => projectorView(place, picture, moved), [place, picture, moved]);
}

/** How long the projector's to have held still (ms) for its glow to come back. */
const STILL_MS = 180;

/** Whether the projector's picture (`map`) and the floor under it (`floor`) are holding still — not while either's moving. */
function useStill(map?: FloorCameraStore, floor?: FloorCameraStore): boolean {
  const [still, setStill] = useState(true);
  useEffect(() => {
    let timer = 0;
    const moved = () => {
      setStill(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setStill(true), STILL_MS);
    };
    const off = [map?.subscribe(moved), floor?.subscribe(moved)];
    return () => {
      window.clearTimeout(timer);
      off.forEach((o) => o?.());
    };
  }, [map, floor]);
  return still;
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

/** An outline's points (map units), each ring of it apart. */
function mapRings(d: string): [number, number][][] {
  return d
    .split("M")
    .filter(Boolean)
    .map((ring) => [...ring.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]));
}

/** Where an outline's points show (screen px), each ring of it apart — the lower 48's, or another's (`d`). */
function outlineRings(view: ProjectorView, d = US_PROJECTED_OUTLINE_PATH): [number, number][][] {
  return mapRings(d).map((ring) => ring.map(([x, y]) => projectorPoint(view, x, y)));
}

/** How many steps round the lens the haze's edge is found at. */
const HAZE_STEPS = 480;

/**
 * The haze of light from the lens (`lens`) to the map: every point between them, as far out as any of `rings` (screen
 * px; a ring's points joined round, a pair's just the one stretch) goes — round the lens a step of angle at a time, a ray
 * out at each to the farthest stretch of their edges it crosses. One shape, drawn quickly however the map's zoomed,
 * rather than a wedge for every stretch of the map's edge; and every ray finds the edge, so there are no gaps in it.
 */
function hazeShape([sx, sy]: [number, number], rings: [number, number][][]): string {
  const segments: [number, number, number, number][] = [];
  for (const ring of rings) {
    const closed = ring.length > 2;
    for (let i = 0; i < ring.length - (closed ? 0 : 1); i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      segments.push([ax - sx, ay - sy, bx - sx, by - sy]);
    }
  }
  if (segments.length === 0) return "";
  // The angles the map spans, seen from the lens (none straight up; turning clockwise).
  const angle = (x: number, y: number) => Math.atan2(x, -y);
  let [lo, hi] = [Infinity, -Infinity];
  for (const [ax, ay, bx, by] of segments) [lo, hi] = [Math.min(lo, angle(ax, ay), angle(bx, by)), Math.max(hi, angle(ax, ay), angle(bx, by))];
  // Each stretch filed under the steps whose rays can cross it (those within the angles its ends span), so each ray
  // looks at just those.
  const span = hi - lo || 1;
  const stepOf = (a: number) => ((a - lo) / span) * HAZE_STEPS;
  const near: [number, number, number, number][][] = Array.from({ length: HAZE_STEPS + 1 }, () => []);
  for (const seg of segments) {
    const [from, to] = [stepOf(angle(seg[0], seg[1])), stepOf(angle(seg[2], seg[3]))];
    for (let k = Math.max(0, Math.floor(Math.min(from, to))); k <= Math.min(HAZE_STEPS, Math.ceil(Math.max(from, to))); k++) near[k].push(seg);
  }
  let d = `M${sx},${sy}`;
  for (let k = 0; k <= HAZE_STEPS; k++) {
    const a = lo + (span * k) / HAZE_STEPS;
    const [dx, dy] = [Math.sin(a), -Math.cos(a)];
    // How far out the ray crosses the farthest stretch: the lens + t·(dx, dy) = a + u·(b − a), u within the stretch.
    let far = 0;
    for (const [ax, ay, bx, by] of near[k]) {
      const [ex, ey] = [bx - ax, by - ay];
      const det = dx * -ey + ex * dy;
      if (Math.abs(det) < 1e-9) continue;
      const t = (ax * -ey + ex * ay) / det;
      const u = (dx * ay - dy * ax) / det;
      if (t > far && u >= 0 && u <= 1) far = t;
    }
    if (far > 0) d += `L${(sx + dx * far).toFixed(1)},${(sy + dy * far).toFixed(1)}`;
  }
  return `${d}Z`;
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

/** A country abroad's name (px), lit under it. */
const COUNTRY_NAME_PX = 8;

/** About how wide a country's name is lit (px). */
const nameWidth = (name: string) => name.length * COUNTRY_NAME_PX * 0.68;

/** Countries' names, left to right, moved along as far as keeps each clear of the one before. */
function namedApart<T extends { name: string; under: [number, number] }>(countries: T[]): T[] {
  let right = -Infinity;
  return countries.map((c) => {
    const half = nameWidth(c.name) / 2;
    const x = Math.max(c.under[0], right + 4 + half);
    right = x + half;
    return { ...c, under: [x, c.under[1]] as [number, number] };
  });
}

/** The countdown's size over the map (px), and how far over its line it stands. */
const COUNTDOWN_PX = 26;
const COUNTDOWN_GAP_PX = 6;

/**
 * Where the countdown stands on the map (map units): in its middle across, on the straight line along the top of the
 * lower 48 from Washington's corner to Maine's — the mainland's convex hull's top edge there.
 */
const COUNTDOWN_SPOT: [number, number] = (() => {
  const pts = [...US_PROJECTED_OUTLINE_PATH.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  const x = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2;
  // The hull's top chain, left to right (y down: the points no line between two others passes above).
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const top: [number, number][] = [];
  for (const p of sorted) {
    while (top.length >= 2) {
      const [o, a] = [top[top.length - 2], top[top.length - 1]];
      if ((a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]) <= 0) top.pop();
      else break;
    }
    top.push(p);
  }
  const i = top.findIndex((p, k) => k > 0 && p[0] >= x);
  const [a, b] = [top[Math.max(0, i - 1)], top[Math.max(0, i)]];
  return [x, b[0] === a[0] ? a[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
})();

/**
 * The week's map, projected (see projector.ts): from a lens of light on the floor, in its middle near the front, light
 * thrown up into the air over the floor, the lower 48 lit where it lands — facing you square on, see-through (the room
 * showing through it), their outline glowing in ink (white, or black in light mode) and faintly scanned across, each
 * game's ring on it. Rays fan from the lens to the map's edge, a haze of light between them, its two outermost
 * brightest — flickering a little, as a projector's light does; over it, the countdown to the next kickoff, lit as the
 * map is. The country of each game being played abroad lit small under the southwest, as the states are, and named
 * (see abroadOnMap), coming up with its game. Drawn in the room, behind everything; the games' stems and tags stand up in front (see
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
  // Its glow left off while it's moving (zoomed, panned, slid with the floor): blurred afresh every frame, it's the
  // costliest thing to draw — back as soon as it's still.
  const still = useStill(map, floor);
  const sites = useMemo(() => mapSites(games), [games]);
  const abroad = useMemo(() => abroadOnMap(games.map((entry) => entry.game)).countries, [games]);
  const wire = useWire();
  const id = useId().replace(/:/g, "");
  const countdown = useCountdown(kickoffs);
  const counting = countdown !== null;
  // Where the countdown's lit: over the middle of the frame's top.
  // Where the countdown's lit: on the map, over its top edge's middle — moved and zoomed with it.
  const [clockX, clockLine] = projectorPoint(view, ...COUNTDOWN_SPOT);
  const clock = { x: clockX, y: clockLine - COUNTDOWN_GAP_PX, wide: COUNTDOWN_PX * 0.62 * 8 };
  const drawn = useMemo(() => {
    const rings = outlineRings(view);
    const edge = rings.flat();
    // The rays go to the mainland's edge (its longest ring), not its islands.
    const mainland = rings.reduce((a, b) => (b.length > a.length ? b : a), []);
    const [sx, sy] = view.source;
    // The light's haze: everything between the lens and the map's edge (the countries abroad's too, and over the
    // countdown), so it ends where the map does — no straight edges across from coast to coast. One shape: round the
    // lens, a step of angle at a time, out as far as the map's edge goes that way (see hazeShape).
    const countryRings = abroad.map((c) => outlineRings(view, c.path));
    const edges = [...rings, ...countryRings.flat()];
    if (counting) edges.push([[clock.x - clock.wide / 2, clock.y - COUNTDOWN_PX], [clock.x + clock.wide / 2, clock.y - COUNTDOWN_PX]]);
    // Its outermost rays: to the points of the edge farthest round either way from the lens.
    const angle = ([x, y]: [number, number]) => Math.atan2(x - sx, sy - y);
    const outer = edge.length ? [edge.reduce((a, b) => (angle(b) < angle(a) ? b : a)), edge.reduce((a, b) => (angle(b) > angle(a) ? b : a))] : [];
    // Rays to the edge all round, about evenly along it.
    const step = Math.max(1, Math.round(mainland.length / RAYS));
    const rays = mainland.filter((_, i) => i % step === 0);
    const top = Math.min(...edge.map((p) => p[1]), counting ? clock.y - COUNTDOWN_PX : Infinity);
    return {
      outline: projectorPath(view, US_PROJECTED_OUTLINE_PATH),
      countries: namedApart(abroad.map((c) => ({ name: c.name, d: projectorPath(view, c.path), under: projectorPoint(view, c.left + c.width / 2, c.top + c.height) }))),
      haze: hazeShape([sx, sy], edges),
      rays: rays.map(([x, y]) => `M${sx},${sy}L${x.toFixed(1)},${y.toFixed(1)}`).join(""),
      outer: outer.map(([x, y]) => `M${sx},${sy}L${x.toFixed(1)},${y.toFixed(1)}`).join(""),
      top,
    };
  }, [view, abroad, counting, clock.x, clock.y, clock.wide]);
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
          {drawn.countries.map((c) => (
            <path key={c.name} d={c.d} />
          ))}
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
      {still ? <path d={drawn.outline} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.5} strokeWidth={wire * 3} strokeLinejoin="round" filter={`url(#${id}-glow)`} /> : null}
      <path d={drawn.outline} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.85} strokeWidth={wire * 1.25} strokeLinejoin="round" />
      {/* The countries games are being played in abroad, lit as the states are, each named under it — coming up with them. */}
      {drawn.countries.map((c) => (
        <g key={c.name} style={{ animation: "fade-in 400ms ease-out" }}>
          <path d={c.d} fill="var(--ink-primary)" fillOpacity={0.06} />
          {still ? <path d={c.d} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.5} strokeWidth={wire * 3} strokeLinejoin="round" filter={`url(#${id}-glow)`} /> : null}
          <path d={c.d} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.85} strokeWidth={wire * 1.25} strokeLinejoin="round" />
          <text
            x={c.under[0]}
            y={c.under[1] + COUNTRY_NAME_PX + 2}
            textAnchor="middle"
            fontSize={COUNTRY_NAME_PX}
            fontWeight={700}
            letterSpacing="0.06em"
            fill="var(--ink-primary)"
            fillOpacity={0.75}
          >
            {c.name.toUpperCase()}
          </text>
        </g>
      ))}
      {sites.map((s) => {
        const [x, y] = projectorPoint(view, s.pos[0], s.pos[1]);
        return <circle key={s.id} cx={x} cy={y} r={ringRadius(s.count) * view.s} fill="none" stroke="var(--ink-primary)" strokeOpacity={0.85} strokeWidth={wire * 1.5} />;
      })}
      {/* The countdown to the next kickoff, lit over the map as it is: glowing, see-through. */}
      {countdown !== null ? (
        <g fontSize={COUNTDOWN_PX} fontWeight={700} textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>
          {still ? (
            <text x={clock.x} y={clock.y} fill="var(--ink-primary)" fillOpacity={0.5} filter={`url(#${id}-glow)`}>
              {countdown}
            </text>
          ) : null}
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
