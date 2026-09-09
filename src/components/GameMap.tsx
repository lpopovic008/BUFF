"use client";

import { useMemo, useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { computeKickoffSlots, gameMapPosition, internationalSlotPosition, kickoffSlotColor, kickoffSlotLabel } from "@/lib/game-map";
import { formatKickoff } from "@/lib/my-starters";
import { US_MAP_VIEWBOX, US_OUTLINE_PATH, US_STATE_LINES_PATH } from "@/lib/warroom-team-cities";
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
}

const VIEWBOX_W = 320;
const VIEWBOX_H = 200;

function dotRadius(starterCount: number): number {
  if (starterCount === 0) return 3.5;
  return Math.min(4.5 + starterCount * 1.6, 20);
}

/** Away team first, matching the game headers in the starters list below the map. */
function gameLabel(game: NFLGame): string {
  return `${game.awayTeam} vs ${game.homeTeam}`;
}

function venueLabel(game: NFLGame): string | null {
  if (!game.venue?.city) return null;
  return game.venue.state ? `${game.venue.city}, ${game.venue.state}` : game.venue.city;
}

interface PositionedGame {
  entry: MappedGame;
  x: number;
  y: number;
}

/**
 * The click-to-preview card: one line up top with the matchup, kickoff, and
 * venue, then every one of your starters in that game on their own line with
 * the logo of every league they're started in right after their name.
 * Positioned to hug the clicked dot but opening toward the map's center, so
 * it never has to hang off the edge of the SVG.
 */
function GamePreviewCard({
  positioned,
  legendByLeagueId,
  onClose,
}: {
  positioned: PositionedGame;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  onClose: () => void;
}) {
  const { entry, y } = positioned;
  // Horizontally the card always centers itself in the map — a fixed-width
  // card anchored at the exact click point can't fit either direction when
  // the dot is near the middle, and centering is what "pop up in the center
  // of the map" actually asks for. Vertically it still tracks the dot,
  // opening toward whichever half has room so it stays near what you clicked.
  const opensDown = y < VIEWBOX_H / 2;
  const summaryLine = [gameLabel(entry.game), formatKickoff(entry.game.kickoff), venueLabel(entry.game)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="absolute z-10 w-60 max-w-[calc(100%-1rem)] border border-grid bg-page p-3 text-xs shadow-sm"
      style={{
        left: "50%",
        top: `${(y / VIEWBOX_H) * 100}%`,
        transform: `translate(-50%, ${opensDown ? "8px" : "calc(-100% - 8px)"})`,
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
      <div className="mt-2 flex flex-col gap-1">
        {entry.starters.length > 0 ? (
          entry.starters.map((starter) => (
            <div key={starter.playerId} className="flex items-center gap-1 text-ink-secondary">
              <span className="truncate">{starter.name}</span>
              <span className="flex shrink-0 items-center gap-0.5">
                {starter.leagueIds.map((id) => (
                  <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
                ))}
              </span>
            </div>
          ))
        ) : (
          <p className="text-ink-secondary">None of your starters are in this game.</p>
        )}
      </div>
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

  const legendByLeagueId = useMemo(() => new Map(legend.map((l) => [l.leagueId, l])), [legend]);

  const abroad: PositionedGame[] = games
    .filter((g) => isOutsideUS(g.game))
    .map((entry, i) => {
      const [x, y] = internationalSlotPosition(i);
      return { entry, x, y };
    });
  const plotted: PositionedGame[] = games
    .map((entry) => {
      const pos = gameMapPosition(entry.game);
      return pos ? { entry, x: pos[0], y: pos[1] } : null;
    })
    .filter((p): p is PositionedGame => p !== null)
    // Biggest last so a game you care about is never hidden under an empty one.
    .sort((a, b) => a.entry.starters.length - b.entry.starters.length);

  const { slotIndexByGameId, slots } = useMemo(
    () => computeKickoffSlots(games.map((g) => g.game)),
    [games]
  );
  const colorFor = (gameId: string) =>
    kickoffSlotColor(slotIndexByGameId.get(gameId) ?? 0, slots.length || 1);

  const findPositioned = (id: string | null) =>
    (id && ([...plotted, ...abroad].find((p) => p.entry.game.id === id))) || null;
  const active = findPositioned(hovered);
  const selected = findPositioned(clicked);

  const toggleClicked = (id: string) => setClicked((current) => (current === id ? null : id));

  return (
    <div className="min-w-0 px-3 sm:px-6">
      <div className="relative mx-auto w-full max-w-[560px]">
        <svg
          viewBox={US_MAP_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          // Capped so the map stays a glanceable strip rather than swallowing
          // the page — its 320x200 viewBox is otherwise ~700px tall at full width.
          className="block w-full"
          role="img"
          aria-label={`${plotted.length} games plotted across the United States`}
        >
          <path d={US_OUTLINE_PATH} fill="var(--surface)" stroke="var(--border)" strokeWidth="0.6" />
          <path d={US_STATE_LINES_PATH} fill="none" stroke="var(--grid-hairline)" strokeWidth="0.4" />
          {[...abroad, ...plotted].map(({ entry, x, y }) => {
            const isAbroad = isOutsideUS(entry.game);
            const isActive = entry.game.id === hovered || entry.game.id === clicked;
            const hasPlayers = entry.starters.length > 0;
            const scale = isAbroad ? 0.6 : 1;
            const r = dotRadius(entry.starters.length) * scale + (isActive ? 1.4 * scale : 0);
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
                onClick={() => toggleClicked(entry.game.id)}
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
          />
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 opacity-25 transition-opacity hover:opacity-90">
        <p className="text-[9px] text-ink-muted">
          {active
            ? `${gameLabel(active.entry.game)} · ${active.entry.game.venue?.city ?? "—"} · ${
                active.entry.starters.length || "no"
              } of your starters`
            : "Bigger dot = more of your starters in that game."}
        </p>

        {slots.length > 1 ? (
          <div className="flex items-center gap-1.5">
            {slots.map((slot, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: kickoffSlotColor(i, slots.length) }}
                />
                <span className="text-[9px] text-ink-muted">{kickoffSlotLabel(slot.sortTime)}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
