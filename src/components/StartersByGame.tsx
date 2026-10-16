"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatCountdown } from "@/lib/format";
import { TYPE_MS_PER_CHAR, totalChars, typedSlices, useSeenOnce, useTypedCount } from "@/hooks/useTyped";
import { formatKickoffTime, GameStarters, finishedBlocksLast, groupGamesByTimeBlock, GroupedStarter, PlayerSide } from "@/lib/my-starters";
import { gameClock, NFLGame } from "@/lib/nfl-schedule";
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

/** A projection, to one decimal — set apart from real points, which have two. */
function formatProjection(points: number): string {
  return points.toFixed(1);
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
  const status = game.state === "post" ? "Final" : gameClock(game.statusDetail ?? "");
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
 * One team's line in a game's box: its logo with the team's record as of
 * this game beside it, then its score once the game's started — set in from
 * the edge, inside the players' points — and on the far right, on the top
 * line, the game's clock ("6:12 - 3rd", "Final", or the kickoff time before
 * it starts); the bottom line keeps that column free. Types itself in the
 * first time it scrolls into view, and deletes itself when its block is
 * switched off.
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
      {/* The score, over the players' +/- column under it. */}
      <span className="w-[2.4em] shrink-0 text-right text-[0.9375rem] font-bold tabular-nums text-ink-primary">{score}</span>
      {/* The game's clock (or kickoff time) on the right, as wide as the players' points under it — anything
          longer runs out leftward, never shifting the score; the bottom line's is held for more to come. */}
      <span className="flex w-[2.7625rem] shrink-0 items-baseline justify-end gap-[0.3em] whitespace-nowrap text-ink-muted" title={status ?? undefined}>
        <StatusText text={status ?? ""} />
      </span>
    </div>
  );
}

/** A game's status in the row: the quarter ("2Q") a hair bigger than the clock beside it; anything else in small type. */
function StatusText({ text }: { text: string }) {
  // Split at the quarter as soon as it's typed, so the sizes hold steady while the clock types in after it.
  const parts = /^([1-4]Q|\d*OT)(?:\s(.*))?$/.exec(text);
  if (!parts) return <span className="text-xs uppercase">{text}</span>;
  return (
    <>
      <span className="text-[0.75rem] font-semibold uppercase">{parts[1]}</span>
      {parts[2] ? <span className="text-[0.6875rem] tabular-nums">{parts[2]}</span> : null}
    </>
  );
}

/** Who a box can list: your starters, and everyone worth watching (a game's, see liveGameRows). */
type Listing = Pick<GameStarters, "players" | "everyone">;

/**
 * A box's views, stepped through by tapping its matchup (or set for every box
 * at once from the bar on top): 0, shut (just the teams); 1, Team — your
 * players; 2, VS — yours and the ones you're facing; 3, ALL — everyone worth
 * watching (see liveGameRows).
 */
function viewPlayers({ players, everyone }: Listing, view: number): GroupedStarter[] {
  const all = everyone ?? players;
  if (view <= 0) return [];
  if (view === 1) return all.filter((p) => (p.side ?? "mine") === "mine");
  if (view === 2) return all.filter((p) => (p.side ?? "mine") !== "other");
  return all;
}

/** The views a tap steps through for a box: shut, then each that lists someone more than the one before, then back. */
function viewCycle(listing: Listing): number[] {
  const cycle = [0];
  let listed = 0;
  for (const view of [1, 2, 3]) {
    const n = viewPlayers(listing, view).length;
    if (n > listed) {
      cycle.push(view);
      listed = n;
    }
  }
  return cycle;
}

/** The view a tap moves a box on to from `view`: the next one in its cycle that lists someone new, or shut. */
function nextView(listing: Listing, view: number): number {
  return viewCycle(listing).find((v) => v > view) ?? 0;
}

/** The views' names, on the bar that sets every box at once. */
const VIEW_NAMES: [number, string][] = [
  [1, "Team"],
  [2, "VS"],
  [3, "ALL"],
];

