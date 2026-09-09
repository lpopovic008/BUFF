"use client";

import { useEffect, useRef, useState } from "react";
import { formatKickoff, formatTeamMatchup, GameStarters, groupGamesByTimeBlock, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { LeagueLegendEntry, LeagueMark } from "./LeagueMark";

export type { LeagueLegendEntry };

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
    <div className="flex flex-col py-0.5" title={`${player.name} — ${leagueNames}`}>
      <span className="break-words text-[11px] leading-tight text-ink-primary">{player.name}</span>
      <span className="flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-ink-muted">
        <span className={POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"}>{player.position}</span>
        <span>{player.team}</span>
        <span className="flex items-center gap-0.5">
          {player.leagueIds.map((id) => (
            <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-2.5 w-2.5" />
          ))}
        </span>
      </span>
    </div>
  );
}

/** Every game header the same shape: team abbreviations on their own line, kickoff time/day smaller and grey underneath — never sharing a line, however narrow the column. */
function GameHeader({ game }: { game: NFLGame }) {
  return (
    <h3 className="flex flex-col leading-tight">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-primary">
        {formatTeamMatchup(game)}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-ink-muted">{formatKickoff(game.kickoff)}</span>
    </h3>
  );
}

/**
 * Your whole week at a glance: every unique starter you have across your
 * leagues, filed under the NFL game they're playing in, grouped into columns
 * by kickoff window — one column per window (Wed night, Thu night, Sun noon,
 * ...), earliest first, swipeable on narrow screens where roughly three
 * columns fit at once. The legend doubles as a filter — click a league to
 * show only its starters — and stays visible even with every league
 * deselected, since it's the only way back to reselecting one.
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
  const nothingToShow = games.length === 0 && notPlaying.length === 0;

  // Centering an overflowing flex row makes the browser start the scroll
  // position mid-content instead of at the true first column — measuring
  // for real and only centering when the columns actually fit avoids that.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [centered, setCentered] = useState(false);
  // Mobile Safari's scroll-snap can pick an initial resting scroll position
  // that isn't 0 — sometimes calculated before the real (async-loaded) game
  // data has replaced the first paint's shorter list, leaving the row
  // scrolled part way in with the first column already cut off, snap or no
  // snap. Force it back to the true start whenever the actual set of
  // columns changes, rather than trusting the browser's own resting point.
  const columnsKey = columns.map((c) => `${c.label}:${c.games.map((g) => g.game.id).join(",")}`).join("|");
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    const measure = () => setCentered(el.scrollWidth <= el.clientWidth + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [columnsKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 sm:px-6">
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
              <LeagueMark league={league} className="h-2.5 w-2.5" />
              {league.leagueName}
            </button>
          );
        })}
      </div>

      {nothingToShow ? (
        <p className="px-3 text-sm text-ink-secondary sm:px-6">
          {legend.some((l) => selectedLeagueIds.has(l.leagueId)) || legend.length === 0
            ? "No starters set for this week yet."
            : "Every league is hidden — select one above to see its starters."}
        </p>
      ) : (
        <>
          <div
            ref={scrollerRef}
            className={`-mx-1 flex gap-1 overflow-x-auto px-2 pb-1 [scrollbar-width:none] sm:gap-2 sm:px-5 [&::-webkit-scrollbar]:hidden ${
              centered ? "justify-center" : "justify-start"
            }`}
          >
            {columns.map((column) => (
              <div key={column.label} className="flex w-[33.5%] shrink-0 flex-col gap-1.5 sm:w-[190px]">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  {column.label}
                </span>
                {column.games.map(({ game, players }) => (
                  <div key={game.id} className="flex flex-col gap-1 border border-grid p-1.5">
                    <GameHeader game={game} />
                    <div className="flex flex-col gap-0.5">
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
            <div className="flex flex-col gap-1.5 border-t border-grid px-3 pt-3 sm:px-6">
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
        </>
      )}
    </div>
  );
}
