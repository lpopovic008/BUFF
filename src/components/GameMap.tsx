"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, internationalSlotPosition } from "@/lib/game-map";
import { DEFAULT_SCENE, MapScene, buildMapScene } from "@/lib/map-perspective";
import { PlacedLabel, placeLabels } from "@/lib/map-labels";
import { useMapCamera } from "@/hooks/useMapCamera";

/** One of your starters in a mapped game. */
export interface MappedStarter {
  playerId: string;
  name: string;
  leagueIds: string[];
}

export interface MappedGame {
  game: NFLGame;
  /** Your starters in this game — listed under the game's tag. */
  starters: MappedStarter[];
  /** Your current-week opponents' starters in this game, across every tracked league. */
  opponentStarters: MappedStarter[];
}

// The state lines' width; the border is stroked at twice this behind the
// land, so the half that shows matches them (see USOutline).
const LINE_WIDTH = 0.38;

// Game tag type sizes, in rem. Inconsolata is monospaced (every glyph is
// 0.5em wide), so a tag's size is known from its text alone — the stem
// layout needs every tag's size before anything is drawn.
const TITLE_REM = 0.625;
const NAME_REM = 0.625;
const LINE_HEIGHT = 1.3;
const PAD_EM = 0.35;
const TITLE_PAD_Y_EM = 0.12;
// Room kept above the map for the tags of its northernmost sites — at
// least this much, more when the opening view's tags need it (narrow
// screens, where the Northeast's tags have to stack higher).
const MIN_HEADROOM_REM = 2.5;

/**
 * The tilted US (see map-perspective.ts): a raised slab whose side wall
 * shows along the camera-facing coasts, grey land on top, faint state
 * borders, and the coast/national border in a stronger color but the same
 * thickness as them. The border is stroked *behind* the land at double the
 * state lines' width, so the land covers its inner half and what shows
 * matches them — and only extends outward, never eating into small coastal
 * states. Colors are theme tokens — white lines on black
 * in dark mode, inverted in light mode.
 */
function USOutline({ scene }: { scene: MapScene }) {
  // Clip the state lines to the land so no coastal end pokes past the
  // border line.
  const clipId = useId();
  return (
    <g strokeLinejoin="miter" strokeMiterlimit={4}>
      <defs>
        <clipPath id={clipId}>
          <path d={scene.outline} />
        </clipPath>
      </defs>
      {scene.wallLayers.map((d, i) => (
        <path key={i} d={d} fill="var(--map-wall)" stroke="var(--map-wall)" strokeWidth={0.6} />
      ))}
      <path d={scene.outline} fill="none" stroke="var(--map-edge)" strokeWidth={LINE_WIDTH * 2} />
      <path d={scene.outline} fill="var(--map-land)" />
      <path
        d={scene.stateLines}
        fill="none"
        stroke="var(--map-state-line)"
        strokeWidth={LINE_WIDTH}
        clipPath={`url(#${clipId})`}
      />
    </g>
  );
}

/** Away team first, "@" meaning "at" the home team — matching the game headers in the starters list. Games abroad add their city, since their spot on the map is just a holding corner. */
function tagTitle(game: NFLGame): string {
  const title = `${game.awayTeam} @ ${game.homeTeam}`;
  return isOutsideUS(game) && game.venue?.city ? `${title} · ${game.venue.city}` : title;
}

/** A tag's size in px, from its text (see TITLE_REM). */
function tagSize(title: string, names: string[], rootPx: number): { width: number; height: number } {
  const titlePx = TITLE_REM * rootPx;
  const namePx = NAME_REM * rootPx;
  const titleW = (title.length * 0.5 + PAD_EM * 2) * titlePx;
  const titleH = (LINE_HEIGHT + TITLE_PAD_Y_EM * 2) * titlePx;
  const namesW = names.length ? (Math.max(...names.map((n) => n.length)) * 0.5 + PAD_EM * 2) * namePx : 0;
  const namesH = names.length * LINE_HEIGHT * namePx;
  return { width: Math.ceil(Math.max(titleW, namesW)) + 2, height: Math.ceil(titleH + namesH) + 2 };
}

