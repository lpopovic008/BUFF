"use client";

import { useEffect, useMemo, useState } from "react";
import { formatKickoffTime, GameStarters, groupGamesByTimeBlock, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { teamTint } from "@/lib/nfl-team-colors";
import { LeagueLegendEntry, LeagueMark } from "./LeagueMark";

export type { LeagueLegendEntry };

function formatPoints(points: number): string {
  return points.toFixed(2);
}

/**
 * A starter's row: position, name, the logo of every league they're started
 * in, then their live fantasy points pinned to the right edge. Points use the
 * first league's scoring; when the player's leagues score them differently,
 * the tooltip lists each league's number. Before kickoff (or for a player
 * with no game this week) the points slot holds a dash, keeping every row's
 * logos lined up.
 */
function PlayerRow({
  player,
  legendByLeagueId,
  started,
}: {
  player: GroupedStarter;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Whether this player's game has kicked off — before that, 0 points is just "not yet". */
  started: boolean;
}) {
  const perLeague = player.leagueIds.map((id) => ({
    name: legendByLeagueId.get(id)?.leagueName ?? id,
    points: player.pointsByLeague[id] ?? null,
  }));
  const scoredDifferently = new Set(perLeague.map((l) => l.points)).size > 1;
  const showPoints = started && player.points !== null;
  const title = `${player.name} — ${perLeague
    .map((l) => (started && scoredDifferently && l.points !== null ? `${l.name}: ${formatPoints(l.points)}` : l.name))
    .join(", ")}`;
  return (
    <div className="flex items-center gap-1.5 py-0.5" title={title}>
      <span
        className={`w-[2.4em] shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide ${
          POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"
        }`}
      >
        {player.position}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] leading-snug text-ink-primary">{player.name}</span>
      <span className="flex shrink-0 items-center gap-0.5">
        {player.leagueIds.map((id) => (
          <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
        ))}
      </span>
      <span
        className={`w-[3.4em] shrink-0 text-right text-[0.8125rem] tabular-nums ${
          showPoints ? "font-semibold text-ink-primary" : "text-ink-muted"
        }`}
      >
        {showPoints ? formatPoints(player.points!) : "–"}
      </span>
    </div>
  );
}