/** Where a game is: before kickoff, being played, or over. */
type Phase = "pre" | "live" | "final";

/**
 * A player line's text, in typing order: the time of their latest play that
 * moved their points (while the game's on), their name and position, what
 * that play was worth, their total (the projection before kickoff).
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

// A league logo on a player's line, and the gap between two, in px.
const LINE_LOGO_PX = 12;
const LINE_LOGO_GAP_PX = 2;

/**
 * One player's line under a game, in columns that line up from line to line:
 * the time of their latest play that moved their points (while it's on —
 * kept blank otherwise), their name with their position (small, in its
 * color) right after it, the logo of every league they're started in, that
 * play's +/- (only while the game's on: otherwise the logos take its place),
 * and their total (or projection, before kickoff). The first league's logo
 * sits on the right, the rest building leftward; should they reach the
 * position, just the first shows, with "+N" for the others. Types itself in
 * the first time it scrolls into view, and deletes itself when its box shuts
 * or its block is switched off. Once typed in, the total follows the points
 * as they change (see GameRows): the name lit as the play lights up in the
 * Red Zone, the +/- lit as it's applied, the total lit as it counts up.
 */
function GameLine({
  player,
  phase,
  action,
  shown,
  motion,
  legendByLeagueId,
  selected = false,
  onSelect,
}: {
  player: GroupedStarter;
  phase: Phase;
  action: LastAction | undefined;
  shown: boolean;
  motion: RowMotion;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Their points-over-time graph is up in place of the map. */
  selected?: boolean;
  /** Puts their graph up (or, already up, takes it down) — none for a player with no game. */
  onSelect?: () => void;
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

  // Their leagues in the order they're tracked — the first is the one on the right.
  const leagueIds = [...player.leagueIds].sort(
    (x, y) => (legendByLeagueId.get(x)?.colorIndex ?? 0) - (legendByLeagueId.get(y)?.colorIndex ?? 0)
  );
  const leagueNames = leagueIds.map((id) => legendByLeagueId.get(id)?.leagueName ?? id);
  // Whether every logo would reach the name and position, measured once the line's typed in.
  const middle = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const positionRef = useRef<HTMLSpanElement>(null);
  const [crowded, setCrowded] = useState(false);
  useLayoutEffect(() => {
    const el = middle.current;
    if (!el || !typedIn || leagueIds.length < 2) return;
    const measure = () => {
      const logos = leagueIds.length * LINE_LOGO_PX + (leagueIds.length - 1) * LINE_LOGO_GAP_PX;
      // The name at its full width, even while it's cut short, and a gap either side of the position.
      const used = (nameRef.current?.scrollWidth ?? 0) + (positionRef.current?.offsetWidth ?? 0) + 3 * 4;
      setCrowded(used + logos > el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [typedIn, leagueIds.length, player.name, player.position]);
  const logoIds = crowded ? leagueIds.slice(0, 1) : leagueIds;

  return (
    <div
      ref={ref}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onSelect();
            }
          : undefined
      }
      className={`flex items-center gap-1.5 py-[3px] text-[0.8125rem] leading-tight ${onSelect ? "cursor-pointer" : ""}`}
      title={leagueNames.length > 0 ? `${player.name} — ${leagueNames.join(", ")}` : player.name}
    >
      {/* Just wide enough for "12:59", the name tucked in close after it — never touching. */}
      <span className="-mr-0.5 w-[2.6em] shrink-0 text-[0.6875rem] tabular-nums text-ink-muted">{time}</span>
      <span ref={middle} className="flex min-w-0 flex-1 items-center gap-1">
        <span
          ref={nameRef}
          className={`min-w-0 truncate text-ink-primary ${motion.highlight ? `-mx-1 px-1 ${lit}` : ""} ${
            selected ? "underline decoration-2 underline-offset-2" : onSelect ? "decoration-ink-muted hover:underline" : ""
          }`}
        >
          {name || "​"}
        </span>
        <span ref={positionRef} className={`shrink-0 text-[0.5rem] font-semibold uppercase ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"}`}>
          {position}
        </span>
        <span className="min-w-0 flex-1" />
        {/* The first league on the right, the rest building leftward — or, crowded, "+N" for them. */}
        <span
          className={`flex shrink-0 flex-row-reverse items-center gap-0.5 transition-opacity duration-150 ${typedIn ? "" : "opacity-0"}`}
          aria-hidden
        >
          {logoIds.map((id) => (
            <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
          ))}
          {crowded ? <span className="text-[0.625rem] tabular-nums text-ink-muted">+{leagueIds.length - 1}</span> : null}
        </span>
      </span>
      {phase === "live" ? (
        <span
          className={`w-[3.8em] shrink-0 text-right tabular-nums ${
            shownDelta !== null && motion.chip
              ? `font-bold ${lit}`
              : (shownDelta ?? action?.delta ?? 0) < 0
                ? "text-status-critical"
                : "text-status-good"
          }`}
        >
          {shownDelta !== null ? `${shownDelta > 0 ? "+" : ""}${formatPoints(shownDelta)}` : delta}
        </span>
      ) : null}
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

/** How long a box's lines take to delete themselves before it shuts. */
function closeMsFor(players: GroupedStarter[], phase: Phase, actions: Record<string, LastAction>): number {
  if (reducedMotion()) return 0;
  return Math.max(0, ...players.map((p) => totalChars(linePieces(p, phase, actions[p.playerId])))) * TYPE_MS_PER_CHAR + 60;
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
  legendByLeagueId,
  offMap,
  onToggleMap,
  selectedPlayers,
  onSelectPlayer,
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
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Games taken off the map, by id. */
  offMap: Set<string>;
  onToggleMap: (gameId: string) => void;
  selectedPlayers: { playerId: string; gameId: string }[];
  onSelectPlayer: (playerId: string, gameId: string) => void;
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
              id={g.game.id}
              listing={g}
              phase={phaseOf(g.game)}
              live={!!g.live}
              label={`${g.game.awayTeam} at ${g.game.homeTeam}`}
              view={views.get(g.game.id) ?? 0}
              closing={closingGames.has(g.game.id)}
              hidden={hidden}
              actions={actions}
              onToggle={onToggleGame}
              legendByLeagueId={legendByLeagueId}
              map={{ off: offMap.has(g.game.id), onToggle: () => onToggleMap(g.game.id) }}
              selectedPlayerIds={selectedPlayers.filter((p) => p.gameId === g.game.id).map((p) => p.playerId)}
              onSelectPlayer={(playerId) => onSelectPlayer(playerId, g.game.id)}
            >
              <TeamLine game={g.game} side="away" shown={!hidden} />
              <TeamLine game={g.game} side="home" shown={!hidden} />
            </GameBox>
          ))}
        </div>
      </div>
    </div>
  );
}

