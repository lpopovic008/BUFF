"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, internationalSlotPosition } from "@/lib/game-map";
import {
  DEFAULT_SCALES,
  DEFAULT_SCENE,
  MAP_ASPECT,
  MapCamera,
  MapScene,
  SLAB_HEIGHT,
  buildMapScene,
  buildSlabPaths,
} from "@/lib/map-perspective";
import { PlacedLabel, placeLabels } from "@/lib/map-labels";
import { useMapCamera } from "@/hooks/useMapCamera";
import { LeagueLegendEntry, LeagueMark } from "./LeagueMark";

/** One of your starters in a mapped game, enough to show on the preview card. */
export interface MappedStarter {
  playerId: string;
  name: string;
  leagueIds: string[];
}

export interface MappedGame {
  game: NFLGame;
  /** Your starters in this game — the preview card's left column. */
  starters: MappedStarter[];
  /** Your current-week opponents' starters in this game, across every tracked league — the preview card's right column. */
  opponentStarters: MappedStarter[];
}

// The state lines' width in screen px — a hairline at any zoom, so zooming
// in never lands you on a thick band of border. The border is stroked at
// twice this behind the land, so the half that shows matches them.
const LINE_PX = 1;

// Game tag type size, in rem, for a tag at the map's middle in the opening
// view — nudged a little bigger when near the camera and smaller when far,
// but never scaled with zoom.
// Inconsolata is monospaced (every glyph is 0.5em wide), so a tag's size is
// known from its text alone — the stem layout needs every tag's size before
// anything is drawn.
const TAG_REM = 0.625;
const LINE_HEIGHT = 1.3;
const PAD_EM = 0.35;
const PAD_Y_EM = 0.12;
// Space between a stem and its tag.
const STEM_GAP_EM = 0.35;
// Which side of its stem every tag hangs on.
const TAG_SIDE: "left" | "right" = "left";
// How faded a tag at the land's far edge is; the game nearest the camera is fully opaque.
const FAR_OPACITY = 0.25;
// The near/far size nudge stays within this range.
const MIN_TAG_SCALE = 0.85;
const MAX_TAG_SCALE = 1.2;
// Room kept above the map for the tags of its northernmost sites — at
// least this much, more when the opening view's tags need it (narrow
// screens, where the Northeast's tags have to stack higher).
const MIN_HEADROOM_REM = 1.5;
const ZOOM_STEP = 1.25;
// Clearance between a tag's bottom and its site, in rem — the visible stem.
const STEM_REM = 0.6;
// Points around the ring marking a game's site, and its outline in screen px.
const RING_SEGMENTS = 32;
const RING_STROKE_PX = 1.25;

/** A game site's ring radius in flat map units: the more of your starters in the game, the wider. */
function ringRadius(starterCount: number): number {
  return starterCount === 0 ? 2.8 : Math.min(3.6 + starterCount * 1.3, 16);
}

/** A ring on the slab's top face around a flat-map point, projected — it tilts, turns and zooms with the map. */
function ringPath(scene: MapScene, [x, y]: [number, number], radius: number, ground: number): string {
  let d = "";
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    const [px, py] = scene.project(x + Math.cos(a) * radius, y + Math.sin(a) * radius, ground);
    d += `${i ? "L" : "M"}${px.toFixed(2)},${py.toFixed(2)}`;
  }
  return d + "Z";
}

/**
 * The land: a raised slab with its side wall showing along the
 * camera-facing coasts, faint state borders, and the coast/national border
 * stroked *behind* the land at double the state lines' width, so only its
 * outer half shows — it never eats into small coastal states.
 */
