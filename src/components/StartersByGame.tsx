"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatCountdown } from "@/lib/format";
import { TYPE_MS_PER_CHAR, totalChars, typedSlices, useSeenOnce, useTypedCount } from "@/hooks/useTyped";
import { setHeaderKickoff } from "@/lib/header-clock";
import { formatKickoffTime, GameStarters, finishedBlocksLast, groupGamesByTimeBlock, GroupedStarter, PlayerSide } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import { LeagueLegendEntry, LeagueMark } from "./LeagueMark";
import { GameRows, RowMotion } from "./GameRows";
import { LastAction } from "@/lib/live-play-points";
import { useLastActions } from "@/hooks/useLastActions";

export type { LeagueLegendEntry };

function formatPoints(points: number): string {
  return points.toFixed(2);
}

// Whose player it is, by the color of their points: yours green, the ones you're facing red.
const SIDE_POINTS_COLOR: Record<PlayerSide, string> = {
  mine: "font-semibold text-status-good",
  opponent: "font-semibold text-status-critical",
  other: "text-ink-primary",
};

// A projection in an opened game: the same side colors, kept light and italic so it still reads as a guess.
const SIDE_PROJECTION_COLOR: Record<PlayerSide, string> = {
  mine: "text-status-good",
  opponent: "text-status-critical",
  other: "text-ink-muted",
};

/**
 * A player's row: position, name, the logo of every league they're started
 * in, then their live fantasy points pinned to the right edge — green for
 * your starters, red for the ones you're facing. Points use the first
 * league's scoring; when the player's leagues score them differently, the
 * tooltip lists each league's number. Before kickoff the points slot holds
 * the player's projection instead, in faint italics that read as provisional
 * (a dash when there's none, or for a player with no game this week), keeping
 * every row's logos lined up.
 */
/** A projection, to one decimal — set apart from real points, which have two. */
function formatProjection(points: number): string {
  return points.toFixed(1);
}

/** A player row's text, in typing order: position, name, points (or, before kickoff, the projection). */
function playerPieces(player: GroupedStarter, started: boolean): string[] {
  const showPoints = started && player.points !== null;
  const projection = !started && player.projected != null ? formatProjection(player.projected) : null;
  return [player.position, player.name, showPoints ? formatPoints(player.points!) : (projection ?? "–")];
}

// The edge of a points plate, in its side's color.
const SIDE_BORDER_COLOR: Record<PlayerSide, string> = {
  mine: "border-status-good",
  opponent: "border-status-critical",
  other: "border-ink-muted",
};

