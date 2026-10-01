"use client";

import { MouseEvent as ReactMouseEvent, RefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { computeKickoffSlots, gameMapPosition, internationalSlotPosition, kickoffSlotColor, kickoffSlotLabel } from "@/lib/game-map";
import { formatKickoff } from "@/lib/my-starters";
import {
  FLAT_MAP_HEIGHT,
  MAP_OUTLINE,
  MAP_STATE_LINES,
  MAP_VIEW,
  MAP_VIEWBOX,
  MAP_WALL_LAYERS,
  projectMapPoint,
} from "@/lib/map-perspective";
import { LeagueLegendEntry, LeagueMark } from "./LeagueMark";

/** One of your starters in a mapped game, enough to show on the click-to-preview card. */
export interface MappedStarter {
  playerId: string;
  name: string;
  leagueIds: string[];
}

export interface MappedGame {
  game: NFLGame;
  /** Your starters in this game — count drives dot size, names+leagues feed the preview card. */
  starters: MappedStarter[];
  /** Your current-week opponents' starters in this game, across every tracked league — shown alongside yours in the preview card, not counted toward dot size. */
  opponentStarters: MappedStarter[];
}

function dotRadius(starterCount: number): number {
  if (starterCount === 0) return 3.5;
  return Math.min(4.5 + starterCount * 1.6, 20);
}

// Game dots (and the kickoff legend/hover line that only make sense with
// them) are hidden while the map's new raised-slab look is reviewed on its
// own. Flip back to true to restore them.
const SHOW_GAME_DOTS = false;

/**
 * The tilted US (see map-perspective.ts): a raised slab whose side wall
 * shows along the south-facing coasts, grey land on top, faint state
 * borders, and the coast/national border as a line a little heavier than
 * them. The border is stroked *behind* the land at double width, so the
 * land covers its inner half and it only extends outward — it never eats
 * into small coastal states. Colors are theme tokens — white lines on black
 * in dark mode, inverted in light mode.
 */
function USOutline() {
  // The coast is smoothed but the state lines aren't, so a line's coastal end
  // can sit a hair outside the land — clip them to it.
  const clipId = useId();
  return (
    <g strokeLinejoin="round">
      <defs>
        <clipPath id={clipId}>
          <path d={MAP_OUTLINE} />
        </clipPath>
      </defs>
      {MAP_WALL_LAYERS.map((d, i) => (
        <path key={i} d={d} fill="var(--map-wall)" stroke="var(--map-wall)" strokeWidth={0.6} />
      ))}
      <path d={MAP_OUTLINE} fill="none" stroke="var(--map-edge)" strokeWidth={1.7} />
      <path d={MAP_OUTLINE} fill="var(--map-land)" />
      <path
        d={MAP_STATE_LINES}
        fill="none"
        stroke="var(--map-state-line)"
        strokeWidth={0.45}
        clipPath={`url(#${clipId})`}
      />
    </g>
  );
}

/** Away team first, "@" meaning "at" the home team — matching the game headers in the starters list below the map. */
function gameLabel(game: NFLGame): string {
  return `${game.awayTeam} @ ${game.homeTeam}`;
}

function venueLabel(game: NFLGame): string | null {
  if (!game.venue?.city) return null;
  return game.venue.state ? `${game.venue.city}, ${game.venue.state}` : game.venue.city;
}

interface PositionedGame {
  entry: MappedGame;
  x: number;
  y: number;
  /** The dot's actual drawn radius (before the small hover/active-state bump, which is cosmetic only) — also what click hit-testing uses, so "is this point inside the dot" always means the same thing whether or not the dot happens to be the one currently highlighted. */
  r: number;
}

/** Every positioned game whose dot geometrically contains (x, y) — not just whichever one the browser would hand a native click event to (the topmost in paint order), which is exactly the dot that's invisible/unclickable when two games fully overlap. */
function hitTest(positioned: PositionedGame[], x: number, y: number): PositionedGame[] {
  return positioned.filter((p) => Math.hypot(x - p.x, y - p.y) <= p.r);
}

/** Converts a pointer event's screen coordinates into this SVG's own viewBox coordinate space, accounting for however `preserveAspectRatio` and the element's on-page size have scaled it — the same coordinate space every dot's cx/cy/r is already defined in. */
function svgPointFromEvent(svg: SVGSVGElement, e: { clientX: number; clientY: number }): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
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
 * their name. Positioned to hug the clicked dot but opening toward the
 * map's center, so it never has to hang off the edge of the SVG.
 */
function GamePreviewCard({
  positioned,
  legendByLeagueId,
  onClose,
  cardRef,
}: {
  positioned: PositionedGame;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  onClose: () => void;
  cardRef: RefObject<HTMLDivElement | null>;
}) {
  const { entry, y } = positioned;
  // Horizontally the card always centers itself in the map — a fixed-width
  // card anchored at the exact click point can't fit either direction when
  // the dot is near the middle, and centering is what "pop up in the center
  // of the map" actually asks for. Vertically it still tracks the dot,
  // opening toward whichever half has room so it stays near what you clicked.
  const opensDown = y < MAP_VIEW.y + MAP_VIEW.height / 2;
  const summaryLine = [gameLabel(entry.game), formatKickoff(entry.game.kickoff), venueLabel(entry.game)]
    .filter(Boolean)
    .join(" · ");
  const hasAnyone = entry.starters.length > 0 || entry.opponentStarters.length > 0;

  return (
    <div
      ref={cardRef}
      className="absolute z-10 w-80 max-w-[calc(100%-1rem)] border border-grid bg-page p-3 text-xs shadow-sm"
      style={{
        left: "50%",
        top: `${((y - MAP_VIEW.y) / MAP_VIEW.height) * 100}%`,
        transform: `translate(-50%, ${opensDown ? "0.5rem" : "calc(-100% - 0.5rem)"})`,
      }}
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
 * This week's games plotted on the same US geometry the War Room's territory
 * map uses, sized by how many of your starters are in each and coloured by
 * kickoff window — a gradient from this week's earliest games to its latest,
 * so you can tell what time a game is at a glance, not just where. A game
 * with none of your starters is a hollow ring instead of a filled dot.
 * Anything played abroad can't sit on the US outline, so it gets its own
 * small dot cluster tucked in the corner instead — its position off the map
 * is the only signal it needs. Clicking a dot pins a small fantasy-focused
 * preview of that game near it.
 */
export function GameMap({ games, legend }: { games: MappedGame[]; legend: LeagueLegendEntry[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Tapping anywhere outside the open preview — elsewhere on the map, or
  // anywhere else on the page — dismisses it. A tap that lands on a dot is
  // left alone here (even though dots have no onClick of their own anymore —
  // see handleMapClick, which does its own hit-testing on the SVG's click
  // event instead of relying on which element the browser targeted); the
  // click handler decides on its own whether that opens, switches, or closes.
  useEffect(() => {
    if (!clicked) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (cardRef.current?.contains(target)) return;
      if (target?.closest("circle")) return;
      setClicked(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [clicked]);

  const legendByLeagueId = useMemo(() => new Map(legend.map((l) => [l.leagueId, l])), [legend]);

  const abroad: PositionedGame[] = games
    .filter((g) => isOutsideUS(g.game))
    .map((entry, i) => {
      const [x, y] = projectMapPoint(...internationalSlotPosition(i));
      return { entry, x, y, r: dotRadius(entry.starters.length) * 0.6 };
    });
  const plotted: PositionedGame[] = games
    .map((entry) => {
      const pos = gameMapPosition(entry.game);
      if (!pos) return null;
      const [x, y] = projectMapPoint(pos[0], pos[1]);
      return { entry, x, y, r: dotRadius(entry.starters.length) };
    })
    .filter((p): p is PositionedGame => p !== null)
    // Biggest last so a game you care about is never hidden under an empty one.
    .sort((a, b) => a.entry.starters.length - b.entry.starters.length);
  const allPositioned = [...abroad, ...plotted];

  const { slotIndexByGameId, slots } = useMemo(
    () => computeKickoffSlots(games.map((g) => g.game)),
    [games]
  );
  const colorFor = (gameId: string) =>
    kickoffSlotColor(slotIndexByGameId.get(gameId) ?? 0, slots.length || 1);

  const findPositioned = (id: string | null) => (id && allPositioned.find((p) => p.entry.game.id === id)) || null;
  const active = findPositioned(hovered);
  const selected = findPositioned(clicked);

  /**
   * Resolves a click to every dot actually under it (see hitTest) rather
   * than trusting which one the browser happened to dispatch the native
   * event to — that'd always be whichever dot paints on top, permanently
   * hiding anything fully behind it (two teams sharing a metro area, e.g.
   * both LA games sit on the exact same point). Clicking a spot with one
   * game under it just opens/toggles it as before. A spot with several
   * overlapping games opens the earliest-kickoff one first; clicking that
   * same overlapping spot again — including a click that starts a *new*
   * overlap set as long as the currently-open game is one of its members —
   * advances to the next game there in kickoff order, wrapping back to the
   * earliest after the last.
   */
  function handleMapClick(e: ReactMouseEvent<SVGSVGElement>) {
    const point = svgPointFromEvent(e.currentTarget, e);
    if (!point) return;
    const candidates = hitTest(allPositioned, point.x, point.y).sort(
      (a, b) => new Date(a.entry.game.kickoff).getTime() - new Date(b.entry.game.kickoff).getTime()
    );
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      toggleClicked(candidates[0].entry.game.id);
      return;
    }
    const currentIndex = candidates.findIndex((p) => p.entry.game.id === clicked);
    const next = currentIndex === -1 ? candidates[0] : candidates[(currentIndex + 1) % candidates.length];
    setClicked(next.entry.game.id);
  }

  const toggleClicked = (id: string) => setClicked((current) => (current === id ? null : id));

  return (
    <div className="mx-auto w-full min-w-0 max-w-[44rem]">
      <div className="relative">
        <svg
          viewBox={MAP_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full overflow-visible"
          role="img"
          aria-label={`${plotted.length} games plotted across the United States`}
          onClick={handleMapClick}
        >
          <USOutline />
          {SHOW_GAME_DOTS && slots.length > 1 ? (
            // Tucked into the bottom-left corner, empty of any team dot ever
            // since AK/HI were dropped from the outline — the kickoff-window
            // legend lives on the map itself now instead of a row underneath it.
            <g opacity={0.85}>
              {slots.map((slot, i) => {
                const rowH = 8;
                const bottomPad = 4;
                const flatY = FLAT_MAP_HEIGHT - bottomPad - (slots.length - 1 - i) * rowH;
                const [cx, cy] = projectMapPoint(9, flatY - 2, 0);
                const [tx, ty] = projectMapPoint(14, flatY, 0);
                return (
                  <g key={i}>
                    <circle cx={cx} cy={cy} r={2} fill={kickoffSlotColor(i, slots.length)} />
                    <text x={tx} y={ty} fontSize={6} fill="var(--ink-muted)">
                      {kickoffSlotLabel(slot.sortTime)}
                    </text>
                  </g>
                );
              })}
            </g>
          ) : null}
          {SHOW_GAME_DOTS && allPositioned.map(({ entry, x, y, r: baseR }) => {
            const isAbroad = isOutsideUS(entry.game);
            const isActive = entry.game.id === hovered || entry.game.id === clicked;
            const hasPlayers = entry.starters.length > 0;
            const r = baseR + (isActive ? 1.4 * (isAbroad ? 0.6 : 1) : 0);
            const color = colorFor(entry.game.id);
            return (
              <circle
                key={entry.game.id}
                cx={x}
                cy={y}
                r={r}
                fill={hasPlayers ? color : "none"}
                fillOpacity={hasPlayers ? (isActive ? 0.82 : 0.62) : undefined}
                stroke={hasPlayers ? "var(--surface-raised)" : color}
                strokeWidth={hasPlayers ? 0.5 : 1.2}
                strokeOpacity={hasPlayers ? undefined : isActive ? 0.9 : 0.65}
                className="cursor-pointer transition-[r,fill-opacity,stroke-opacity]"
                onMouseEnter={() => setHovered(entry.game.id)}
                onMouseLeave={() => setHovered((id) => (id === entry.game.id ? null : id))}
              >
                <title>
                  {`${gameLabel(entry.game)}${isAbroad ? " (outside the US)" : ""} — ${formatKickoff(entry.game.kickoff)}${
                    entry.starters.length ? ` — ${entry.starters.length} of your starters` : ""
                  }`}
                </title>
              </circle>
            );
          })}
        </svg>

        {selected ? (
          <GamePreviewCard
            positioned={selected}
            legendByLeagueId={legendByLeagueId}
            onClose={() => setClicked(null)}
            cardRef={cardRef}
          />
        ) : null}
      </div>

      {active ? (
        <p className="mt-1 text-xs text-ink-muted">
          {`${gameLabel(active.entry.game)} · ${active.entry.game.venue?.city ?? "—"} · ${
            active.entry.starters.length || "no"
          } of your starters`}
        </p>
      ) : null}
    </div>
  );
}
