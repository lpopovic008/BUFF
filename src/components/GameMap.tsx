"use client";

import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, internationalSlotPosition } from "@/lib/game-map";
import { formatKickoff } from "@/lib/my-starters";
import { DEFAULT_SCENE, MapScene, TERRAIN_LEVELS, buildMapScene, surfaceHeight } from "@/lib/map-perspective";
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

// The state lines' width; the border is stroked at twice this behind the
// land, so the half that shows matches them (see USOutline).
const LINE_WIDTH = 0.38;

// Game tag type size, in rem. Inconsolata is monospaced (every glyph is
// 0.5em wide), so a tag's size is known from its text alone — the stem
// layout needs every tag's size before anything is drawn.
const TAG_REM = 0.625;
const LINE_HEIGHT = 1.3;
const PAD_EM = 0.35;
const PAD_Y_EM = 0.12;
// Space between a stem and its tag.
const STEM_GAP_EM = 0.35;
// Which side of its stem every tag hangs on.
const TAG_SIDE: "left" | "right" = "left";
// How faded a tag at the map's far edge is; the nearest are fully opaque.
const FAR_OPACITY = 0.25;
// Room kept above the map for the tags of its northernmost sites — at
// least this much, more when the opening view's tags need it (narrow
// screens, where the Northeast's tags have to stack higher).
const MIN_HEADROOM_REM = 1.5;

/**
 * The tilted US (see map-perspective.ts) as real 3D terrain: a slab whose
 * side wall shows along the camera-facing coasts, and on it the country's
 * elevation in terraces — each band lifted to its altitude with its own
 * wall, its top tinted lighter the higher it sits — so the mountains stand
 * up off the plains. State borders and the raised parts of the national
 * border ride the terrain. The coast/national border at sea level is
 * stroked *behind* the land at double the state lines' width, so the land
 * covers its inner half and it only extends outward — never eating into
 * small coastal states. Colors are theme tokens — light lines on dark in
 * dark mode, inverted in light mode.
 */