function SlabOutline({ camera }: { camera: MapCamera }) {
  const slab = useMemo(() => buildSlabPaths(camera), [camera]);
  return (
    <g strokeLinejoin="miter" strokeMiterlimit={4}>
      {slab.wallLayers.map((d, i) => (
        // The wall layers' own strokes only seal the gaps between them, so
        // (unlike the lines) they scale with the map.
        <path key={i} d={d} fill="var(--map-wall)" stroke="var(--map-wall)" strokeWidth={0.6} />
      ))}
      <path
        d={slab.outline}
        fill="none"
        stroke="var(--map-edge)"
        strokeWidth={LINE_PX * 2}
        vectorEffect="non-scaling-stroke"
      />
      <path d={slab.outline} fill="var(--map-land)" />
      <path
        d={slab.stateLines}
        fill="none"
        stroke="var(--map-state-line)"
        strokeWidth={LINE_PX}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** Away team first, "@" meaning "at" the home team — matching the game headers in the starters list. */
function gameLabel(game: NFLGame): string {
  return `${game.awayTeam} @ ${game.homeTeam}`;
}

/** Games abroad add their city, since their spot on the map is just a holding spot below the border. */
function tagTitle(game: NFLGame): string {
  return isOutsideUS(game) && game.venue?.city ? `${gameLabel(game)} · ${game.venue.city}` : gameLabel(game);
}

function venueLabel(game: NFLGame): string | null {
  if (!game.venue?.city) return null;
  return game.venue.state ? `${game.venue.city}, ${game.venue.state}` : game.venue.city;
}

/** The footprint beside a stem — gap plus tag — in px, from the tag's text at a size multiplier (see TAG_REM). */
function tagSize(title: string, rootPx: number, scale: number): { width: number; height: number } {
  const px = TAG_REM * rootPx * scale;
  return {
    width: Math.ceil((STEM_GAP_EM + title.length * 0.5 + PAD_EM * 2) * px) + 1,
    height: Math.ceil((LINE_HEIGHT + PAD_Y_EM * 2) * px),
  };
}

interface Tag {
  id: string;
  entry: MappedGame;
  pos: [number, number];
  /** The terrain's height at the site, where its stem starts. */
  ground: number;
  title: string;
}

/** A site's perspective magnification — larger is nearer the camera. Zoom plays no part. */
function siteScale(scene: MapScene, t: Tag): number {
  return scene.scaleAt(t.pos[0], t.pos[1], t.ground);
}

interface PlacedTag extends PlacedLabel {
  tag: Tag;
  /** Size multiplier for the tag's text. */
  scale: number;
  opacity: number;
}

/**
 * Stem layout for every tag, in px from the map's top-left, for one camera
 * view. Tags keep a steady on-screen size whatever the zoom (only a mild
 * nudge bigger when near, smaller when far), so zooming in gives the map
 * more room around them. Their fade is relative to the game nearest the
 * camera: that one is fully opaque, and the rest fade with how much farther
 * back they sit, down to FAR_OPACITY at the far edge of the land.
 */
function layoutTags(tags: Tag[], scene: MapScene, width: number, rootPx: number, minTop: number): PlacedTag[] {
  const k = width / scene.view.width;
  const byId = new Map<string, { tag: Tag; scale: number; opacity: number }>();
  const nearest = Math.max(...tags.map((t) => siteScale(scene, t)));
  const span = Math.max(1e-6, nearest - scene.farScale);
  const layout = placeLabels(
    tags.map((t) => {
      const s = siteScale(scene, t);
      const scale = Math.min(MAX_TAG_SCALE, Math.max(MIN_TAG_SCALE, s / DEFAULT_SCALES.center));
      const t01 = Math.min(1, Math.max(0, (s - scene.farScale) / span));
      byId.set(t.id, { tag: t, scale, opacity: FAR_OPACITY + (1 - FAR_OPACITY) * t01 });
      const [x, y] = scene.project(t.pos[0], t.pos[1], t.ground);
      return { id: t.id, x: (x - scene.view.x) * k, y: (y - scene.view.y) * k, ...tagSize(t.title, rootPx, scale) };
    }),
    // Tags may overlap: every stem is the same short height (tries: 1), rather
    // than stacking colliding tags ever higher.
    { baseGap: STEM_REM * rootPx, step: 0, tries: 1, margin: 0, minTop, side: TAG_SIDE }
  );
  return layout.map((l) => ({ ...l, ...byId.get(l.id)! }));
}

// How fast an opened game's details type out.
const TYPE_MS_PER_CHAR = 6;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How many of `total` characters have been "typed" so far — one more every TYPE_MS_PER_CHAR, from mount. */
function useTypewriter(total: number): number {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? total : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const n = Math.min(total, Math.floor((now - start) / TYPE_MS_PER_CHAR));
      setCount(n);
      if (n < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);
  return count;
}

/** The opened game's full title: matchup, where, and when — "PIT @ NYJ · East Rutherford, NJ · Sun 1:00 PM". */
function expandedTitle(game: NFLGame): string {
  const at = new Date(game.kickoff);
  const when = Number.isNaN(at.getTime())
    ? "TBD"
    : `${at.toLocaleDateString([], { weekday: "short" })} ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return [gameLabel(game), venueLabel(game), when].filter(Boolean).join(" · ");
}

/**
 * A tapped game, opened up: its stem runs all the way to the top of the
 * map's frame, and its tag there types itself out, fast, one letter at a
 * time — first the full title (matchup, place, day and time) straight
 * across, then the players two columns wide, yours on the left and your
 * opponents' on the right, one of yours then one of theirs. Each player's
 * league logos appear once their name is in. Tapping it again closes it.
 */
function ExpandedTag({
  tag,
  x,
  y,
  top,
  mapWidth,
  rootPx,
  legendByLeagueId,
  onTap,
}: {
  tag: Tag;
  /** The site, in px from the map box's top-left. */
  x: number;
  y: number;
  /** Where the tag's top edge sits, in the same px space — the top of the frame. */
  top: number;
  mapWidth: number;
  rootPx: number;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  onTap: (clientX: number, clientY: number) => void;
}) {
  const { starters: yours, opponentStarters: theirs } = tag.entry;
  const title = expandedTitle(tag.entry.game);
  const rows = Math.max(yours.length, theirs.length);
  const empty = rows === 0 ? "No starters on either side in this game" : null;
  // Typing order: the title, then row by row — yours, then theirs.
  const segments = [
    title,
    ...Array.from({ length: rows }, (_, i) => [yours[i]?.name ?? "", theirs[i]?.name ?? ""]).flat(),
    ...(empty ? [empty] : []),
  ];
  const offsets: number[] = [];
  let total = 0;
  for (const seg of segments) {
    offsets.push(total);
    total += seg.length;
  }
  const count = useTypewriter(total);
  const typed = (i: number) => segments[i].slice(0, Math.max(0, Math.min(segments[i].length, count - offsets[i])));
  const done = (i: number) => count >= offsets[i] + segments[i].length;
  const typingIndex = segments.findIndex((_, i) => !done(i));
  const cursor = (i: number) =>
    typingIndex === i ? <span className="ml-px inline-block w-[0.5em] animate-pulse bg-current" aria-hidden>&nbsp;</span> : null;

  // Size it from its text (monospaced — every glyph 0.5em) so it can hang
  // beside its stem without running off the map: on TAG_SIDE when there's
  // room, else the other side, else pinned inside the map's edge.
  const em = TAG_REM * rootPx;
  const longest = (list: MappedStarter[]) => Math.max(0, ...list.map((p) => p.name.length * 0.5 + p.leagueIds.length));
  const width = Math.max(
    (title.length * 0.5 + PAD_EM * 2 + 1) * em,
    (longest(yours) + longest(theirs) + 3) * em,
    empty ? (empty.length * 0.5 + 2) * em : 0
  );
  const gap = STEM_GAP_EM * em;
  let left = TAG_SIDE === "left" ? x - gap - width : x + gap;
  if (left < 0) left = x + gap;
  if (left + width > mapWidth) left = Math.max(0, mapWidth - width);
  // Hanging left of the stem, the title grows toward it (right-aligned).
  const towardStem = left + width <= x;

  const nameCell = (starter: MappedStarter | undefined, i: number, align: "left" | "right") => (
    <div className={`flex items-center gap-1 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span>
        {typed(i)}
        {cursor(i)}
      </span>
      {starter && done(i) ? (
        <span className="flex shrink-0 items-center gap-0.5">
          {starter.leagueIds.map((id) => (
            <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-[0.8em] w-[0.8em]" />
          ))}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="absolute left-0 top-0 z-20" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <span className="absolute left-0 w-px bg-[var(--map-edge)]" style={{ top: top - y, height: y - top }} aria-hidden />
      <button
        type="button"
        data-game-tag
        aria-pressed
        aria-label={`${title}. Your starters: ${yours.map((p) => p.name).join(", ") || "none"}. Opponents' starters: ${
          theirs.map((p) => p.name).join(", ") || "none"
        }. Tap to close.`}
        onClick={(e) => onTap(e.clientX, e.clientY)}
        onDoubleClick={(e) => e.stopPropagation()}
        className={`pointer-events-auto absolute flex cursor-pointer flex-col whitespace-nowrap text-left ${
          towardStem ? "items-end" : "items-start"
        }`}
        style={{ top: top - y, left: left - x, width, fontSize: `${TAG_REM}rem`, lineHeight: LINE_HEIGHT }}
      >
        <span
          className="block max-w-full bg-[var(--map-tag)] font-bold text-[var(--map-tag-ink)]"
          style={{ padding: `${PAD_Y_EM}em ${PAD_EM}em` }}
        >
          {typed(0)}
          {cursor(0)}
        </span>
        {done(0) ? (
          <div className="mt-px w-full bg-page/90 px-[0.35em] py-[0.2em] font-medium text-ink-primary">
            {empty ? (
              <span className="text-ink-secondary">
                {typed(1)}
                {cursor(1)}
              </span>
            ) : (
              <div className="grid grid-cols-2 gap-x-[1.5em] gap-y-[0.1em]">
                {Array.from({ length: rows }, (_, r) => [
                  <div key={`y${r}`}>{nameCell(yours[r], 1 + r * 2, "left")}</div>,
                  <div key={`t${r}`} className="flex justify-end">
                    {nameCell(theirs[r], 2 + r * 2, "right")}
                  </div>,
                ])}
              </div>
            )}
          </div>
        ) : null}
      </button>
    </div>
  );
}

/**
 * This week's games on the interactive 3D US map. Each game site has a thin
 * ring on the map (wider the more of your starters play in it) and sends up
 * a short vertical stem with the matchup on a high-contrast neutral tag hung
 * off its top, always on the same side of the stem (TAG_SIDE) however the
 * map is turned. Tags stay upright and a steady size, fading with distance
 * from the camera; they may overlap, and repeated taps on one spot cycle
 * through every tag there. Tapping a tag opens it up in place (see
 * ExpandedTag). Games played abroad can't sit on the US outline, so they
 * rise from south of the border below New Mexico. Zooming in lets the map
 * run past the edges of its frame, which clips it.
 */
export function GameMap({ games, legend }: { games: MappedGame[]; legend: LeagueLegendEntry[] }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const { camera, isDefault, reset, zoomBy, wasDrag, handlers } = useMapCamera(mapRef);
  const scene = useMemo(() => buildMapScene(camera), [camera]);
  const [measure, setMeasure] = useState<{ width: number; rootPx: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const legendByLeagueId = useMemo(() => new Map(legend.map((l) => [l.leagueId, l])), [legend]);

  // The tags are laid out in px, so track the map's rendered width (and the
  // fluid root font size, which changes with the viewport too).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const observer = new ResizeObserver(() =>
      setMeasure({
        width: map.clientWidth,
        rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      })
    );
    observer.observe(map);
    return () => observer.disconnect();
  }, []);

  // Ctrl/⌘ + scroll (and a trackpad pinch, which arrives as one) zooms; a
  // plain scroll is left alone so the page still scrolls past the map.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Tapping anywhere outside the open game — elsewhere on the map, or
  // anywhere else on the page — closes it. A tap on a tag is left to the
  // tag's own click, which opens, switches, or closes it.
  useEffect(() => {
    if (!selected) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (target?.closest("[data-game-tag]")) return;
      setSelected(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [selected]);

  const tags = useMemo(() => {
    let abroadIndex = 0;
    return games
      .map((entry): Tag | null => {
        const pos = isOutsideUS(entry.game) ? internationalSlotPosition(abroadIndex++) : gameMapPosition(entry.game);
        if (!pos) return null;
        return {
          id: entry.game.id,
          entry,
          pos,
          ground: SLAB_HEIGHT,
          title: tagTitle(entry.game),
        };
      })
      .filter((t) => t !== null);
  }, [games]);

  // Sized from the opening view only (per screen width, not per frame), so
  // turning the map never makes the page around it jump; other views fit
  // their tags into the same room.
  const headroomPx = useMemo(() => {
    if (!measure) return null;
    const { width, rootPx } = measure;
    const free = layoutTags(tags, DEFAULT_SCENE, width, rootPx, -Infinity);
    const highest = Math.min(0, ...free.map((l) => l.y - l.stem));
    return Math.max(MIN_HEADROOM_REM * rootPx, Math.ceil(-highest) + 4);
  }, [measure, tags]);

  const placed = useMemo(() => {
    if (!measure || headroomPx === null) return [];
    // Paint far tags first so nearer ones sit on top.
    return layoutTags(tags, scene, measure.width, measure.rootPx, -headroomPx).sort((a, b) => a.y - b.y);
  }, [measure, headroomPx, scene, tags]);

  const selectedTag = placed.find((p) => p.id === selected) ?? null;
  const headroom = headroomPx ?? 0;

  /**
   * Tags may overlap, so a tap resolves to every tag under it rather than
   * just the one the browser hit (the topmost, which would otherwise hide
   * the rest for good). One tag there: tapping opens or closes it. Several:
   * the first tap opens the earliest kickoff among them, and each tap on the
   * same spot after that moves on to the next, wrapping around.
   */
  function handleTagClick(id: string, clientX: number, clientY: number) {
    // The click a drag ends with is just the end of moving the map.
    if (wasDrag()) return;
    const box = mapRef.current?.getBoundingClientRect();
    const px = box ? clientX - box.left : NaN;
    const py = box ? clientY - box.top : NaN;
    const under = placed
      .filter((p) => {
        const left = TAG_SIDE === "left" ? p.x - p.width : p.x;
        const top = p.y - p.stem;
        return px >= left && px <= left + p.width && py >= top && py <= top + p.height;
      })
      .sort(
        (a, b) =>
          new Date(a.tag.entry.game.kickoff).getTime() - new Date(b.tag.entry.game.kickoff).getTime() ||
          a.tag.title.localeCompare(b.tag.title)
      );
    if (under.length <= 1) {
      setSelected((current) => (current === id ? null : id));
      return;
    }
    setSelected((current) => {
      const i = under.findIndex((p) => p.id === current);
      return under[i === -1 ? 0 : (i + 1) % under.length].id;
    });
  }

  const controlClass =
    "border border-grid bg-page px-2 py-1 text-xs leading-none text-ink-secondary hover:text-ink-primary disabled:opacity-40";
  const stop = {
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onDoubleClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };

  return (
    <div className="relative">
      {/* The map's frame: drags anywhere in it turn the map, and everything —
          the land when zoomed in, tags running up into the headroom or out to
          the column's edge — is cut off at its edges, never covering the page
          around it or making it scroll sideways. */}
      <div
        ref={frameRef}
        className="relative w-full cursor-grab touch-none select-none overflow-clip outline-none [-webkit-touch-callout:none] active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-ink-muted"
        style={{ paddingTop: headroomPx === null ? `${MIN_HEADROOM_REM}rem` : headroomPx }}
        tabIndex={0}
        aria-label="US map. Drag to spin and tilt it; drag with two fingers, Shift or the right mouse button to move it; pinch, Ctrl+scroll or the +/- keys to zoom; arrow keys to turn; double-click or Home to reset the view."
        {...handlers}
      >
        <div className="mx-auto w-full min-w-0 max-w-[44rem]">
          <div ref={mapRef} className="relative" style={{ aspectRatio: MAP_ASPECT }}>
            {/* overflow-visible: zoomed-in land runs on past the map box, out to the frame's edges. */}
            <svg
              viewBox={scene.viewBox}
              preserveAspectRatio="xMidYMid meet"
              className="absolute inset-0 block h-full w-full overflow-visible"
              aria-hidden
            >
              <SlabOutline camera={camera} />
              {/* Each game's ring sits on the map itself, so it tilts, turns and
                  zooms with the land — wider the more of your starters play in it. */}
              <g fill="none" stroke="var(--map-edge)" strokeWidth={RING_STROKE_PX}>
                {placed.map(({ id, tag, opacity }) => (
                  <path
                    key={id}
                    d={ringPath(scene, tag.pos, ringRadius(tag.entry.starters.length), tag.ground)}
                    opacity={selected === id ? 1 : opacity}
                    // The ring's size follows the map; its outline stays a thin line.
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            </svg>

            <div className="pointer-events-none absolute inset-0" role="list" aria-label={`${tags.length} games across the United States`}>
              {placed.map(({ id, x, y, stem, tag, opacity, scale }) => {
                // The open game is drawn on its own, opened up, below.
                if (id === selected) return null;
                return (
                  <div
                    key={id}
                    role="listitem"
                    className="group absolute left-0 top-0"
                    style={{ transform: `translate(${x}px, ${y}px)` }}
                  >
                    <span
                      className="absolute left-0 w-px bg-[var(--map-edge)] group-hover:!opacity-100"
                      style={{ top: -stem, height: stem, opacity }}
                      aria-hidden
                    />
                    {/* Far tags are genuinely translucent — the map shows through them. */}
                    <button
                      type="button"
                      data-game-tag
                      aria-pressed={false}
                      aria-label={`${tag.title} — show starters`}
                      onClick={(e) => handleTagClick(id, e.clientX, e.clientY)}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className={`pointer-events-auto absolute cursor-pointer whitespace-nowrap font-bold ${
                        TAG_SIDE === "left" ? "right-0" : "left-0"
                      }`}
                      style={{
                        top: -stem,
                        [TAG_SIDE === "left" ? "marginRight" : "marginLeft"]: `${STEM_GAP_EM}em`,
                        fontSize: `${TAG_REM * scale}rem`,
                        lineHeight: LINE_HEIGHT,
                      }}
                    >
                      <span
                        className="block bg-[var(--map-tag)] text-[var(--map-tag-ink)] group-hover:!opacity-100"
                        style={{ opacity, padding: `${PAD_Y_EM}em ${PAD_EM}em` }}
                      >
                        {tag.title}
                      </span>
                    </button>
                  </div>
                );
              })}
              {selectedTag && measure ? (
                <ExpandedTag
                  key={selectedTag.id}
                  tag={selectedTag.tag}
                  x={selectedTag.x}
                  y={selectedTag.y}
                  // The top of the frame, just inside it.
                  top={-headroom + 3}
                  mapWidth={measure.width}
                  rootPx={measure.rootPx}
                  legendByLeagueId={legendByLeagueId}
                  onTap={(cx, cy) => handleTagClick(selectedTag.id, cx, cy)}
                />
              ) : null}
            </div>

            <div className="absolute left-0 top-0 z-10 flex gap-1">
              <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} {...stop} className={controlClass}>
                −
              </button>
              <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} {...stop} className={controlClass}>
                +
              </button>
              {isDefault ? null : (
                <button type="button" onClick={reset} {...stop} className={controlClass}>
                  Reset view
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
