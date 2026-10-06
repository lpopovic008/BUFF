"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatCountdown } from "@/lib/format";
import { TYPE_MS_PER_CHAR, totalChars, typedSlices, useSeenOnce, useTypedCount } from "@/hooks/useTyped";
import { setHeaderKickoff } from "@/lib/header-clock";
import { formatKickoffTime, GameStarters, finishedBlocksLast, groupGamesByTimeBlock, GroupedStarter, PlayerSide } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { nflLogoMaxWidth, nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import { LeagueLegendEntry, LeagueMark } from "./LeagueMark";

export type { LeagueLegendEntry };

function formatPoints(points: number): string {
  return points.toFixed(2);
}

// A change in points plays out in two beats: the play's points fly into the
// number (CHIP_MS), then the number counts up to its new total (COUNT_MS).
// Only after both does the player move to their new place in the game.
const CHIP_MS = 650;
const COUNT_MS = 450;
const REORDER_DELAY_MS = CHIP_MS + COUNT_MS + 100;

/**
 * A player's points that animate whenever they change: the difference pops
 * in beside the number as "+7.40" and flies into it, then the number counts
 * from the old total to the new one with a little bump, while the row
 * flashes in the side's color.
 */
function AnimatedPoints({
  value,
  colorClass,
  flash,
  rowRef,
}: {
  value: number;
  colorClass: string;
  /** The side's color, which the row flashes while the points land. */
  flash: string;
  rowRef: React.RefObject<HTMLElement | null>;
}) {
  const [shown, setShown] = useState(value);
  const [change, setChange] = useState<{ delta: number; key: number } | null>(null);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (value === start) return;
    from.current = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => setShown(value));
      return;
    }
    queueMicrotask(() => setChange({ delta: Math.round((value - start) * 100) / 100, key: performance.now() }));
    rowRef.current?.animate(
      [{ backgroundColor: `color-mix(in srgb, ${flash} 28%, transparent)` }, { backgroundColor: "transparent" }],
      { duration: REORDER_DELAY_MS, easing: "ease-out" }
    );
    let raf = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - began - CHIP_MS) / COUNT_MS));
      const eased = 1 - (1 - t) ** 3;
      setShown(t >= 1 ? value : start + (value - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, flash, rowRef]);

  return (
    <span className="relative inline-block">
      {change ? (
        <span
          key={change.key}
          aria-hidden
          className={`pointer-events-none absolute right-full top-0 whitespace-nowrap font-bold opacity-0 animate-[pts-chip_650ms_ease-in_forwards] ${colorClass}`}
        >
          {change.delta > 0 ? "+" : ""}
          {formatPoints(change.delta)}
        </span>
      ) : null}
      <span
        key={change?.key ?? "steady"}
        className={`relative inline-block origin-right ${change ? "animate-[pts-bump_450ms_ease-out_650ms_both]" : ""}`}
      >
        {formatPoints(shown)}
      </span>
    </span>
  );
}

// Whose player it is, by the color of their points: yours green, the ones you're facing red.
const SIDE_POINTS_COLOR: Record<PlayerSide, string> = {
  mine: "font-semibold text-status-good",
  opponent: "font-semibold text-status-critical",
  other: "text-ink-primary",
};
const SIDE_FLASH: Record<PlayerSide, string> = {
  mine: "var(--status-good)",
  opponent: "var(--status-critical)",
  other: "var(--ink-muted)",
};

/**
 * A player's row: position, name, the logo of every league they're started
 * in, then their live fantasy points pinned to the right edge — green for
 * your starters, red for the ones you're facing. Points use the first
 * league's scoring; when the player's leagues score them differently, the
 * tooltip lists each league's number. Before kickoff (or for a player with
 * no game this week) the points slot holds a dash, keeping every row's logos
 * lined up.
 */
/** A player row's text, in typing order: position, name, points. */
function playerPieces(player: GroupedStarter, started: boolean): string[] {
  const showPoints = started && player.points !== null;
  return [player.position, player.name, showPoints ? formatPoints(player.points!) : "–"];
}

