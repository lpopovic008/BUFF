"use client";

import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, internationalSlotPosition } from "@/lib/game-map";
import { formatKickoff } from "@/lib/my-starters";
import {
  DEFAULT_CAMERA,
  DEFAULT_SCALES,
  DEFAULT_SCENE,
  MAP_ASPECT,
  MapCamera,
  MapScene,
  buildMapScene,
  buildSlabPaths,
} from "@/lib/map-perspective";
import { Heightfield, loadHeightfield, surfaceHeightAt } from "@/lib/us-heightfield";
import { PlacedLabel, placeLabels } from "@/lib/map-labels";
import { useMapCamera } from "@/hooks/useMapCamera";
import { LeagueLegendEntry, LeagueMark } from "./LeagueMark";
import { TerrainCanvas } from "./TerrainCanvas";

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

// The state lines' width in the SVG fallback; the border is stroked at twice
// this behind the land, so the half that shows matches them.
const LINE_WIDTH = 0.38;

// Game tag type size, in rem, for a tag at the map's middle in the opening
// view — nearer tags grow and farther ones shrink with perspective and zoom.
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
// How faded a tag at the map's far edge (in the opening view) is; the nearest are fully opaque.
const FAR_OPACITY = 0.25;
// Tag size multipliers are held to this range, so a far tag stays legible
// and a near one at full zoom doesn't swallow the map.
const MIN_TAG_SCALE = 0.55;
const MAX_TAG_SCALE = 3;
// Room kept above the map for the tags of its northernmost sites — at
// least this much, more when the opening view's tags need it (narrow
// screens, where the Northeast's tags have to stack higher).
const MIN_HEADROOM_REM = 1.5;
const ZOOM_STEP = 1.25;

/**
 * The flat slab — the map before the 3D terrain loads, or instead of it
 * where WebGL isn't available: a raised outline with its side wall, faint
 * state borders, and the coast/national border stroked *behind* the land at
 * double the state lines' width, so only its outer half shows.
 */