function PlayerRow({
  player,
  legendByLeagueId,
  started,
  shown = true,
  motion,
  sideColors = false,
  typing,
}: {
  player: GroupedStarter;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** While the points animate: the total to show, and the change beside it (see GameRows). */
  motion?: RowMotion;
  /** In an opened game: projections take their side's color too (yours green, the ones you face red). */
  sideColors?: boolean;
  /** Whether this player's game has kicked off — before that, 0 points is just "not yet". */
  started: boolean;
  /** False while its time block is switched off: the row deletes itself back to nothing. */
  shown?: boolean;
  /** How it types in and out, when not at the usual speed (a game's added rows, as it opens and closes). */
  typing?: { msPerChar: number; delayMs: number };
}) {
  // Types itself out the first time it scrolls into view; deletes itself when hidden.
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeenOnce(ref);
  const pieces = playerPieces(player, started);
  const total = totalChars(pieces);
  const count = useTypedCount(shown && seen ? total : 0, typing);
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
  const projecting = !started && player.projected != null;
  const title =
    (perLeague.length === 0
      ? player.name
      : `${player.name} — ${perLeague
          .map((l) => (started && scoredDifferently && l.points !== null ? `${l.name}: ${formatPoints(l.points)}` : l.name))
          .join(", ")}`) + (projecting ? ` — projected ${formatProjection(player.projected!)}` : "");
  return (
    <div ref={ref} className="flex items-center gap-1.5 leading-tight" title={title}>
      {/* Right-aligned, so the position sits right against the name. */}
      <span
        className={`w-[2.4em] shrink-0 text-right text-[0.6875rem] font-semibold uppercase tracking-wide ${
          POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"
        }`}
      >
        {position}
      </span>
      {/* A zero-width space holds the row's full height before any letter is typed. */}
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-primary">
        {/* Lit on a tag plate while this player's points travel and count up (see GameRows). */}
        <span className={motion?.highlight ? "-mx-1 bg-[var(--map-tag)] px-1 text-[var(--map-tag-ink)]" : undefined}>
          {name || "\u200b"}
        </span>
      </span>
      {/* The league logos show once the row is fully typed out. */}
      <span className={`flex shrink-0 items-center gap-0.5 transition-opacity duration-150 ${count >= total || typedIn ? "" : "opacity-0"}`}>
        {player.leagueIds.map((id) => (
          <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
        ))}
      </span>
      <span
        className={`w-[3.4em] shrink-0 text-right text-[0.8125rem] tabular-nums ${
          showPoints
            ? SIDE_POINTS_COLOR[player.side ?? "mine"]
            : projecting
              ? // Pulled in by the italic's lean, so the slanted last digit isn't clipped at the
                // column's edge and its tip lines up with the upright points around it.
                `pr-[0.2em] font-light italic opacity-75 ${sideColors ? SIDE_PROJECTION_COLOR[player.side ?? "mine"] : "text-ink-muted"}`
              : "text-ink-muted"
        }`}
      >
        {typedIn && showPoints ? (
          <span data-points className="relative inline-block origin-right">
            {/* The play's +/-, lit beside the total from when it's applied until the count is done (see GameRows). */}
            {motion?.chip ? (
              <span
                key={motion.chip.key}
                aria-hidden
                className={`pointer-events-none absolute right-full top-0 z-10 mr-2 animate-[pts-chip_0.6s_steps(1,end)_forwards] whitespace-nowrap border-l-2 bg-[var(--map-tag)] px-1 font-bold text-[var(--map-tag-ink)] ${
                  SIDE_BORDER_COLOR[player.side ?? "mine"]
                }`}
              >
                {motion.chip.delta > 0 ? "+" : ""}
                {formatPoints(motion.chip.delta)}
              </span>
            ) : null}
            {/* Lit while it counts up. */}
            <span className={motion?.counting ? "-mx-1 bg-[var(--map-tag)] px-1 font-bold text-[var(--map-tag-ink)]" : undefined}>
              {formatPoints(motion?.points ?? player.points!)}
            </span>
          </span>
        ) : (
          points
        )}
      </span>
    </div>
  );
}

/**
 * What a team's line shows on its right, in typing order: before kickoff, the
 * kickoff time on the top (away) line and nothing on the bottom; once it's
 * started, the game's clock beside the top score ("6:12 - 3rd", "Final"),
 * then each team's score.
 */
function teamLinePieces(game: NFLGame, side: "away" | "home"): string[] {
  if (game.state === "pre") return side === "away" ? [formatKickoffTime(game.kickoff)] : [];
  const score = String(side === "away" ? game.awayScore : game.homeScore);
  if (side === "home") return [score];
  const status = game.state === "post" ? "Final" : (game.statusDetail ?? "");
  return status ? [status, score] : [score];
}

// Every logo covers about the area of a square this many px on a side.
const LOGO_SIDE = 20;

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
 * One team's line in a game's box: its logo over the players' position
 * column with the team's record as of this game beside it, and on the right — over their points — its score once the game's
 * started (the top line also carries the game's clock, or the kickoff time
 * before it starts). Types itself in the first time it scrolls into view,
 * and deletes itself when its block is switched off.
 */
