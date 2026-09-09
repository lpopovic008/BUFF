"use client";

import { useMemo, useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { computeKickoffSlots, gameMapPosition, internationalSlotPosition, kickoffSlotColor, kickoffSlotLabel } from "@/lib/game-map";
import { formatKickoff } from "@/lib/my-starters";
import { US_MAP_VIEWBOX, US_OUTLINE_PATH, US_STATE_LINES_PATH } from "@/lib/warroom-team-cities";

export interface MappedGame {
  game: NFLGame;
  /** How many of your starters are in this game — drives dot size, same as the War Room's territory map. */
  playerCount: number;
  /** Names of those starters, for the click-to-preview card. */
  starterNames: string[];
}

function dotRadius(playerCount: number): number {
  if (playerCount === 0) return 2.5;
  return Math.min(4 + playerCount * 1.8, 11);
}

/** Away team first, matching the game headers in the starters list below the map. */
function gameLabel(game: NFLGame): string {
  return `${game.awayTeam} vs ${game.homeTeam}`;
}

function venueLabel(game: NFLGame): string | null {
  if (!game.venue?.city) return null;
  return game.venue.state ? `${game.venue.city}, ${game.venue.state}` : game.venue.city;
}

/**
 * This week's games plotted on the same US geometry the War Room's territory
 * map uses, sized by how many of your starters are in each and coloured by
 * kickoff window — a gradient from this week's earliest games to its latest,
 * so you can tell what time a game is at a glance, not just where. Anything
 * played abroad can't sit on the US outline, so it gets its own small dot
 * cluster tucked in the corner instead — its position off the map is the
 * only signal it needs. Clicking a dot pins a small fantasy-focused preview
 * of that game below the map.
 */
export function GameMap({ games }: { games: MappedGame[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);

  const abroad = games.filter((g) => isOutsideUS(g.game));
  const plotted = games
    .map((entry) => ({ ...entry, pos: gameMapPosition(entry.game) }))
    .filter((entry): entry is MappedGame & { pos: [number, number] } => entry.pos !== null)
    // Biggest last so a game you care about is never hidden under an empty one.
    .sort((a, b) => a.playerCount - b.playerCount);

  const { slotIndexByGameId, slots } = useMemo(
    () => computeKickoffSlots(games.map((g) => g.game)),
    [games]
  );
  const colorFor = (gameId: string) =>
    kickoffSlotColor(slotIndexByGameId.get(gameId) ?? 0, slots.length || 1);

  const findGame = (id: string | null) =>
    (id && (plotted.find((entry) => entry.game.id === id) ?? abroad.find((entry) => entry.game.id === id))) ||
    null;
  const active = findGame(hovered);
  const selected = findGame(clicked);

  const toggleClicked = (id: string) => setClicked((current) => (current === id ? null : id));

  return (
    <div className="relative min-w-0 px-3 sm:px-6">
      <svg
        viewBox={US_MAP_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        // Capped so the map stays a glanceable strip rather than swallowing
        // the page — its 320x200 viewBox is otherwise ~700px tall at full width.
        className="mx-auto block w-full max-w-[560px]"
        role="img"
        aria-label={`${plotted.length} games plotted across the United States`}
      >
        <path d={US_OUTLINE_PATH} fill="var(--surface)" stroke="var(--border)" strokeWidth="0.6" />
        <path d={US_STATE_LINES_PATH} fill="none" stroke="var(--grid-hairline)" strokeWidth="0.4" />
        {abroad.map((entry, i) => {
          const isActive = entry.game.id === hovered || entry.game.id === clicked;
          const hasPlayers = entry.playerCount > 0;
          const [x, y] = internationalSlotPosition(i);
          return (
            <circle
              key={entry.game.id}
              cx={x}
              cy={y}
              r={dotRadius(entry.playerCount) * 0.6 + (isActive ? 1 : 0)}
              fill={colorFor(entry.game.id)}
              fillOpacity={hasPlayers ? (isActive ? 0.92 : 0.75) : isActive ? 0.65 : 0.45}
              stroke="var(--surface-raised)"
              strokeWidth="0.5"
              className="cursor-pointer transition-[r,fill-opacity]"
              onMouseEnter={() => setHovered(entry.game.id)}
              onMouseLeave={() => setHovered((id) => (id === entry.game.id ? null : id))}
              onClick={() => toggleClicked(entry.game.id)}
            >
              <title>
                {`${gameLabel(entry.game)} (outside the US) — ${formatKickoff(entry.game.kickoff)}${
                  entry.playerCount ? ` — ${entry.playerCount} of your starters` : ""
                }`}
              </title>
            </circle>
          );
        })}
        {plotted.map((entry) => {
          const isActive = entry.game.id === hovered || entry.game.id === clicked;
          const hasPlayers = entry.playerCount > 0;
          return (
            <circle
              key={entry.game.id}
              cx={entry.pos[0]}
              cy={entry.pos[1]}
              r={dotRadius(entry.playerCount) + (isActive ? 1.4 : 0)}
              fill={colorFor(entry.game.id)}
              fillOpacity={hasPlayers ? (isActive ? 0.92 : 0.75) : isActive ? 0.65 : 0.45}
              stroke="var(--surface-raised)"
              strokeWidth="0.5"
              className="cursor-pointer transition-[r,fill-opacity]"
              onMouseEnter={() => setHovered(entry.game.id)}
              onMouseLeave={() => setHovered((id) => (id === entry.game.id ? null : id))}
              onClick={() => toggleClicked(entry.game.id)}
            >
              <title>
                {`${gameLabel(entry.game)} — ${formatKickoff(entry.game.kickoff)}${
                  entry.playerCount ? ` — ${entry.playerCount} of your starters` : ""
                }`}
              </title>
            </circle>
          );
        })}
      </svg>

      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 opacity-25 transition-opacity hover:opacity-90">
        <p className="text-[9px] text-ink-muted">
          {active
            ? `${gameLabel(active.game)} · ${active.game.venue?.city ?? "—"} · ${
                active.playerCount || "no"
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

      {selected ? (
        <div className="mt-2 flex flex-col gap-1 border border-grid bg-page p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-ink-primary">
              {gameLabel(selected.game)}
              {isOutsideUS(selected.game) ? " (outside the US)" : ""}
            </span>
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setClicked(null)}
              className="shrink-0 text-ink-muted hover:text-ink-primary"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-ink-secondary">
            {formatKickoff(selected.game.kickoff)}
            {venueLabel(selected.game) ? ` · ${venueLabel(selected.game)}` : ""}
          </p>
          <p className="text-xs text-ink-secondary">
            {selected.playerCount > 0
              ? `Your starters: ${selected.starterNames.join(", ")}`
              : "None of your starters are in this game."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