interface Tag {
  id: string;
  pos: [number, number];
  title: string;
  names: string[];
}

/** Stem layout for every tag, in px from the map's top-left, for one camera view. */
function layoutTags(tags: Tag[], scene: MapScene, width: number, rootPx: number, minTop: number): PlacedLabel[] {
  const k = width / scene.view.width;
  return placeLabels(
    tags.map((t) => {
      const [x, y] = scene.project(t.pos[0], t.pos[1]);
      return { id: t.id, x: (x - scene.view.x) * k, y: (y - scene.view.y) * k, ...tagSize(t.title, t.names, rootPx) };
    }),
    { baseGap: 0.4 * rootPx, step: 0.35 * rootPx, tries: 40, margin: 2, minTop }
  );
}

/**
 * This week's games on the interactive US map. Each game site sends up a
 * thin vertical stem with a tag hung off its top, always to the right of
 * the stem however the map is turned: the matchup on a fixed high-contrast
 * plate, and your starters in that game listed under it. Stems are screen-
 * vertical and sized in px, so tags stay upright and readable at any angle;
 * where tags would collide, the nearer one keeps the shorter stem and the
 * others rise above it (see placeLabels). Games played abroad can't sit on
 * the US outline, so they rise from a holding corner off the Northeast.
 */
export function GameMap({ games }: { games: MappedGame[] }) {
  const { camera, isDefault, reset, handlers } = useMapCamera();
  const scene = useMemo(() => buildMapScene(camera), [camera]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [measure, setMeasure] = useState<{ width: number; rootPx: number } | null>(null);

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

  const tags = useMemo(() => {
    let abroadIndex = 0;
    return games
      .map((entry): Tag | null => {
        const pos = isOutsideUS(entry.game) ? internationalSlotPosition(abroadIndex++) : gameMapPosition(entry.game);
        if (!pos) return null;
        return { id: entry.game.id, pos, title: tagTitle(entry.game), names: entry.starters.map((s) => s.name) };
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
    return layout.map((l) => ({ ...l, tag: byId.get(l.id)! })).sort((a, b) => a.y - b.y);
  }, [measure, headroomPx, scene, tags]);

  return (
    // Tags may run past the map's own box — up into the headroom, and right
    // up to the column's edge — but are cut off there: they never cover the
    // page around the map or make it scroll sideways.
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
            {placed.map(({ id, x, y, stem, tag }) => (
              <div key={id} className="absolute left-0 top-0" style={{ transform: `translate(${x}px, ${y}px)` }}>
                <span
                  className="absolute -left-[0.15rem] -top-[0.15rem] h-[0.3rem] w-[0.3rem] rounded-full bg-[var(--map-tag)]"
                  aria-hidden
                />
                <span className="absolute left-0 w-px bg-[var(--map-edge)]" style={{ top: -stem, height: stem }} aria-hidden />
                <div className="absolute left-0 whitespace-nowrap" style={{ top: -stem, lineHeight: LINE_HEIGHT }}>
                  <div
                    className="w-fit bg-[var(--map-tag)] font-bold text-[var(--map-tag-ink)]"
                    style={{ fontSize: `${TITLE_REM}rem`, padding: `${TITLE_PAD_Y_EM}em ${PAD_EM}em` }}
                  >
                    {tag.title}
                  </div>
                  {tag.names.map((name) => (
                    <div
                      key={name}
                      className="font-medium text-ink-primary [text-shadow:0_0_2px_var(--page),0_0_4px_var(--page)]"
                      style={{ fontSize: `${NAME_REM}rem`, paddingLeft: `${PAD_EM}em` }}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
  );
}