function TeamLine({ game, side, shown = true }: { game: NFLGame; side: "away" | "home"; shown?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeenOnce(ref);
  const pieces = teamLinePieces(game, side);
  const count = useTypedCount(shown && seen ? totalChars(pieces) : 0);
  const typed = typedSlices(pieces, count);
  const visible = shown && seen;
  const team = side === "away" ? game.awayTeam : game.homeTeam;
  const record = side === "away" ? game.awayRecord : game.homeRecord;
  const started = game.state !== "pre";
  // The status (or kickoff time) in small muted type, the score as big as the points under it.
  const [status, score] = started ? (side === "away" && pieces.length > 1 ? typed : [null, typed[0]]) : [typed[0] ?? null, null];
  return (
    <div ref={ref} className="flex min-h-[1.375rem] items-center gap-1.5">
      <span className="flex w-[2.4em] shrink-0 justify-center text-[0.6875rem]">
        <TeamLogo team={team} visible={visible} />
      </span>
      {/* Its record as of this game — counting it once it's final. */}
      {record ? (
        <span className={`shrink-0 text-xs tabular-nums text-ink-muted transition-opacity duration-150 ${visible ? "" : "opacity-0"}`}>
          {record}
        </span>
      ) : null}
      <span className="min-w-0 flex-1" />
      {status ? <span className="shrink-0 text-xs uppercase tracking-wide text-ink-muted">{status}</span> : null}
      {score !== null ? (
        <span className="w-[3.4em] shrink-0 text-right text-[0.9375rem] font-bold tabular-nums text-ink-primary">{score}</span>
      ) : null}
    </div>
  );
}

/**
 * A game's views, stepped through by tapping its matchup: 0, shut (just the
 * teams); 1, your players; 2, yours and the ones you're facing; 3, everyone
 * worth watching (see liveGameRows).
 */
function viewPlayers({ players, everyone }: GameStarters, view: number): GroupedStarter[] {
  const all = everyone ?? players;
  if (view <= 0) return [];
  if (view === 1) return all.filter((p) => (p.side ?? "mine") === "mine");
  if (view === 2) return all.filter((p) => (p.side ?? "mine") !== "other");
  return all;
}

/** The views a tap steps through for a game: shut, then each that lists someone more than the one before, then back. */
function viewCycle(g: GameStarters): number[] {
  const cycle = [0];
  let listed = 0;
  for (const view of [1, 2, 3]) {
    const n = viewPlayers(g, view).length;
    if (n > listed) {
      cycle.push(view);
      listed = n;
    }
  }
  return cycle;
}

/** Where a game is: before kickoff, being played, or over. */
type Phase = "pre" | "live" | "final";

/**
 * A player line's text, in typing order — each in a column of its own, kept
 * even when empty so every line's columns stay in line: the time of their
 * latest play that moved their points and what it was worth (while the game's
 * on), their name with their position right after it, their total (the
 * projection before kickoff).
 */
function linePieces(player: GroupedStarter, phase: Phase, action: LastAction | undefined): string[] {
  const live = phase === "live" && action;
  const total =
    phase === "pre"
      ? player.projected != null
        ? formatProjection(player.projected)
        : "–"
      : player.points !== null
        ? formatPoints(player.points)
        : "–";
  return [
    live ? clockTime(action.at) : "",
    player.name,
    player.position,
    live ? `${action.delta > 0 ? "+" : ""}${formatPoints(action.delta)}` : "",
    total,
  ];
}

/**
 * One player's line under a game: the time of their latest play that moved
 * their points (while it's on), their name with their position (small, in its
 * color) right after it, that play's +/-, and their total (or projection,
 * before kickoff). Types
 * itself in the first time it scrolls into view, and deletes itself when its
 * game shuts or its block is switched off. Once typed in, the total follows
 * the points as they change (see GameRows): the name lit as the play lights up
 * in the Red Zone, the +/- lit as it's applied, the total lit as it counts up.
 */
function GameLine({
  player,
  phase,
  action,
  shown,
  motion,
}: {
  player: GroupedStarter;
  phase: Phase;
  action: LastAction | undefined;
  shown: boolean;
  motion: RowMotion;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeenOnce(ref);
  const pieces = linePieces(player, phase, action);
  const total = totalChars(pieces);
  const count = useTypedCount(shown && seen ? total : 0);
  const [time, name, position, delta, points] = typedSlices(pieces, count);
  const [typedIn, setTypedIn] = useState(false);
  if (shown && seen && count >= total && !typedIn) setTypedIn(true);
  if (!shown && typedIn) setTypedIn(false);
  const side = player.side ?? "mine";
  const lit = "bg-[var(--map-tag)] text-[var(--map-tag-ink)]";
  // While points are being applied, the +/- being applied; otherwise their latest play's.
  const shownDelta = typedIn && phase === "live" && action ? (motion.chip?.delta ?? action.delta) : null;
  const shownPoints = typedIn && phase !== "pre" ? (motion.points ?? player.points) : null;
  return (
    <div ref={ref} className="flex items-center gap-1.5 text-[0.8125rem] leading-tight">
      <span className="w-[4.6em] shrink-0 text-[0.6875rem] tabular-nums text-ink-muted">{time}</span>
      {/* The name, with their position, small and in its color, right after it. */}
      <span className="flex min-w-0 flex-1 items-baseline gap-1">
        <span className={`min-w-0 truncate text-ink-primary ${motion.highlight ? `-mx-1 px-1 ${lit}` : ""}`}>{name || "\u200b"}</span>
        <span className={`shrink-0 text-[0.5625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"}`}>
          {position}
        </span>
      </span>
      <span
        className={`w-[3.8em] shrink-0 text-right tabular-nums ${
          shownDelta !== null && motion.chip ? `font-bold ${lit}` : (shownDelta ?? action?.delta ?? 0) < 0 ? "text-status-critical" : "text-status-good"
        }`}
      >
        {shownDelta !== null ? `${shownDelta > 0 ? "+" : ""}${formatPoints(shownDelta)}` : delta}
      </span>
      <span
        className={`w-[3.4em] shrink-0 text-right tabular-nums ${
          phase === "pre" ? `pr-[0.2em] font-light italic opacity-75 ${SIDE_PROJECTION_COLOR[side]}` : SIDE_POINTS_COLOR[side]
        }`}
      >
        {shownPoints !== null && shownPoints !== undefined ? (
          <span data-points className={`relative inline-block ${motion.counting ? `-mx-1 px-1 font-bold ${lit}` : ""}`}>
            {formatPoints(shownPoints)}
          </span>
        ) : (
          points
        )}
      </span>
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
  views,
  closingGames,
  actions,
  onToggleGame,
}: {
  games: GameStarters[];
  hidden: boolean;
  /** Each game's view (see viewPlayers), by game id — shut when missing. */
  views: Map<string, number>;
  /** Games on their way shut: their lines deleting themselves first. */
  closingGames: Set<string>;
  /** Each listed player's latest play that moved their points. */
  actions: Record<string, LastAction>;
  /** Moves a game to `view`; shutting it once `closeMs` of deleting has played out. */
  onToggleGame: (gameId: string, view: number, closeMs: number) => void;
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
    ...games.flatMap((g) => [
      totalChars(teamLinePieces(g.game, "away")),
      ...viewPlayers(g, views.get(g.game.id) ?? 0).map((p) => totalChars(linePieces(p, phaseOf(g.game), actions[p.playerId]))),
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
        <div className="flex flex-col gap-2 pt-2">
          {games.map((g) => (
            <GameBox
              key={g.game.id}
              g={g}
              view={views.get(g.game.id) ?? 0}
              closing={closingGames.has(g.game.id)}
              hidden={hidden}
              actions={actions}
              onToggle={onToggleGame}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function phaseOf(game: NFLGame): Phase {
  return game.state === "pre" ? "pre" : game.state === "post" ? "final" : "live";
}

/** The time of day a play happened, e.g. "1:42 PM". */
function clockTime(at: number | null): string {
  return at === null ? "" : new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** How long a game's box takes to slide open or shut — as long as a time block takes to fold. */
const FOLD_MS = 200;

/**
 * One game, boxed: the away team's line, then the home team's — each with its
 * record and its score on the right — and under them, set apart, the players
 * its view lists. Tapping the matchup (the teams' lines, not the players)
 * steps through its views: your players, then yours and the ones you're
 * facing, then everyone worth watching, then shut again (skipping any view
 * that would list no one new). The lines type in or delete themselves just as
 * a time block's do, and the box slides to its new height.
 */
function GameBox({
  g,
  view,
  closing,
  hidden,
  actions,
  onToggle,
}: {
  g: GameStarters;
  view: number;
  /** On its way shut, its lines deleting themselves first. */
  closing: boolean;
  /** Its time block is switched off. */
  hidden: boolean;
  actions: Record<string, LastAction>;
  onToggle: (gameId: string, view: number, closeMs: number) => void;
}) {
  const { game, live } = g;
  const phase = phaseOf(game);
  const shown = viewPlayers(g, view);
  const cycle = viewCycle(g);
  const toggleable = cycle.length > 1;
  const closeMs = reducedMotion() ? 0 : Math.max(0, ...shown.map((p) => totalChars(linePieces(p, phase, actions[p.playerId])))) * TYPE_MS_PER_CHAR + 60;
  const next = cycle[(cycle.indexOf(view) + 1) % cycle.length] ?? 0;

  // Slides to its new height whenever its lines change (stepping through its views).
  const box = useRef<HTMLDivElement>(null);
  const lastHeight = useRef<number | null>(null);
  const lastRows = useRef<string | null>(null);
  const rowsKey = shown.map((p) => p.playerId).join(",");
  // Measured on every render, so the slide starts from the height it really had.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const height = el.offsetHeight;
    const prev = lastHeight.current;
    const rowsChanged = lastRows.current !== null && lastRows.current !== rowsKey;
    lastHeight.current = height;
    lastRows.current = rowsKey;
    if (!rowsChanged || prev === null || prev === height || reducedMotion()) return;
    el.animate([{ height: `${prev}px`, overflow: "hidden" }, { height: `${height}px`, overflow: "hidden" }], { duration: FOLD_MS, easing: "ease-out" });
  });

  const toggle = () => onToggle(game.id, next, closeMs);
  const label = ["show your players", "show yours and the ones you face", "show everyone in this game", "show just the teams"][next === 0 ? 3 : next - 1];
  return (
    // Each game boxed, so one game's players never run into the next's.
    <div ref={box} className="flex flex-col border border-ink-muted/40 px-2 py-1.5">
      {/* The matchup — and only the matchup — steps through the game's views. */}
      <div
        role={toggleable ? "button" : undefined}
        tabIndex={toggleable ? 0 : undefined}
        aria-label={`${game.awayTeam} at ${game.homeTeam}${toggleable ? ` — ${label}` : ""}`}
        onClick={toggleable ? toggle : undefined}
        onKeyDown={
          toggleable
            ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                toggle();
              }
            : undefined
        }
        className={`flex flex-col gap-0.5 ${toggleable ? "cursor-pointer transition-opacity hover:opacity-80" : ""}`}
      >
        <TeamLine game={game} side="away" shown={!hidden} />
        <TeamLine game={game} side="home" shown={!hidden} />
      </div>
      {/* The players its view lists, set apart below the teams. */}
      {shown.length > 0 ? (
        <div className="mt-1 border-t border-ink-muted/25 pt-1">
          <GameRows
            players={shown}
            sortByPoints={!!live}
            render={(player, motion) => (
              <GameLine player={player} phase={phase} action={actions[player.playerId]} shown={!hidden && !closing} motion={motion} />
            )}
          />
        </div>
      ) : null}
    </div>
  );
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
 * the rest of the dashboard rather than take over the page width. Which
 * leagues show is set in Settings (each league's visibility).
 */
export function StartersByGame({
  games,
  notPlaying,
  legend,
  allLeaguesHidden,
  hiddenBlocks,
  onToggleBlock,
}: {
  games: GameStarters[];
  notPlaying: GroupedStarter[];
  /** Each league's name and logo, for the marks on each starter's row. */
  legend: LeagueLegendEntry[];
  /** Every league is hidden in Settings, so there's nobody to list. */
  allLeaguesHidden: boolean;
  /** Kickoff windows whose games are hidden from the map. */
  hiddenBlocks: Set<string>;
  /** Shows or hides one kickoff window's games on the map. */
  onToggleBlock: (label: string) => void;
}) {
  const legendByLeagueId = new Map(legend.map((l) => [l.leagueId, l]));
  // Each game's view, stepped through by tapping its matchup (see viewPlayers) —
  // shut when missing — and the games on their way shut, still listing their
  // players while the lines delete themselves.
  const [views, setViews] = useState<Map<string, number>>(() => new Map());
  const [closingGames, setClosingGames] = useState<Set<string>>(() => new Set());
  const closeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = closeTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  const toggleGame = (gameId: string, view: number, closeMs: number) => {
    const without = (set: Set<string>) => {
      const next = new Set(set);
      next.delete(gameId);
      return next;
    };
    if (closingGames.has(gameId)) {
      // Tapped again mid-close: it stays where it was, and the names type back in.
      clearTimeout(closeTimers.current.get(gameId));
      closeTimers.current.delete(gameId);
      setClosingGames(without);
    } else if (view === 0) {
      setClosingGames((prev) => new Set(prev).add(gameId));
      closeTimers.current.set(
        gameId,
        setTimeout(() => {
          closeTimers.current.delete(gameId);
          setViews((prev) => {
            const next = new Map(prev);
            next.delete(gameId);
            return next;
          });
          setClosingGames(without);
        }, closeMs)
      );
    } else {
      setViews((prev) => new Map(prev).set(gameId, view));
    }
  };
  // The players showing in each started game, whose latest plays to follow.
  const followed = useMemo(
    () =>
      games
        .filter((g) => g.game.state !== "pre" && (views.get(g.game.id) ?? 0) > 0)
        .map((g) => ({ ...g, players: viewPlayers(g, views.get(g.game.id) ?? 0) })),
    [games, views]
  );
  const actions = useLastActions(followed);
  // Finished blocks drop to the bottom as their last game ends, so the next one up is always on top.
  const columns = finishedBlocksLast(groupGamesByTimeBlock(games));
  const nothingToShow = games.length === 0 && notPlaying.length === 0;
  const now = useNow();

  return (
    <div className="flex flex-col gap-4">
      <NextKickoffClock games={games} now={now} />

      {nothingToShow ? (
        <p className="text-sm text-ink-secondary">
          {allLeaguesHidden ? "Every league is hidden. Show one in Settings." : "No starters set for this week yet."}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {columns.map((column) => (
              <div key={column.label} className="flex flex-col">
                {/* The whole bar toggles its slate on the map (and folds its games here). */}
                <button
                  type="button"
                  onClick={() => onToggleBlock(column.label)}
                  aria-pressed={!hiddenBlocks.has(column.label)}
                  title={`${hiddenBlocks.has(column.label) ? "Show" : "Hide"} ${column.label} games on the map`}
                  // Styled like the map's game tags: the same solid contrasting fill and ink.
                  className="flex w-full cursor-pointer items-baseline justify-between gap-2 bg-[var(--map-tag)] px-2 py-1 text-left text-xs font-bold uppercase tracking-wide text-[var(--map-tag-ink)] transition-opacity hover:opacity-90 active:opacity-80"
                >
                  <span className="min-w-0 truncate">{column.label}</span>
                  <BlockClock games={column.games} now={now} />
                </button>
                <BlockGames
                  games={column.games}
                  hidden={hiddenBlocks.has(column.label)}
                  views={views}
                  closingGames={closingGames}
                  actions={actions}
                  onToggleGame={toggleGame}
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
