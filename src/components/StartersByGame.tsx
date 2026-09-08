"use client";

import { formatGameHeader, GameStarters, StarterEntry } from "@/lib/my-starters";
import { leagueColor, leagueTint } from "@/lib/game-map";

export interface LeagueLegendEntry {
  leagueId: string;
  leagueName: string;
  /** Position in the tracked-league list — what picks the colour. */
  colorIndex: number;
}

function PlayerRow({ player, colorIndex }: { player: StarterEntry; colorIndex: number }) {
  return (
    <div
      className="flex items-baseline gap-2 border-l-2 px-2 py-1"
      style={{ backgroundColor: leagueTint(colorIndex), borderLeftColor: leagueColor(colorIndex) }}
      title={`${player.name} — ${player.leagueName}`}
    >
      <span className="w-8 shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        {player.position}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-primary">{player.name}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-muted">{player.team}</span>
    </div>
  );
}

/**
 * Your whole week at a glance: every starter you have in every league, filed
 * under the NFL game they're playing in. Each player carries the colour of the
 * league they're started in, so overlapping rosters stay legible.
 */
export function StartersByGame({
  games,
  notPlaying,
  legend,
}: {
  games: GameStarters[];
  notPlaying: StarterEntry[];
  legend: LeagueLegendEntry[];
}) {
  const colorIndexFor = new Map(legend.map((l) => [l.leagueId, l.colorIndex]));

  if (games.length === 0 && notPlaying.length === 0) {
    return <p className="text-sm text-ink-secondary">No starters set for this week yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {legend.map((league) => (
          <span key={league.leagueId} className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <span
              className="h-2.5 w-2.5 shrink-0"
              style={{ backgroundColor: leagueColor(league.colorIndex) }}
            />
            {league.leagueName}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map(({ game, players }) => (
          <div key={game.id} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-primary">
              {formatGameHeader(game)}
            </h3>
            <div className="flex flex-col gap-1">
              {players.map((player) => (
                <PlayerRow
                  key={`${player.leagueId}-${player.playerId}`}
                  player={player}
                  colorIndex={colorIndexFor.get(player.leagueId) ?? 0}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {notPlaying.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-grid pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Not playing this week
          </h3>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {notPlaying.map((player) => (
              <PlayerRow
                key={`${player.leagueId}-${player.playerId}`}
                player={player}
                colorIndex={colorIndexFor.get(player.leagueId) ?? 0}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