function USOutline({ scene }: { scene: MapScene }) {
  return (
    <g strokeLinejoin="miter" strokeMiterlimit={4}>
      {scene.wallLayers.map((d, i) => (
        <path key={i} d={d} fill="var(--map-wall)" stroke="var(--map-wall)" strokeWidth={0.6} />
      ))}
      <path d={scene.outline} fill="none" stroke="var(--map-edge)" strokeWidth={LINE_WIDTH * 2} />
      <path d={scene.outline} fill="var(--map-land)" />
      {scene.terraces.map(({ walls, top }, band) => (
        <g key={band}>
          {walls.map((d, i) => (
            <path key={i} d={d} fill="var(--map-wall)" stroke="var(--map-wall)" strokeWidth={0.5} fillRule="evenodd" />
          ))}
          <path
            d={top}
            fill={`color-mix(in srgb, var(--map-peak) ${Math.round(((band + 1) / TERRAIN_LEVELS) * 100)}%, var(--map-land))`}
            stroke="var(--map-terrace-edge)"
            strokeWidth={LINE_WIDTH * 0.6}
            fillRule="evenodd"
          />
        </g>
      ))}
      <path d={scene.stateLines} fill="none" stroke="var(--map-state-line)" strokeWidth={LINE_WIDTH} />
      <path d={scene.raisedBorder} fill="none" stroke="var(--map-edge)" strokeWidth={LINE_WIDTH} />
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

/** The footprint beside a stem — gap plus tag — in px, from the tag's text (see TAG_REM). */
function tagSize(title: string, rootPx: number): { width: number; height: number } {
  const px = TAG_REM * rootPx;
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

/** Stem layout for every tag, in px from the map's top-left, for one camera view. */
function layoutTags(tags: Tag[], scene: MapScene, width: number, rootPx: number, minTop: number): PlacedLabel[] {
  const k = width / scene.view.width;
  return placeLabels(
    tags.map((t) => {
      const [x, y] = scene.project(t.pos[0], t.pos[1], t.ground);
      return { id: t.id, x: (x - scene.view.x) * k, y: (y - scene.view.y) * k, ...tagSize(t.title, rootPx) };
    }),
    { baseGap: 0.2 * rootPx, step: 0.1 * rootPx, tries: 140, margin: 1, minTop, side: TAG_SIDE }
  );
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
 * This week's games on the interactive US map. Each game site sends up a
 * thin vertical stem with the matchup on a high-contrast neutral tag hung
 * off its top, always on the same side of the stem (TAG_SIDE) however the
 * map is turned.
 * Stems are screen-vertical and sized in px, so tags stay upright and
 * readable at any angle; where tags would collide, the nearer one keeps the
 * shorter stem and the others rise above it (see placeLabels). Tapping a
 * tag opens a preview of that game's fantasy starters, yours and your
 * opponents'. Tags fade a little with distance from the camera, so depth
 * reads in them too. Games played abroad can't sit on the US outline, so
 * they rise from just south of the border below New Mexico.
 */
export function GameMap({ games, legend }: { games: MappedGame[]; legend: LeagueLegendEntry[] }) {
  const { camera, isDefault, reset, wasDrag, handlers } = useMapCamera();
  const scene = useMemo(() => buildMapScene(camera), [camera]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [measure, setMeasure] = useState<{ width: number; rootPx: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const legendByLeagueId = useMemo(() => new Map(legend.map((l) => [l.leagueId, l])), [legend]);

  // The tags are laid out in px, so track the map's rendered width (and the
  // fluid root font size, which changes with the viewport too).
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setMeasure({
        width: el.clientWidth,
        rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      })
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        return { id: entry.game.id, entry, pos, ground: surfaceHeight(pos[0], pos[1]), title: tagTitle(entry.game) };
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
    const byId = new Map(tags.map((t) => [t.id, t]));
    const layout = layoutTags(tags, scene, measure.width, measure.rootPx, -headroomPx);
    // Paint far tags first so nearer ones sit on top.
    return layout
      .map((l) => {
        const tag = byId.get(l.id)!;
        return { ...l, tag, opacity: 1 - (1 - FAR_OPACITY) * scene.depth(tag.pos[0], tag.pos[1]) };
      })
      .sort((a, b) => a.y - b.y);
  }, [measure, headroomPx, scene, tags]);

  const selectedTag = placed.find((p) => p.id === selected) ?? null;
  const headroom = headroomPx ?? 0;
  const mapHeight = measure ? (measure.width * scene.view.height) / scene.view.width : 0;
  const gap = 0.4 * (measure?.rootPx ?? 16);

  function handleTagClick(id: string) {
    // The click a drag ends with is just the end of turning the map.
    if (wasDrag()) return;
    setSelected((current) => (current === id ? null : id));
  }

  return (
    // Positions the preview card, which may spill past the map's clipped area.
    <div className="relative">
      {/* Tags may run past the map's own box — up into the headroom, and
          right up to the column's edge — but are cut off there: they never
          cover the page around the map or make it scroll sideways. */}
      <div className="w-full overflow-clip" style={{ paddingTop: headroomPx === null ? `${MIN_HEADROOM_REM}rem` : headroomPx }}>
        <div className="mx-auto w-full min-w-0 max-w-[44rem]">
          <div
            ref={mapRef}
            className="relative cursor-grab touch-none select-none outline-none [-webkit-touch-callout:none] active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-ink-muted"
            tabIndex={0}
            aria-label="US map. Drag to spin and tilt it, arrow keys to nudge, double-click or Home to reset the view."
            {...handlers}
          >
            <svg
              viewBox={scene.viewBox}
              preserveAspectRatio="xMidYMid meet"
              className="block w-full overflow-visible"
              role="img"
              aria-label={`${tags.length} games across the United States`}
            >
              <USOutline scene={scene} />
            </svg>

            <div className="pointer-events-none absolute inset-0">
              {placed.map(({ id, x, y, stem, tag, opacity: depthOpacity }) => {
                const opacity = selected === id ? 1 : depthOpacity;
                return (
                  <div key={id} className="group absolute left-0 top-0" style={{ transform: `translate(${x}px, ${y}px)` }}>
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
                        fontSize: `${TAG_REM}rem`,
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

            {isDefault ? null : (
              <button
                type="button"
                onClick={reset}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-0 z-10 border border-grid bg-page px-2 py-1 text-xs text-ink-secondary hover:text-ink-primary"
              >
                Reset view
              </button>
            )}
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
