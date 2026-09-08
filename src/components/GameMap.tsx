"use client";

import { useState } from "react";
import { NFLGame, isOutsideUS } from "@/lib/nfl-schedule";
import { gameMapPosition, internationalSlotPosition } from "@/lib/game-map";
import { formatKickoff } from "@/lib/my-starters";
import { US_MAP_VIEWBOX, US_OUTLINE_PATH, US_STATE_LINES_PATH } from "@/lib/warroom-team-cities";

export interface MappedGame {
  game: NFLGame;
  /** How many of your starters are in this game — drives dot size, same as the War Room's territory map. */
  playerCount: number;
}

function dotRadius(playerCount: number): number {
  if (playerCount === 0) return 2.5;
  return Math.min(3 + playerCount * 1.1, 8);
}

/** Away team first, matching the game headers in the starters list below the map. */
function gameLabel(game: NFLGame): string {
  return `${game.awayTeam} vs ${game.homeTeam}`;
}

/**
 * This week's games plotted on the same US geometry the War Room's territory
 * map uses, sized by how many of your starters are in each. Anything played
 * abroad can't sit on a US map, so it's listed alongside instead.
 */
export function GameMap({ games }: { games: MappedGame[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const abroad = games.filter((g) => isOutsideUS(g.game));
  const plotted = games
    .map((entry) => ({ ...entry, pos: gameMapPosition(entry.game) }))
    .filter((entry): entry is MappedGame & { pos: [number, number] } => entry.pos !== null)
    // Biggest last so a game you care about is never hidden under an empty one.
    .sort((a, b) => a.playerCount - b.playerCount);

  const active =
    plotted.find((entry) => entry.game.id === hovered) ??
    abroad.find((entry) => entry.game.id === hovered) ??
    null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="relative min-w-0 flex-1">
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
            const isActive = entry.game.id === hovered;
            const hasPlayers = entry.playerCount > 0;
            const [x, y] = internationalSlotPosition(i);
            return (
              <circle
                key={entry.game.id}
                cx={x}
                cy={y}
                r={dotRadius(entry.playerCount) * 0.6 + (isActive ? 1 : 0)}
                fill={hasPlayers ? "var(--series-2)" : "var(--ink-muted)"}
                fillOpacity={hasPlayers ? (isActive ? 1 : 0.85) : 0.45}
                stroke="var(--surface-raised)"
                strokeWidth="0.5"
                className="cursor-pointer transition-[r,fill-opacity]"
                onMouseEnter={() => setHovered(entry.game.id)}
                onMouseLeave={() => setHovered((id) => (id === entry.game.id ? null : id))}
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
            const isActive = entry.game.id === hovered;
            const hasPlayers = entry.playerCount > 0;
            return (
              <circle
                key={entry.game.id}
                cx={entry.pos[0]}
                cy={entry.pos[1]}
                r={dotRadius(entry.playerCount) + (isActive ? 1.4 : 0)}
                fill={hasPlayers ? "var(--series-1)" : "var(--ink-muted)"}
                fillOpacity={hasPlayers ? (isActive ? 1 : 0.85) : 0.45}
                stroke="var(--surface-raised)"
                strokeWidth="0.5"
                className="cursor-pointer transition-[r,fill-opacity]"
                onMouseEnter={() => setHovered(entry.game.id)}
                onMouseLeave={() => setHovered((id) => (id === entry.game.id ? null : id))}
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
        <p className="mt-1 text-xs text-ink-muted">
          {active
            ? `${gameLabel(active.game)} · ${active.game.venue?.city ?? "—"} · ${
                active.playerCount || "no"
              } of your starters`
            : "Bigger dot = more of your starters in that game."}
        </p>
      </div>

      {abroad.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-1 border border-grid bg-page p-3 sm:w-52">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Outside the US
          </span>
          {abroad.map(({ game, playerCount }) => (
            <div key={game.id} className="text-xs text-ink-secondary">
              <span className="font-medium text-ink-primary">{gameLabel(game)}</span>
              <span className="block text-ink-muted">
                {game.venue?.city ?? "—"}
                {game.venue?.country ? `, ${game.venue.country}` : ""}
                {playerCount ? ` · ${playerCount} starter${playerCount === 1 ? "" : "s"}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
