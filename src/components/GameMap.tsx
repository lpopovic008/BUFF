"use client";

import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, internationalSlotPosition } from "@/lib/game-map";
import { formatKickoff } from "@/lib/my-starters";
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

/** One player's row in the preview card — name plus the logo of every league they're started in. `align="right"` mirrors the row (logos before the name) for the opponents column, so both columns read outward from the card's center gutter. */
function PlayerRow({
  starter,
  legendByLeagueId,
  align,
}: {
  starter: MappedStarter;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  align: "left" | "right";
}) {
  const marks = (
    <span className="flex shrink-0 items-center gap-0.5">
      {starter.leagueIds.map((id) => (
        <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
      ))}
    </span>
  );
  const name = <span className="truncate">{starter.name}</span>;
  return (
    <div className={`flex items-center gap-1 text-ink-secondary ${align === "right" ? "flex-row-reverse" : ""}`}>
      {name}
      {marks}
    </div>
  );
}

/**
 * The click-to-preview card: one line up top with the matchup, kickoff, and
 * venue, then two columns below it — your starters in that game on the
 * left, that week's opposing starters (across every tracked league) on the
 * right — each with the logo of every league they're started in next to
 * their name. Centered across the map, and vertically hugging the clicked
 * tag, opening toward whichever half of the map has room.
 */
function GamePreviewCard({
  entry,
  top,
  opensDown,
  legendByLeagueId,
  onClose,
  cardRef,
}: {
  entry: MappedGame;
  /** px from the top of the map area, where the card's near edge sits. */
  top: number;
  opensDown: boolean;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  onClose: () => void;
  cardRef: RefObject<HTMLDivElement | null>;
}) {
  const summaryLine = [gameLabel(entry.game), formatKickoff(entry.game.kickoff), venueLabel(entry.game)]
    .filter(Boolean)
    .join(" · ");
  const hasAnyone = entry.starters.length > 0 || entry.opponentStarters.length > 0;

  return (
    <div
      ref={cardRef}
      className="absolute z-20 w-80 max-w-[calc(100%-1rem)] border border-grid bg-page p-3 text-xs shadow-sm"
      style={{ left: "50%", top, transform: `translate(-50%, ${opensDown ? "0" : "-100%"})` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-ink-primary">
          {summaryLine}
          {isOutsideUS(entry.game) ? " · outside the US" : ""}
        </span>
        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="shrink-0 leading-none text-ink-muted hover:text-ink-primary"
        >
          ×
        </button>
      </div>
      {hasAnyone ? (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-muted">You</span>
            {entry.starters.map((starter) => (
              <PlayerRow key={starter.playerId} starter={starter} legendByLeagueId={legendByLeagueId} align="left" />
            ))}
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-ink-muted">Opponent</span>
            {entry.opponentStarters.map((starter) => (
              <PlayerRow key={starter.playerId} starter={starter} legendByLeagueId={legendByLeagueId} align="right" />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-ink-secondary">None of your starters or opponents&rsquo; starters are in this game.</p>
      )}
    </div>
  );
}

/**
 * This week's games on the interactive 3D US map. Each game site sends up a thin vertical stem with the matchup on a
 * high-contrast neutral tag hung off its top, always on the same side of the
 * stem (TAG_SIDE) however the map is turned. Tags stay upright and readable
 * at any angle, sized and faded by how close their site is to the camera, so
 * they keep their proportion to the map as it turns and zooms; where tags
 * would collide, the nearer one keeps the shorter stem and the others rise
 * above it (see placeLabels). Tapping a tag opens a preview of that game's
 * fantasy starters, yours and your opponents'. Games played abroad can't sit
 * on the US outline, so they rise from just south of the border below New
 * Mexico. The view stays centered on the map's middle; zooming in lets the
 * map run past the edges of its frame, which clips it.
 */
export function GameMap({ games, legend }: { games: MappedGame[]; legend: LeagueLegendEntry[] }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const { camera, isDefault, reset, zoomBy, wasDrag, handlers } = useMapCamera(mapRef);
  const scene = useMemo(() => buildMapScene(camera), [camera]);
  const cardRef = useRef<HTMLDivElement | null>(null);
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

  // Tapping anywhere outside the open preview — elsewhere on the map, or
  // anywhere else on the page — dismisses it. A tap on a tag is left to the
  // tag's own click, which opens, switches, or closes the preview.
  useEffect(() => {
    if (!selected) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (cardRef.current?.contains(target)) return;
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
  const mapHeight = measure ? measure.width / MAP_ASPECT : 0;
  const gap = 0.4 * (measure?.rootPx ?? 16);

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
    // Positions the preview card, which may spill past the map's clipped area.
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
              {placed.map(({ id, x, y, stem, tag, opacity: closenessOpacity, scale }) => {
                const opacity = selected === id ? 1 : closenessOpacity;
                return (
                  <div
                    key={id}
                    role="listitem"
                    className="group absolute left-0 top-0"
                    // The open game's tag comes to the front of any it overlaps.
                    style={{ transform: `translate(${x}px, ${y}px)`, zIndex: selected === id ? 5 : undefined }}
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
                      aria-pressed={selected === id}
                      aria-label={`${tag.title} — show starters`}
                      onClick={(e) => handleTagClick(id, e.clientX, e.clientY)}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className={`pointer-events-auto absolute cursor-pointer whitespace-nowrap font-bold outline-offset-1 ${
                        TAG_SIDE === "left" ? "right-0" : "left-0"
                      } ${selected === id ? "outline outline-2 outline-[var(--map-edge)]" : ""}`}
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

      {selectedTag ? (
        (() => {
          const tagTop = selectedTag.y - selectedTag.stem;
          const opensDown = tagTop + selectedTag.height / 2 < mapHeight / 2;
          return (
            <GamePreviewCard
              entry={selectedTag.tag.entry}
              top={headroom + (opensDown ? tagTop + selectedTag.height + gap : tagTop - gap)}
              opensDown={opensDown}
              legendByLeagueId={legendByLeagueId}
              onClose={() => setSelected(null)}
              cardRef={cardRef}
            />
          );
        })()
      ) : null}
    </div>
  );
}