/** A game's header: matchup title on the left with each team's own colour soft-highlighting its half, kickoff time pinned to the right edge on the same line — no boxed outline, no weekday (the column header above already states the day). Text stays the standard ink colour rather than the team's own hex, since some teams' brand colours (navy, black) read fine as a soft background tint but lose all contrast as literal text in dark mode. */
function GameHeader({ game }: { game: NFLGame }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="flex items-baseline gap-1 text-sm font-semibold uppercase tracking-wide text-ink-primary">
        <span className="px-1" style={{ backgroundColor: teamTint(game.awayTeam) }}>
          {game.awayTeam}
        </span>
        <span className="text-ink-muted">@</span>
        <span className="px-1" style={{ backgroundColor: teamTint(game.homeTeam) }}>
          {game.homeTeam}
        </span>
      </h3>
      <span className="shrink-0 text-xs uppercase tracking-wide text-ink-muted">
        {formatKickoffTime(game.kickoff)}
      </span>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Always plain hours:minutes:seconds — no day rollover, even a week out. */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** The earliest kickoff among these games, in ms — null when none has a usable time. */
function earliestKickoff(games: GameStarters[]): number | null {
  let next: number | null = null;
  for (const { game } of games) {
    const t = new Date(game.kickoff).getTime();
    if (Number.isNaN(t)) continue;
    if (next === null || t < next) next = t;
  }
  return next;
}

/**
 * One shared once-a-second clock for every countdown in the list. Starts at
 * null (matching SSR) and only picks up a real clock reading once the first
 * interval tick fires post-mount, rather than reading Date.now()
 * synchronously during the effect itself.
 */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** A live-ticking countdown to the next kickoff among your games this week — the next time block about to go live. Renders nothing once every game has already kicked off. */
function NextKickoffClock({ games, now }: { games: GameStarters[]; now: number | null }) {
  const target = useMemo(() => {
    if (now === null) return null;
    // The next kickoff still ahead — the earliest overall may already be underway.
    return earliestKickoff(games.filter(({ game }) => new Date(game.kickoff).getTime() > now));
  }, [games, now]);

  if (target === null || now === null) return null;
  const remaining = target - now;
  if (remaining <= 0) return null;

  return (
    <div className="flex flex-col items-center gap-0.5 border-b border-grid pb-3 text-center">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next kickoff</span>
      <span className="text-3xl font-bold tabular-nums text-ink-primary">{formatCountdown(remaining)}</span>
    </div>
  );
}

/**
 * A time block's own clock, pinned to the right of its header: a countdown
 * to the block's first kickoff, then "Live" once it's underway and "Final"
 * when every game in it has ended.
 */
function BlockClock({ games, now }: { games: GameStarters[]; now: number | null }) {
  const start = earliestKickoff(games);
  if (now === null || start === null) return null;
  if (games.every(({ game }) => game.state === "post")) {
    return <span className="shrink-0 tabular-nums text-ink-muted">Final</span>;
  }
  if (now < start && games.every(({ game }) => game.state === "pre")) {
    return <span className="shrink-0 tabular-nums">{formatCountdown(start - now)}</span>;
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-status-critical">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-critical" aria-hidden />
      Live
    </span>
  );
}

/**
 * Your whole week at a glance: every unique starter you have across your
 * leagues, filed under the NFL game they're playing in, grouped into
 * sections by kickoff window (Wed night, Thu night, Sun noon, ...) stacked
 * one under another — a single continuous column, meant to run alongside
 * the rest of the dashboard rather than take over the page width. The
 * legend doubles as a filter — click a league to show only its starters —
 * and stays visible even with every league deselected, since it's the only
 * way back to reselecting one.
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
  const now = useNow();

  return (
    <div className="flex flex-col gap-4">
      <NextKickoffClock games={games} now={now} />

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {legend.map((league) => {
          const selected = selectedLeagueIds.has(league.leagueId);
          return (
            <button
              key={league.leagueId}
              type="button"
              onClick={() => onToggleLeague(league.leagueId)}
              aria-pressed={selected}
              className={`flex items-center gap-1.5 text-[0.8125rem] transition-opacity ${
                selected ? "text-ink-secondary" : "text-ink-muted opacity-40"
              }`}
            >
              <LeagueMark league={league} className="h-3 w-3" />
              <span className="text-balance text-left">{league.leagueName}</span>
            </button>
          );
        })}
      </div>

      {nothingToShow ? (
        <p className="text-sm text-ink-secondary">
          {legend.some((l) => selectedLeagueIds.has(l.leagueId)) || legend.length === 0
            ? "No starters set for this week yet."
            : "Every league is hidden — select one above to see its starters."}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {columns.map((column) => (
              <div key={column.label} className="flex flex-col gap-2">
                <div
                  className="flex items-baseline justify-between gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-primary"
                  style={{
                    backgroundColor: column.color
                      ? `color-mix(in srgb, ${column.color} 18%, transparent)`
                      : undefined,
                  }}
                >
                  <span className="min-w-0 truncate">{column.label}</span>
                  <BlockClock games={column.games} now={now} />
                </div>
                <div className="flex flex-col gap-3">
                  {column.games.map(({ game, players }) => (
                    <div key={game.id} className="flex flex-col gap-1">
                      <GameHeader game={game} />
                      <div className="flex flex-col gap-0.5">
                        {players.map((player) => (
                          <PlayerRow
                            key={player.playerId}
                            player={player}
                            legendByLeagueId={legendByLeagueId}
                            started={game.state !== "pre"}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {notPlaying.length > 0 ? (
            <div className="flex flex-col gap-1.5 border-t border-grid pt-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Not playing this week
              </h3>
              <div className="grid grid-cols-1 gap-1">
                {notPlaying.map((player) => (
                  <PlayerRow key={player.playerId} player={player} legendByLeagueId={legendByLeagueId} started={false} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