function phaseOf(game: NFLGame): Phase {
  return game.state === "pre" ? "pre" : game.state === "post" ? "final" : "live";
}

/** The time of day a play happened, e.g. "1:42" — no AM/PM, so the column stays narrow (the tooltip has it). */
function clockTime(at: number | null): string {
  return at === null ? "" : new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
}

/** How long a game's box takes to slide open or shut — as long as a time block takes to fold. */
const FOLD_MS = 200;

// How far a box slides over to show its map button, in px.
const SWIPE_PX = 52;

/** An eye — or, crossed out, a game taken off the map. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M3 3l18 18" /> : null}
    </svg>
  );
}

/**
 * Swiped left — by touch, a mouse drag or a trackpad's sideways scroll — a
 * box slides over to show a button behind it, the way a list row does on iOS.
 * Swiped back, or tapped anywhere outside the button, it slides home again.
 */
function Swipeable({ children, action, className }: { children: React.ReactNode; action: React.ReactNode; className: string }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; start: number; sideways: boolean | null } | null>(null);
  const swallowClick = useRef(false);
  const actionRef = useRef<HTMLDivElement>(null);
  const settle = (at: number) => {
    setDragging(false);
    setOffset(at < -SWIPE_PX / 2 ? -SWIPE_PX : 0);
  };
  return (
    <div
      className={`relative touch-pan-y overflow-hidden ${className}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // A touch swipe ends without a click, so whatever comes next is a fresh tap.
        swallowClick.current = false;
        drag.current = { x: e.clientX, y: e.clientY, start: offset, sideways: null };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (d.sideways === null) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          d.sideways = Math.abs(dx) > Math.abs(dy);
          if (!d.sideways) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }
        if (!d.sideways) return;
        setOffset(Math.min(0, Math.max(-SWIPE_PX * 1.4, d.start + dx)));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d?.sideways) return;
        swallowClick.current = true;
        settle(Math.min(0, Math.max(-SWIPE_PX * 1.4, d.start + e.clientX - d.x)));
      }}
      onPointerCancel={() => {
        const d = drag.current;
        drag.current = null;
        if (d?.sideways) settle(d.start);
      }}
      onWheel={(e) => {
        // A trackpad's sideways swipe: left shows the button, right hides it.
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 8) return;
        setOffset(e.deltaX > 0 ? -SWIPE_PX : 0);
      }}
      onClickCapture={(e) => {
        // A swipe's release isn't a tap; nor, while it's open, is a tap anywhere but the button.
        if (swallowClick.current) {
          swallowClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        } else if (offset !== 0 && !actionRef.current?.contains(e.target as Node)) {
          e.stopPropagation();
          e.preventDefault();
          setOffset(0);
        }
      }}
    >
      <div ref={actionRef} className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: SWIPE_PX }}>
        {action}
      </div>
      <div
        className={`relative bg-[var(--page)] ${dragging ? "select-none" : "transition-transform duration-200 ease-out"}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * One game (or a team on its bye), boxed: its team lines (`children`), and
 * under them, set apart, the players its view lists. Tapping the team lines
 * (not the players) steps through its views: your players, then yours and the
 * ones you're facing, then everyone worth watching, then shut again (skipping
 * any view that would list no one new). The lines type in or delete
 * themselves just as a time block's do, and the box slides to its new
 * height. A game's box swipes left to show a button that takes it off the
 * map (or puts it back); its border goes dashed while it's off.
 */
function GameBox({
  id,
  listing,
  phase,
  live,
  label,
  view,
  closing,
  hidden,
  actions,
  onToggle,
  legendByLeagueId,
  map,
  selectedPlayerIds = [],
  onSelectPlayer,
  children,
}: {
  id: string;
  listing: Listing;
  phase: Phase;
  /** Kicked off: its lines kept in order of points. */
  live: boolean;
  /** What it's called, for screen readers ("BUF at MIA"). */
  label: string;
  view: number;
  /** On its way shut, its lines deleting themselves first. */
  closing: boolean;
  /** Its time block is switched off. */
  hidden: boolean;
  actions: Record<string, LastAction>;
  onToggle: (id: string, view: number, closeMs: number) => void;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Whether it's off the map, and the button that switches that — none for a bye. */
  map?: { off: boolean; onToggle: () => void };
  /** The players in this game whose graphs are up. */
  selectedPlayerIds?: string[];
  /** Puts a player's graph up — none for a bye. */
  onSelectPlayer?: (playerId: string) => void;
  children: React.ReactNode;
}) {
  const shown = viewPlayers(listing, view);
  const toggleable = viewCycle(listing).length > 1;
  const next = nextView(listing, view);

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

  const toggle = () => onToggle(id, next, closeMsFor(shown, phase, actions));
  const nextLabel = ["show just the teams", "show your players", "show yours and the ones you face", "show everyone"][next];
  const content = (
    <div ref={box} className="flex flex-col px-2 py-1.5">
      {/* The matchup — and only the matchup — steps through the box's views. */}
      <div
        role={toggleable ? "button" : undefined}
        tabIndex={toggleable ? 0 : undefined}
        aria-label={`${label}${toggleable ? ` — ${nextLabel}` : ""}`}
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
        {children}
      </div>
      {/* The players its view lists, set apart below the teams. */}
      {shown.length > 0 ? (
        <div className="mt-1 border-t border-ink-muted/25 pt-1">
          <GameRows
            players={shown}
            sortByPoints={live}
            render={(player, motion) => (
              <GameLine
                player={player}
                phase={phase}
                action={actions[player.playerId]}
                shown={!hidden && !closing}
                motion={motion}
                legendByLeagueId={legendByLeagueId}
                selected={selectedPlayerIds.includes(player.playerId)}
                onSelect={onSelectPlayer ? () => onSelectPlayer(player.playerId) : undefined}
              />
            )}
          />
        </div>
      ) : null}
    </div>
  );
  // Each game boxed, so one game's players never run into the next's.
  if (!map) return <div className="border border-ink-muted/40">{content}</div>;
  return (
    <Swipeable
      className={`border border-ink-muted/40 ${map.off ? "border-dashed" : ""}`}
      action={
        <button
          type="button"
          onClick={map.onToggle}
          aria-pressed={!map.off}
          aria-label={`${map.off ? "Show" : "Hide"} ${label} on the map`}
          title={`${map.off ? "Show on" : "Hide from"} the map`}
          className="flex w-full cursor-pointer items-start justify-center bg-[var(--map-tag)] pt-3 text-[var(--map-tag-ink)] transition-opacity hover:opacity-90"
        >
          <EyeIcon off={map.off} />
        </button>
      }
    >
      {content}
    </Swipeable>
  );
}

/** A team on its bye: its logo, its name, and any of your starters (or the ones you face) on it. */
export interface ByeTeam {
  /** Sleeper's abbreviation; null for starters with no NFL team at all. */
  team: string | null;
  players: GroupedStarter[];
  everyone: GroupedStarter[];
}

/** A bye team's line, standing in for a game's two: its logo, then its abbreviation. */
function ByeLine({ team, shown }: { team: string | null; shown: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeenOnce(ref);
  const name = team ?? "No team";
  const count = useTypedCount(shown && seen ? name.length : 0);
  return (
    <div ref={ref} className="flex min-h-[1.375rem] items-center gap-1.5">
      {team ? (
        <span className="flex w-[2.4em] shrink-0 justify-center text-[0.6875rem]">
          <TeamLogo team={team} visible={shown && seen} />
        </span>
      ) : null}
      <span className="text-xs uppercase tracking-wide text-ink-muted">{name.slice(0, count) || "​"}</span>
    </div>
  );
}

/**
 * The teams on bye side by side, a quarter of the row each (there are never
 * more than four). Tapping one steps it through the views, like a game's
 * matchup; the players it then lists go under the whole row, headed by their
 * team, so the row itself stays as it is.
 */
function ByeRow({
  byes,
  views,
  closingGames,
  actions,
  onToggle,
  legendByLeagueId,
}: {
  byes: ByeTeam[];
  views: Map<string, number>;
  closingGames: Set<string>;
  actions: Record<string, LastAction>;
  onToggle: (id: string, view: number, closeMs: number) => void;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
}) {
  const nextLabel = ["show just the team", "show your players", "show yours and the ones you face", "show everyone"];
  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="grid grid-cols-4 gap-2">
        {byes.map((b) => {
          const id = byeId(b);
          const view = views.get(id) ?? 0;
          const toggleable = viewCycle(b).length > 1;
          const next = nextView(b, view);
          const open = viewPlayers(b, view).length > 0 && !closingGames.has(id);
          const toggle = () => onToggle(id, next, closeMsFor(viewPlayers(b, view), "pre", actions));
          return (
            <div
              key={id}
              role={toggleable ? "button" : undefined}
              tabIndex={toggleable ? 0 : undefined}
              aria-label={`${b.team ?? "No team"} on bye${toggleable ? ` — ${nextLabel[next]}` : ""}`}
              aria-expanded={toggleable ? open : undefined}
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
              // An open one is outlined in ink, to tie it to its players below.
              className={`min-w-0 border px-2 py-1.5 ${open ? "border-ink-primary" : "border-ink-muted/40"} ${toggleable ? "cursor-pointer transition-opacity hover:opacity-80" : ""}`}
            >
              <ByeLine team={b.team} shown />
            </div>
          );
        })}
      </div>
      {byes.map((b) => {
        const id = byeId(b);
        const shown = viewPlayers(b, views.get(id) ?? 0);
        if (shown.length === 0) return null;
        const closing = closingGames.has(id);
        return (
          <div key={id} className="flex flex-col border border-ink-muted/40 px-2 py-1.5">
            <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-muted">{b.team ?? "No team"}</span>
            <GameRows
              players={shown}
              sortByPoints={false}
              render={(player, motion) => (
                <GameLine
                  player={player}
                  phase="pre"
                  action={actions[player.playerId]}
                  shown={!closing}
                  motion={motion}
                  legendByLeagueId={legendByLeagueId}
                  selected={false}
                />
              )}
            />
          </div>
        );
      })}
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
  byes,
  legend,
  allLeaguesHidden,
  hiddenBlocks,
  onToggleBlock,
  offMap,
  onToggleMap,
  selectedPlayers,
  onSelectPlayer,
}: {
  games: GameStarters[];
  /** The teams on their bye this week, with any starters on them — listed last, under their own header. */
  byes: ByeTeam[];
  /** Each league's name and logo, for the marks on each starter's row. */
  legend: LeagueLegendEntry[];
  /** Every league is hidden in Settings, so there's nobody to list. */
  allLeaguesHidden: boolean;
  /** Kickoff windows whose games are hidden from the map. */
  hiddenBlocks: Set<string>;
  /** Shows or hides one kickoff window's games on the map. */
  onToggleBlock: (label: string) => void;
  /** Games taken off the map one at a time (swiped over), by id. */
  offMap: Set<string>;
  /** Takes one game off the map, or puts it back. */
  onToggleMap: (gameId: string) => void;
  /** The players whose points-over-time graphs are up in place of the map. */
  selectedPlayers: { playerId: string; gameId: string }[];
  /** Puts a player's graph up (up to four), or — theirs already up — takes it down. */
  onSelectPlayer: (playerId: string, gameId: string) => void;
}) {
  const legendByLeagueId = new Map(legend.map((l) => [l.leagueId, l]));
  // Every box — each game, then each bye — with what it can list.
  const boxes = useMemo(
    () => [
      ...games.map((g) => ({ id: g.game.id, listing: g as Listing, phase: phaseOf(g.game) })),
      ...byes.map((b) => ({ id: byeId(b), listing: b as Listing, phase: "pre" as Phase })),
    ],
    [games, byes]
  );
  // Each box's view, stepped through by tapping its matchup (see viewPlayers) —
  // shut when missing — and the boxes on their way shut, still listing their
  // players while the lines delete themselves.
  const [views, setViews] = useState<Map<string, number>>(() => new Map());
  const [closingGames, setClosingGames] = useState<Set<string>>(() => new Set());
  // The view the bar on top last set every box to, until a box is tapped on its own.
  const [barView, setBarView] = useState<number | null>(null);
  const closeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = closeTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  const without = (id: string) => (set: Set<string>) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };
  const shut = (id: string, closeMs: number) => {
    setClosingGames((prev) => new Set(prev).add(id));
    closeTimers.current.set(
      id,
      setTimeout(() => {
        closeTimers.current.delete(id);
        setViews((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setClosingGames(without(id));
      }, closeMs)
    );
  };
  const toggleGame = (id: string, view: number, closeMs: number) => {
    setBarView(null);
    if (closingGames.has(id)) {
      // Tapped again mid-close: it stays where it was, and the names type back in.
      clearTimeout(closeTimers.current.get(id));
      closeTimers.current.delete(id);
      setClosingGames(without(id));
    } else if (view === 0) {
      shut(id, closeMs);
    } else {
      setViews((prev) => new Map(prev).set(id, view));
    }
  };
  // Every box to one view at once.
  const openAll = (view: number) => {
    setBarView(view);
    closeTimers.current.forEach((t) => clearTimeout(t));
    closeTimers.current.clear();
    setClosingGames(new Set());
    setViews(new Map(boxes.filter((box) => viewCycle(box.listing).length > 1).map((box) => [box.id, view])));
  };
  // The bar: every box to one view at once — or, its view tapped again, every box shut.
  const setAllViews = (view: number) => {
    if (view === barView) {
      setBarView(null);
      for (const box of boxes) {
        const current = views.get(box.id) ?? 0;
        if (current === 0 || closingGames.has(box.id)) continue;
        shut(box.id, closeMsFor(viewPlayers(box.listing, current), box.phase, actions));
      }
      return;
    }
    openAll(view);
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
  const nothingToShow = games.length === 0 && byes.every((b) => b.everyone.length === 0);
  const now = useNow();
  // A block's header, and the bye's: styled like the map's game tags, the same solid contrasting fill and ink.
  const headerBar = "flex w-full items-baseline justify-between gap-2 bg-[var(--map-tag)] px-2 py-1 text-left text-xs font-bold uppercase tracking-wide text-[var(--map-tag-ink)]";

  return (
    <div className="flex flex-col gap-4">

      {nothingToShow ? null : (
        // Every box to one view at once.
        <div className="grid grid-cols-3 border border-ink-muted/40" role="group" aria-label="Show in every game">
          {VIEW_NAMES.map(([view, name]) => (
            <button
              key={view}
              type="button"
              onClick={() => setAllViews(view)}
              aria-pressed={barView === view}
              className={`cursor-pointer py-1 text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-80 ${
                barView === view ? "bg-[var(--map-tag)] text-[var(--map-tag-ink)]" : "text-ink-secondary"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}


      {nothingToShow ? (
        <p className="text-sm text-ink-secondary">
          {allLeaguesHidden ? "Every league is hidden. Show one in Settings." : "No starters set for this week yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {columns.map((column) => (
            <div key={column.label} className="flex flex-col">
              {/* The whole bar toggles its slate on the map (and folds its games here). */}
              <button
                type="button"
                onClick={() => onToggleBlock(column.label)}
                aria-pressed={!hiddenBlocks.has(column.label)}
                title={`${hiddenBlocks.has(column.label) ? "Show" : "Hide"} ${column.label} games on the map`}
                className={`${headerBar} cursor-pointer transition-opacity hover:opacity-90 active:opacity-80`}
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
                legendByLeagueId={legendByLeagueId}
                offMap={offMap}
                onToggleMap={onToggleMap}
                selectedPlayers={selectedPlayers}
                onSelectPlayer={onSelectPlayer}
              />
            </div>
          ))}

          {/* The byes, always last — under the finished blocks too. */}
          {byes.length > 0 ? (
            <div className="flex flex-col">
              <h3 className={headerBar}>Bye</h3>
              <ByeRow byes={byes} views={views} closingGames={closingGames} actions={actions} onToggle={toggleGame} legendByLeagueId={legendByLeagueId} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function byeId(b: ByeTeam): string {
  return `bye-${b.team ?? "none"}`;
}