function PlayerRow({
  player,
  legendByLeagueId,
  started,
  shown = true,
}: {
  player: GroupedStarter;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Whether this player's game has kicked off — before that, 0 points is just "not yet". */
  started: boolean;
  /** False while its time block is switched off: the row deletes itself back to nothing. */
  shown?: boolean;
}) {
  // Types itself out the first time it scrolls into view; deletes itself when hidden.
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeenOnce(ref);
  const pieces = playerPieces(player, started);
  const total = totalChars(pieces);
  const count = useTypedCount(shown && seen ? total : 0);
  const [position, name, points] = typedSlices(pieces, count);
  // Once typed in, the points stop being typed text and animate as they change instead.
  const [typedIn, setTypedIn] = useState(false);
  if (shown && seen && count >= total && !typedIn) setTypedIn(true);
  if (!shown && typedIn) setTypedIn(false);
  const perLeague = player.leagueIds.map((id) => ({
    name: legendByLeagueId.get(id)?.leagueName ?? id,
    points: player.pointsByLeague[id] ?? null,
  }));
  const scoredDifferently = new Set(perLeague.map((l) => l.points)).size > 1;
  const showPoints = started && player.points !== null;
  const title =
    perLeague.length === 0
      ? player.name
      : `${player.name} — ${perLeague
          .map((l) => (started && scoredDifferently && l.points !== null ? `${l.name}: ${formatPoints(l.points)}` : l.name))
          .join(", ")}`;
  return (
    <div ref={ref} className="flex items-center gap-1.5 leading-tight" title={title}>
      <span
        className={`w-[2.4em] shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide ${
          POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"
        }`}
      >
        {position}
      </span>
      {/* A zero-width space holds the row's full height before any letter is typed. */}
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-primary">{name || "\u200b"}</span>
      {/* The league logos show once the row is fully typed out. */}
      <span className={`flex shrink-0 items-center gap-0.5 transition-opacity duration-150 ${count >= total || typedIn ? "" : "opacity-0"}`}>
        {player.leagueIds.map((id) => (
          <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
        ))}
      </span>
      <span
        className={`w-[3.4em] shrink-0 text-right text-[0.8125rem] tabular-nums ${
          showPoints ? SIDE_POINTS_COLOR[player.side ?? "mine"] : "text-ink-muted"
        }`}
      >
        {typedIn && showPoints ? (
          <AnimatedPoints
            value={player.points!}
            colorClass={SIDE_POINTS_COLOR[player.side ?? "mine"]}
            flash={SIDE_FLASH[player.side ?? "mine"]}
            rowRef={ref}
          />
        ) : (
          points
        )}
      </span>
    </div>
  );
}

/** A game's header: matchup title on the left with each team's own colour soft-highlighting its half, kickoff time pinned to the right edge on the same line — no boxed outline, no weekday (the column header above already states the day). Text stays the standard ink colour rather than the team's own hex, since some teams' brand colours (navy, black) read fine as a soft background tint but lose all contrast as literal text in dark mode. */
/** A game header's text, in typing order: "vs", then the kickoff time. */
function headerPieces(game: NFLGame): string[] {
  return ["vs", formatKickoffTime(game.kickoff)];
}

// Every logo covers about the area of a square this many px on a side.
const LOGO_SIDE = 20;
// Each logo sits centered in a slot this wide, so every game's "vs" lands in the same column.
const LOGO_SLOT = Math.ceil(nflLogoMaxWidth(LOGO_SIDE));

/**
 * A team's official logo, in its own colors, fading in once its header
 * starts typing. Falls back to the team's abbreviation if there's no logo
 * for it.
 */
function TeamLogo({ team, visible }: { team: string; visible: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={`text-xs font-semibold uppercase text-ink-primary transition-opacity duration-150 ${visible ? "" : "opacity-0"}`}>
        {team}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export; nothing for next/image to optimize
    <img
      onError={() => setFailed(true)}
      src={nflLogoUrl(team)}
      alt={team}
      title={team}
      loading="lazy"
      draggable={false}
      {...nflLogoSize(team, LOGO_SIDE)}
      className={`shrink-0 object-contain transition-opacity duration-150 ${visible ? "" : "opacity-0"}`}
    />
  );
}

/**
 * A game's header: the two teams' logos — away, "vs", home — on the left,
 * each logo centered in a slot as wide as the widest logo, so every game's
 * "vs" lines up in one column down the list; kickoff time pinned to the
 * right edge (no weekday; the block's bar above already states the day). Types itself in the first time it scrolls into
 * view, and deletes itself when its block is switched off.
 */