function SlabOutline({ camera }: { camera: MapCamera }) {
  const slab = useMemo(() => buildSlabPaths(camera), [camera]);
  return (
    <g strokeLinejoin="miter" strokeMiterlimit={4}>
      {slab.wallLayers.map((d, i) => (
        <path key={i} d={d} fill="var(--map-wall)" stroke="var(--map-wall)" strokeWidth={0.6} />
      ))}
      <path d={slab.outline} fill="none" stroke="var(--map-edge)" strokeWidth={LINE_WIDTH * 2} />
      <path d={slab.outline} fill="var(--map-land)" />
      <path d={slab.stateLines} fill="none" stroke="var(--map-state-line)" strokeWidth={LINE_WIDTH} />
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

/**
 * How close a site is to the camera, relative to the map's middle in the
 * opening view: perspective magnification times zoom. Drives both a tag's
 * size (it stays in proportion to the map around it) and its fade.
 */
function closeness(scene: MapScene, zoom: number, t: Tag): number {
  return (scene.scaleAt(t.pos[0], t.pos[1], t.ground) * zoom) / DEFAULT_SCALES.center;
}

const FAR_CLOSENESS = DEFAULT_SCALES.far / DEFAULT_SCALES.center;
const NEAR_CLOSENESS = DEFAULT_SCALES.near / DEFAULT_SCALES.center;

function tagOpacity(c: number): number {
  const t = Math.min(1, Math.max(0, (c - FAR_CLOSENESS) / (NEAR_CLOSENESS - FAR_CLOSENESS)));
  return FAR_OPACITY + (1 - FAR_OPACITY) * t;
}

interface PlacedTag extends PlacedLabel {
  tag: Tag;
  /** Size multiplier for the tag's text. */
  scale: number;
  opacity: number;
}

/** Stem layout for every tag, in px from the map's top-left, for one camera view. */
function layoutTags(tags: Tag[], scene: MapScene, zoom: number, width: number, rootPx: number, minTop: number): PlacedTag[] {
  const k = width / scene.view.width;
  const byId = new Map<string, { tag: Tag; scale: number; opacity: number }>();
  const layout = placeLabels(
    tags.map((t) => {
      const c = closeness(scene, zoom, t);
      const scale = Math.min(MAX_TAG_SCALE, Math.max(MIN_TAG_SCALE, c));
      byId.set(t.id, { tag: t, scale, opacity: tagOpacity(c) });
      const [x, y] = scene.project(t.pos[0], t.pos[1], t.ground);
      return { id: t.id, x: (x - scene.view.x) * k, y: (y - scene.view.y) * k, ...tagSize(t.title, rootPx, scale) };
    }),
    { baseGap: 0.2 * rootPx, step: 0.1 * rootPx, tries: 140, margin: 1, minTop, side: TAG_SIDE }
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
 * This week's games on the interactive 3D US map (TerrainCanvas draws the
 * land; the flat SVG slab stands in until it loads, or if WebGL can't run).
 * Each game site sends up a thin vertical stem with the matchup on a
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
  const { camera, isDefault, reset, zoomBy, wasDrag, handlers } = useMapCamera();
  const scene = useMemo(() => buildMapScene(camera), [camera]);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [measure, setMeasure] = useState<{
    width: number;
    rootPx: number;
    /** The map box's offset inside the frame, and the frame's size — the canvas covers the whole frame. */
    ox: number;
    oy: number;
    fw: number;
    fh: number;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [heightfield, setHeightfield] = useState<Heightfield | null>(null);
  const [terrainReady, setTerrainReady] = useState<boolean | null>(null);
  const legendByLeagueId = useMemo(() => new Map(legend.map((l) => [l.leagueId, l])), [legend]);

  useEffect(() => {
    let cancelled = false;
    loadHeightfield()
      .then((hf) => !cancelled && setHeightfield(hf))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The tags are laid out in px, so track the map's rendered size and place
  // in its frame (and the fluid root font size, which changes with the
  // viewport too).
  useEffect(() => {
    const frame = frameRef.current;
    const map = mapRef.current;
    if (!frame || !map) return;
    const observer = new ResizeObserver(() =>
      setMeasure({
        width: map.clientWidth,
        rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
        ox: map.offsetLeft,
        oy: map.offsetTop,
        fw: frame.clientWidth,
        fh: frame.clientHeight,
      })
    );
    observer.observe(frame);
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
      zoomBy(Math.exp(-e.deltaY * 0.01));
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
          ground: surfaceHeightAt(heightfield, pos[0], pos[1]),
          title: tagTitle(entry.game),
        };
      })
      .filter((t) => t !== null);
  }, [games, heightfield]);

  // Sized from the opening view only (per screen width, not per frame), so
  // turning the map never makes the page around it jump; other views fit
  // their tags into the same room.
  const headroomPx = useMemo(() => {
    if (!measure) return null;
    const { width, rootPx } = measure;
    const free = layoutTags(tags, DEFAULT_SCENE, DEFAULT_CAMERA.zoom, width, rootPx, -Infinity);
    const highest = Math.min(0, ...free.map((l) => l.y - l.stem));
    return Math.max(MIN_HEADROOM_REM * rootPx, Math.ceil(-highest) + 4);
  }, [measure, tags]);

  const placed = useMemo(() => {
    if (!measure || headroomPx === null) return [];
    // Paint far tags first so nearer ones sit on top.
    return layoutTags(tags, scene, camera.zoom, measure.width, measure.rootPx, -headroomPx).sort((a, b) => a.y - b.y);
  }, [measure, headroomPx, scene, camera.zoom, tags]);

  // The canvas covers the whole frame (headroom and the column's margins
  // too), so zoomed-in land fills the frame instead of stopping at the map box.
  const canvasView = useMemo(() => {
    if (!measure) return scene.view;
    const k = measure.width / scene.view.width;
    return {
      x: scene.view.x - measure.ox / k,
      y: scene.view.y - measure.oy / k,
      width: measure.fw / k,
      height: measure.fh / k,
    };
  }, [measure, scene]);

  const selectedTag = placed.find((p) => p.id === selected) ?? null;
  const headroom = headroomPx ?? 0;
  const mapHeight = measure ? measure.width / MAP_ASPECT : 0;
  const gap = 0.4 * (measure?.rootPx ?? 16);

  function handleTagClick(id: string) {
    // The click a drag ends with is just the end of turning the map.
    if (wasDrag()) return;
    setSelected((current) => (current === id ? null : id));
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
        aria-label="US map. Drag to spin and tilt it; pinch, Ctrl+scroll or the +/- keys to zoom; arrow keys to nudge; double-click or Home to reset the view."
        {...handlers}
      >
        <TerrainCanvas
          camera={camera}
          view={canvasView}
          onReady={setTerrainReady}
          className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ${
            terrainReady ? "opacity-100" : "opacity-0"
          }`}
        />
        <div className="mx-auto w-full min-w-0 max-w-[44rem]">
          <div ref={mapRef} className="relative" style={{ aspectRatio: MAP_ASPECT }}>
            {terrainReady ? null : (
              <svg
                viewBox={scene.viewBox}
                preserveAspectRatio="xMidYMid meet"
                className="absolute inset-0 block h-full w-full overflow-visible"
                aria-hidden
              >
                <SlabOutline camera={camera} />
              </svg>
            )}

            <div className="pointer-events-none absolute inset-0" role="list" aria-label={`${tags.length} games across the United States`}>
              {placed.map(({ id, x, y, stem, tag, opacity: closenessOpacity, scale }) => {
                const opacity = selected === id ? 1 : closenessOpacity;
                return (
                  <div
                    key={id}
                    role="listitem"
                    className="group absolute left-0 top-0"
                    style={{ transform: `translate(${x}px, ${y}px)` }}
                  >
                    <span
                      className="absolute -left-[0.15rem] -top-[0.15rem] h-[0.3rem] w-[0.3rem] rounded-full bg-[var(--map-edge)] group-hover:!opacity-100"
                      style={{ opacity }}
                      aria-hidden
                    />
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
                      onClick={() => handleTagClick(id)}
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
