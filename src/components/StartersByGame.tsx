"use client";

import { formatGameHeader, GameStarters, groupGamesByTimeBlock, GroupedStarter } from "@/lib/my-starters";
import { leagueColor } from "@/lib/game-map";

export interface LeagueLegendEntry {
  leagueId: string;
  leagueName: string;
  /** Position in the tracked-league list — what picks the colour. */
  colorIndex: number;
}

function PlayerRow({
  player,
  legendByLeagueId,
}: {
  player: GroupedStarter;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
}) {
  const leagueNames = player.leagueIds
    .map((id) => legendByLeagueId.get(id)?.leagueName ?? id)
    .join(", ");
  return (
    <div className="flex flex-col px-2 py-1" title={`${player.name} — ${leagueNames}`}>
      <span className="break-words text-[11px] leading-tight text-ink-primary">{player.name}</span>
      <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-ink-muted">
        <span>{player.position}</span>
        <span>{player.team}</span>
      </span>
    </div>
  );
}

/**
 * Your whole week at a glance: every unique starter you have across your
 * leagues, filed under the NFL game they're playing in, grouped into columns
 * by kickoff window — one column per window (Wed night, Thu night, Sun noon,
 * ...), earliest first, swipeable on narrow screens where roughly three
 * columns fit at once. The legend doubles as a filter — click a league to
 * show only its starters.
 */
export function StartersByGame({
  games,
  notPlaying,
  legend,
  selectedLeagueIds,
  onToggleLeague,
}: {
  games: GameStarters[];
  notPlaying: GroupedStarter[];
  legend: LeagueLegendEntry[];
  selectedLeagueIds: Set<string>;
  onToggleLeague: (leagueId: string) => void;
}) {
  const legendByLeagueId = new Map(legend.map((l) => [l.leagueId, l]));
  const columns = groupGamesByTimeBlock(games);

  if (games.length === 0 && notPlaying.length === 0) {
    return <p className="text-sm text-ink-secondary">No starters set for this week yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {legend.map((league) => {
          const selected = selectedLeagueIds.has(league.leagueId);
          return (
            <button
              key={league.leagueId}
              type="button"
              onClick={() => onToggleLeague(league.leagueId)}
              aria-pressed={selected}
              className={`flex items-center gap-1.5 text-xs transition-opacity ${
                selected ? "text-ink-secondary" : "text-ink-muted opacity-40"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0"
                style={{ backgroundColor: leagueColor(league.colorIndex) }}
              />
              {league.leagueName}
            </button>
          );
        })}
      </div>

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {columns.map((column) => (
          <div key={column.label} className="flex w-[31%] shrink-0 snap-start flex-col gap-3 sm:w-[200px]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {column.label}
            </span>
            {column.games.map(({ game, players }) => (
              <div key={game.id} className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-primary">
                  {formatGameHeader(game)}
                </h3>
                <div className="flex flex-col gap-1">
                  {players.map((player) => (
                    <PlayerRow key={player.playerId} player={player} legendByLeagueId={legendByLeagueId} />
                  ))}
                </div>
              </div>
            ))}
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
              <PlayerRow key={player.playerId} player={player} legendByLeagueId={legendByLeagueId} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