function GameHeader({ game, shown = true }: { game: NFLGame; shown?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeenOnce(ref);
  const pieces = headerPieces(game);
  const count = useTypedCount(shown && seen ? totalChars(pieces) : 0);
  const [vs, time] = typedSlices(pieces, count);
  return (
    <div ref={ref} className="flex min-h-[1.25rem] items-center justify-between gap-2">
      <h3
        className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-muted"
        aria-label={`${game.awayTeam} at ${game.homeTeam}`}
      >
        <span className="flex shrink-0 justify-center" style={{ width: LOGO_SLOT }}>
          <TeamLogo team={game.awayTeam} visible={count > 0} />
        </span>
        <span aria-hidden className="w-[2ch] text-center">
          {vs}
        </span>
        <span className="flex shrink-0 justify-center" style={{ width: LOGO_SLOT }}>
          <TeamLogo team={game.homeTeam} visible={count >= 2} />
        </span>
      </h3>
      <span className="shrink-0 text-xs uppercase tracking-wide text-ink-muted">{time}</span>
    </div>
  );
}

/**
 * A game's player rows, in the order they're handed — except that when only
 * the order changes (someone's points passed someone else's), the rows hold
 * their places until the points have finished landing, then slide to their
 * new ones. A player coming or going reorders at once.
 */
function GameRows({ players, render }: { players: GroupedStarter[]; render: (player: GroupedStarter) => React.ReactNode }) {
  const order = players.map((p) => p.playerId).join("|");
  const [shownOrder, setShownOrder] = useState(order);
  const sameMembers = (a: string, b: string) => a.split("|").sort().join("|") === b.split("|").sort().join("|");
  if (order !== shownOrder && !sameMembers(order, shownOrder)) setShownOrder(order);

  useEffect(() => {
    if (order === shownOrder) return;
    const id = setTimeout(() => setShownOrder(order), REORDER_DELAY_MS);
    return () => clearTimeout(id);
  }, [order, shownOrder]);

  // FLIP: each row starts where it was and slides to where it now is.
  const listRef = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<string, number>());
  const lastOrder = useRef(shownOrder);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const listTop = list.getBoundingClientRect().top;
    const rows = [...list.children] as HTMLElement[];
    const next = new Map(rows.map((row) => [row.dataset.playerId ?? "", row.getBoundingClientRect().top - listTop]));
    const reordered = lastOrder.current !== shownOrder;
    lastOrder.current = shownOrder;
    const prev = tops.current;
    tops.current = next;
    if (!reordered || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const row of rows) {
      const before = prev.get(row.dataset.playerId ?? "");
      const after = next.get(row.dataset.playerId ?? "");
      if (before === undefined || after === undefined || before === after) continue;
      row.style.transition = "none";
      row.style.transform = `translateY(${before - after}px)`;
      // Whoever moves up passes over the rows they overtake.
      if (before > after) {
        row.style.zIndex = "1";
        row.style.background = "var(--page)";
      }
      void row.offsetHeight;
      requestAnimationFrame(() => {
        row.style.transition = "transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        row.style.transform = "";
        row.addEventListener(
          "transitionend",
          () => {
            row.style.zIndex = "";
            row.style.background = "";
          },
          { once: true }
        );
      });
    }
  });

  const byId = new Map(players.map((p) => [p.playerId, p]));
  const inOrder = shownOrder
    .split("|")
    .map((id) => byId.get(id))
    .filter((p): p is GroupedStarter => !!p);
  return (
    <div ref={listRef} className="flex flex-col">
      {inOrder.map((player) => (
        <div key={player.playerId} data-player-id={player.playerId} className="relative">
          {render(player)}
        </div>
      ))}
    </div>
  );
}

/**
 * A kickoff window's games, collapsing when its block is switched off: every
 * line deletes itself, letter by letter, then the block folds shut. Switched
 * back on, it opens and the lines type themselves back in.
 */
