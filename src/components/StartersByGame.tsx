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
import { LatestScore } from "@/lib/live-play-points";

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
 * A kickoff window's games, collapsing when its block is switched off: every
 * line deletes itself, letter by letter, then the block folds shut. Switched
 * back on, it opens and the lines type themselves back in.
 */
function BlockGames({
  games,
  hidden,
  legendByLeagueId,
  openGames,
  closingGames,
  onToggleGame,
  latestScores,
}: {
  games: GameStarters[];
  latestScores: Record<string, LatestScore>;
  hidden: boolean;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Games opened up to everyone in them, by game id. */
  openGames: Set<string>;
  /** Opened games on their way shut: the added rows deleting themselves first. */
  closingGames: Set<string>;
  /** Opens a game, or closes it once `closeMs` of deleting has played out. */
  onToggleGame: (gameId: string, closeMs: number) => void;
}) {
  // An opened game lists everyone worth watching in it; a shut one, nobody (just its latest play for you).
  const shownPlayers = ({ game, players, everyone }: GameStarters) => (openGames.has(game.id) ? (everyone ?? players) : []);
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
      ...shownPlayers(g).map((p) => totalChars(playerPieces(p, g.game.state !== "pre"))),
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
              shown={shownPlayers(g)}
              hidden={hidden}
              open={openGames.has(g.game.id)}
              closing={closingGames.has(g.game.id)}
              latest={latestScores[g.game.id] ?? null}
              legendByLeagueId={legendByLeagueId}
              onToggle={onToggleGame}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The time of day a play happened, e.g. "1:42 PM". */
function clockTime(at: number | null): string {
  return at === null ? "" : new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * A shut game's line for the latest play one of your players got points on:
 * when it happened, who, what it was worth, and their total. It's where the
 * points land when they change (see GameRows): the name lit as the play
 * lights up in the Red Zone, then the +/- lit as it's applied, then the total
 * lit as it counts up. All your players in the game are followed for that,
 * though only the play's scorers are shown.
 */
function LatestScoreRow({ players, latest, hidden }: { players: GroupedStarter[]; latest: LatestScore; hidden: boolean }) {
  const delta = new Map(latest.scorers.map((s) => [s.playerId, s.delta]));
  const time = clockTime(latest.play.at);
  return (
    <div className={`mt-0.5 border-t border-ink-muted/25 pt-1 transition-opacity duration-150 ${hidden ? "opacity-0" : ""}`}>
      <GameRows
        players={players}
        sortByPoints={false}
        render={(player, motion) => {
          const scored = delta.get(player.playerId);
          if (scored === undefined) return null;
          // While points are being applied, the +/- being applied (a replayed play's, say); otherwise this play's.
          const d = motion.chip?.delta ?? scored;
          const points = motion.points ?? player.points;
          const lit = "bg-[var(--map-tag)] text-[var(--map-tag-ink)]";
          return (
            <div className="flex items-center gap-1.5 text-[0.8125rem] leading-tight">
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">{time}</span>
              <span className="min-w-0 flex-1 truncate text-ink-primary">
                <span className={motion.highlight ? `-mx-1 px-1 ${lit}` : undefined}>{player.name}</span>
              </span>
              <span className={`shrink-0 tabular-nums ${motion.chip ? `px-1 font-bold ${lit}` : d > 0 ? "text-status-good" : "text-status-critical"}`}>
                {d > 0 ? "+" : ""}
                {formatPoints(d)}
              </span>
              <span className="w-[3.4em] shrink-0 text-right tabular-nums">
                {points !== null ? (
                  <span data-points className={`relative inline-block ${motion.counting ? `-mx-1 px-1 font-bold ${lit}` : "font-semibold text-ink-primary"}`}>
                    {formatPoints(points)}
                  </span>
                ) : null}
              </span>
            </div>
          );
        }}
      />
    </div>
  );
}

/** How long a game's box takes to slide open or shut — as long as a time block takes to fold. */
const FOLD_MS = 200;

/**
 * One game, boxed: the away team's line, then the home team's — each with its
 * score on the right — and under them the latest play one of your players got
 * points on. Tapping anywhere in it opens it up to everyone worth watching in
 * the game (see liveGameRows), each under the team they play for with their
 * points on the right, and back: the names type in (or delete themselves)
 * just as a time block's do, and the box slides to its new height.
 */
function GameBox({
  g,
  shown,
  hidden,
  open,
  closing,
  latest,
  legendByLeagueId,
  onToggle,
}: {
  g: GameStarters;
  /** The players listed: everyone when it's open, nobody when it's shut. */
  shown: GroupedStarter[];
  /** The latest play one of your players got points on. */
  latest: LatestScore | null;
  /** Its time block is switched off. */
  hidden: boolean;
  open: boolean;
  /** Open, with the added names deleting themselves before it shuts. */
  closing: boolean;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Opens the game, or shuts it once `closeMs` of deleting has played out. */
  onToggle: (gameId: string, closeMs: number) => void;
}) {
  const { game, players, everyone, live } = g;
  // A game with anyone in it to list opens up.
  const expandable = (everyone ?? players).length > 0;
  const started = game.state !== "pre";
  // Every row opening the game adds deletes itself as it shuts.
  const added = new Set(shown.map((p) => p.playerId));
  const closeMs = reducedMotion()
    ? 0
    : Math.max(0, ...shown.filter((p) => added.has(p.playerId)).map((p) => totalChars(playerPieces(p, started)))) * TYPE_MS_PER_CHAR + 60;
  // Each player under the team they play for (anyone else's under the home team).
  const awayPlayers = shown.filter((p) => p.team === game.awayTeam);
  const homePlayers = shown.filter((p) => p.team !== game.awayTeam);

  // Slides to its new height whenever its rows change (opening, shutting).
  const box = useRef<HTMLDivElement>(null);
  const lastHeight = useRef<number | null>(null);
  const lastRows = useRef<string | null>(null);
  const rowsKey = shown.map((p) => p.playerId).join(",");
  // Measured on every render, so the slide starts from the height it really had (its latest play may have come in since).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const next = el.offsetHeight;
    const prev = lastHeight.current;
    const rowsChanged = lastRows.current !== null && lastRows.current !== rowsKey;
    lastHeight.current = next;
    lastRows.current = rowsKey;
    if (!rowsChanged || prev === null || prev === next || reducedMotion()) return;
    el.animate([{ height: `${prev}px`, overflow: "hidden" }, { height: `${next}px`, overflow: "hidden" }], { duration: FOLD_MS, easing: "ease-out" });
  });

  const rows = (list: GroupedStarter[]) =>
    list.length > 0 ? (
      <GameRows
        players={list}
        sortByPoints={!!live}
        render={(player, motion) => (
          <PlayerRow
            player={player}
            legendByLeagueId={legendByLeagueId}
            started={started}
            shown={!hidden && !(closing && added.has(player.playerId))}
            motion={motion}
            sideColors={open && !closing}
          />
        )}
      />
    ) : null;

  const toggle = () => onToggle(game.id, closeMs);
  return (
    // Each game boxed, so one game's players never run into the next's.
    <div
      ref={box}
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? open && !closing : undefined}
      aria-label={`${game.awayTeam} at ${game.homeTeam}${expandable ? (open && !closing ? " — show just your players" : " — show everyone in this game") : ""}`}
      onClick={expandable ? toggle : undefined}
      onKeyDown={
        expandable
          ? (e) => {
              if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
              e.preventDefault();
              toggle();
            }
          : undefined
      }
      className={`flex flex-col gap-0.5 border border-ink-muted/40 px-2 py-1.5 ${
        expandable ? "cursor-pointer transition-colors hover:border-ink-muted" : ""
      }`}
    >
      <TeamLine game={game} side="away" shown={!hidden} />
      {rows(awayPlayers)}
      <TeamLine game={game} side="home" shown={!hidden} />
      {rows(homePlayers)}
      {/* Shut, the latest play one of your players got points on. */}
      {!open && latest ? <LatestScoreRow players={players} latest={latest} hidden={hidden} /> : null}
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
  latestScores,
}: {
  games: GameStarters[];
  notPlaying: GroupedStarter[];
  /** Each game's latest play one of your players got points on, by game id (see useLatestScores). */
  latestScores: Record<string, LatestScore>;
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
  // Games opened up (by tapping the matchup) to everyone in them, and those
  // on their way shut — still open while their added names delete themselves.
  const [openGames, setOpenGames] = useState<Set<string>>(() => new Set());
  const [closingGames, setClosingGames] = useState<Set<string>>(() => new Set());
  const closeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = closeTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  const toggleGame = (gameId: string, closeMs: number) => {
    const without = (set: Set<string>) => {
      const next = new Set(set);
      next.delete(gameId);
      return next;
    };
    if (closingGames.has(gameId)) {
      // Tapped again mid-close: it stays open, and the names type back in.
      clearTimeout(closeTimers.current.get(gameId));
      closeTimers.current.delete(gameId);
      setClosingGames(without);
    } else if (openGames.has(gameId)) {
      setClosingGames((prev) => new Set(prev).add(gameId));
      closeTimers.current.set(
        gameId,
        setTimeout(() => {
          closeTimers.current.delete(gameId);
          setOpenGames(without);
          setClosingGames(without);
        }, closeMs)
      );
    } else {
      setOpenGames((prev) => new Set(prev).add(gameId));
    }
  };
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
                  legendByLeagueId={legendByLeagueId}
                  openGames={openGames}
                  closingGames={closingGames}
                  onToggleGame={toggleGame}
                  latestScores={latestScores}
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