function BlockGames({
  games,
  hidden,
  legendByLeagueId,
}: {
  games: GameStarters[];
  hidden: boolean;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
}) {
  // Folded only once the deleting has finished — the longest line sets how long.
  const [prevHidden, setPrevHidden] = useState(hidden);
  const [folded, setFolded] = useState(hidden);
  if (hidden !== prevHidden) {
    setPrevHidden(hidden);
    setFolded(false);
  }
  const longest = Math.max(
    0,
    ...games.flatMap(({ game, players }) => [
      totalChars(headerPieces(game)),
      ...players.map((p) => totalChars(playerPieces(p, game.state !== "pre"))),
    ])
  );
  useEffect(() => {
    if (!hidden || folded) return;
    const id = setTimeout(() => setFolded(true), longest * TYPE_MS_PER_CHAR + 60);
    return () => clearTimeout(id);
  }, [hidden, folded, longest]);
  const collapsed = hidden && folded;

  return (
    // Folding animates the row height from its content's down to nothing.
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      aria-hidden={collapsed || undefined}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex flex-col gap-3 pt-2">
          {games.map(({ game, players }) => (
            // A line down the indent beside each game, from its header
            // through its last player; the gap between games breaks it.
            <div key={game.id} className="ml-1 flex flex-col gap-1 border-l border-ink-muted/50 pl-2">
              <GameHeader game={game} shown={!hidden} />
              <GameRows
                players={players}
                render={(player) => (
                  <PlayerRow
                    player={player}
                    legendByLeagueId={legendByLeagueId}
                    started={game.state !== "pre"}
                    shown={!hidden}
                  />
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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

/**
 * Hands the clock's countdown up to the page header whenever the clock
 * itself is out of sight — scrolled up under the sticky header or past the
 * top of its column — and takes it back once it's showing again.
 */
function useHeaderWhenHidden(ref: React.RefObject<HTMLElement | null>, target: number | null) {
  const [hidden, setHidden] = useState(false);
  // The clock only renders while there's a kickoff ahead; observe it once it does.
  const showing = target !== null;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const headerPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => setHidden(!entry.isIntersecting && entry.boundingClientRect.top < window.innerHeight / 2),
      { rootMargin: `-${headerPx}px 0px 0px 0px` }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, showing]);
  useEffect(() => {
    setHeaderKickoff(hidden ? target : null);
  }, [hidden, target]);
  useEffect(() => () => setHeaderKickoff(null), []);
}

/** A live-ticking countdown to the next kickoff among your games this week — the next time block about to go live. Renders nothing once every game has already kicked off. */
function NextKickoffClock({ games, now }: { games: GameStarters[]; now: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const target = useMemo(() => {
    if (now === null) return null;
    // The next kickoff still ahead — the earliest overall may already be underway.
    return earliestKickoff(games.filter(({ game }) => new Date(game.kickoff).getTime() > now));
  }, [games, now]);
  useHeaderWhenHidden(ref, target);

  if (target === null || now === null) return null;
  const remaining = target - now;
  if (remaining <= 0) return null;

  return (
    <div ref={ref} className="flex flex-col items-center gap-0.5 border-b border-grid pb-3 text-center">
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
  hiddenBlocks,
  onToggleBlock,
}: {
  games: GameStarters[];
  notPlaying: GroupedStarter[];
  legend: LeagueLegendEntry[];
  selectedLeagueIds: Set<string>;
  onToggleLeague: (leagueId: string) => void;
  /** Kickoff windows whose games are hidden from the map. */
  hiddenBlocks: Set<string>;
  /** Shows or hides one kickoff window's games on the map. */
  onToggleBlock: (label: string) => void;
}) {
  const legendByLeagueId = new Map(legend.map((l) => [l.leagueId, l]));
  // Finished blocks drop to the bottom as their last game ends, so the next one up is always on top.
  const columns = finishedBlocksLast(groupGamesByTimeBlock(games));
  const nothingToShow = games.length === 0 && notPlaying.length === 0;
  const now = useNow();

  return (
    <div className="flex flex-col gap-4">
      <NextKickoffClock games={games} now={now} />

      {/* One league per line; tapping one shows or hides its starters. */}
      <div className="flex flex-col gap-1.5">
        {legend.map((league) => {
          const selected = selectedLeagueIds.has(league.leagueId);
          return (
            <button
              key={league.leagueId}
              type="button"
              onClick={() => onToggleLeague(league.leagueId)}
              aria-pressed={selected}
              className={`flex items-start gap-2 text-[0.9375rem] leading-snug transition-opacity ${
                selected ? "text-ink-secondary" : "text-ink-muted opacity-40"
              }`}
            >
              <LeagueMark league={league} className="mt-[0.2em] h-4 w-4 shrink-0" />
              <span className="text-left">{league.leagueName}</span>
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
              <div key={column.label} className="flex flex-col">
                {/* The whole bar toggles its slate on the map: a filled dot when
                    its games are showing, an outlined one when hidden. */}
                <button
                  type="button"
                  onClick={() => onToggleBlock(column.label)}
                  aria-pressed={!hiddenBlocks.has(column.label)}
                  title={`${hiddenBlocks.has(column.label) ? "Show" : "Hide"} ${column.label} games on the map`}
                  // Styled like the map's game tags: the same solid contrasting fill and ink.
                  className="flex w-full cursor-pointer items-baseline justify-between gap-2 bg-[var(--map-tag)] px-2 py-1 text-left text-xs font-bold uppercase tracking-wide text-[var(--map-tag-ink)] transition-opacity hover:opacity-90 active:opacity-80"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className={`h-2 w-2 shrink-0 rounded-full border border-current ${
                        hiddenBlocks.has(column.label) ? "" : "bg-current"
                      }`}
                    />
                    <span className="min-w-0 truncate">{column.label}</span>
                  </span>
                  <BlockClock games={column.games} now={now} />
                </button>
                <BlockGames
                  games={column.games}
                  hidden={hiddenBlocks.has(column.label)}
                  legendByLeagueId={legendByLeagueId}
                />
              </div>
            ))}
          </div>

          {notPlaying.length > 0 ? (
            <div className="flex flex-col gap-1.5 border-t border-grid pt-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Not playing this week
              </h3>
              <div className="grid grid-cols-1 gap-1 pl-3">
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
