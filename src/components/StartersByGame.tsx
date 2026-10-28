"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatCountdown } from "@/lib/format";
import { totalChars, typedSlices } from "@/hooks/useTyped";
import { formatKickoffTime, GameStarters, groupGamesByTimeBlock, GroupedStarter, PlayerSide } from "@/lib/my-starters";
import { gameClock, NFLGame } from "@/lib/nfl-schedule";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import { LeagueLegendEntry, LeagueMark } from "./LeagueMark";
import { GameRows, RowMotion } from "./GameRows";
import { FieldSpot, PossessionMark } from "./FieldSpot";
import { Ordinals } from "./Ordinals";
import { LastAction, onPace, paceShare } from "@/lib/live-play-points";
import { GAME_MS } from "./PointsGraph";
import { useLastActions } from "@/hooks/useLastActions";
import { getHomeView, saveHomeView } from "@/lib/localStore";
import { teamColor } from "@/lib/team-colors";
import { positionRows, shortName } from "@/lib/pregame-rows";

export type { LeagueLegendEntry };

function formatPoints(points: number): string {
  return points.toFixed(2);
}

// Whose player it is, by the color of their name: yours green, the ones you're facing red, both yellow.
const SIDE_NAME_COLOR: Record<PlayerSide, string> = {
  mine: "font-semibold text-status-good",
  opponent: "font-semibold text-status-critical",
  both: "font-semibold text-status-warning",
  other: "text-ink-primary",
};

/** A player's points: green while they're on pace for their projection (as their graph reads it) — once the game's over, if they beat it — red otherwise. */
function paceColor(points: number | null, projected: number | null | undefined, share: number | undefined): string {
  const pace = onPace(points, projected, share);
  return pace === null ? "text-ink-primary" : pace ? "text-status-good" : "text-status-critical";
}

/** A projection, to one decimal — set apart from real points, which have two. */
function formatProjection(points: number): string {
  return points.toFixed(1);
}

/**
 * What a team's line shows on its right, in typing order: before kickoff, the
 * kickoff time on the top (away) line and nothing on the bottom; once it's
 * started, the game's status beside each score — on the top line the clock
 * and the quarter ("12:43 2Q") while it runs, otherwise all of it ("Half",
 * "End 2Q", "Final"); on the bottom line the down and distance while the
 * game's on ("2nd & 6") — then the score.
 */
function teamLinePieces(game: NFLGame, side: "away" | "home"): string[] {
  if (game.state === "pre") return side === "away" ? [formatKickoffTime(game.kickoff)] : [];
  const score = String(side === "away" ? game.awayScore : game.homeScore);
  const mine = side === "away" ? topStatus(game) : bottomStatus(game);
  return mine ? [mine, score] : [score];
}

function topStatus(game: NFLGame): string {
  if (game.state === "pre") return formatKickoffTime(game.kickoff);
  const status = game.state === "post" ? "Final" : gameClock(game.statusDetail ?? "");
  const running = /^([1-4]Q|\d*OT) (\d{1,2}:\d{2})$/.exec(status);
  return running ? `${running[2]} ${running[1]}` : status;
}

function bottomStatus(game: NFLGame): string {
  // "1st & 10 at KC 35": just the down and distance — where the ball is shows on the field between the lines.
  return game.state === "in" ? (game.live?.downDistance?.split(" at ")[0] ?? "") : "";
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
 * the edge, inside the players' points — and on the far right the game's
 * status: the quarter on the top line and the clock on the bottom while it
 * runs ("2Q" over "12:43"), otherwise just the top line's ("Half", "Final",
 * or the kickoff time before it starts). Gone while its block is switched
 * off.
 */
function TeamLine({ game, side, shown = true }: { game: NFLGame; side: "away" | "home"; shown?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const pieces = teamLinePieces(game, side);
  const count = shown ? totalChars(pieces) : 0;
  const typed = typedSlices(pieces, count);
  const visible = shown;
  const team = side === "away" ? game.awayTeam : game.homeTeam;
  const record = side === "away" ? game.awayRecord : game.homeRecord;
  const started = game.state !== "pre";
  // The status (or kickoff time) in small muted type, the score as big as the points under it.
  const [status, score] = started ? (pieces.length > 1 ? typed : [null, typed[0]]) : [typed[0] ?? null, null];
  return (
    // Its team's color faint from its own end (see .team-line).
    <div ref={ref} className="team-line flex min-h-[1.375rem] items-center gap-1.5" style={{ ["--team" as string]: teamColor(team) }}>
      <span className="flex w-[2.4em] shrink-0 justify-center text-[0.6875rem]">
        <TeamLogo team={team} visible={visible} />
      </span>
      {/* Its record as of this game — counting it once it's final. */}
      {record ? (
        <span className={`shrink-0 text-xs tabular-nums text-ink-muted transition-opacity duration-150 ${visible ? "" : "opacity-0"}`}>
          {record}
        </span>
      ) : null}
      {/* While it's on, a football after the record of the team with the ball. */}
      {game.state === "in" && game.live?.possession === team ? (
        <span className={`flex w-3 shrink-0 justify-center transition-opacity duration-150 ${visible ? "" : "opacity-0"}`}>
          <PossessionMark />
        </span>
      ) : null}
      <span className="min-w-0 flex-1" />
      {/* The score, over the players' +/- column under it. */}
      <span className="w-[2.4em] shrink-0 text-right text-[0.9375rem] font-bold tabular-nums text-ink-primary">{score}</span>
      {/* The game's status (or kickoff time) on the right. */}
      <StatusColumn game={game} text={status ?? ""} />
    </div>
  );
}

/**
 * A game yet to kick off, on one line: the away team at the left end and the home team at the right (logo
 * outermost, record inside it), the kickoff time between them — each team's color faint at its own end (see
 * .team-bar). The time's gone while its block is switched off.
 */
function PreGameHeader({ game, shown = true }: { game: NFLGame; shown?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const pieces = teamLinePieces(game, "away");
  const [time] = typedSlices(pieces, shown ? totalChars(pieces) : 0);
  const visible = shown;
  const record = (text: string | undefined) =>
    text ? <span className={`shrink-0 text-xs tabular-nums text-ink-muted transition-opacity duration-150 ${visible ? "" : "opacity-0"}`}>{text}</span> : null;
  return (
    <div
      ref={ref}
      className="team-bar grid min-h-[1.375rem] grid-cols-[1fr_auto_1fr] items-center gap-1.5"
      style={{ ["--away" as string]: teamColor(game.awayTeam), ["--home" as string]: teamColor(game.homeTeam) }}
    >
      <span className="flex items-center gap-1.5">
        <span className="flex w-[2.4em] shrink-0 justify-center text-[0.6875rem]">
          <TeamLogo team={game.awayTeam} visible={visible} />
        </span>
        {record(game.awayRecord)}
      </span>
      <span className="whitespace-nowrap text-ink-muted" title={pieces[0]}>
        <StatusText text={time ?? ""} />
      </span>
      <span className="flex items-center justify-end gap-1.5">
        {record(game.homeRecord)}
        <span className="flex w-[2.4em] shrink-0 justify-center text-[0.6875rem]">
          <TeamLogo team={game.homeTeam} visible={visible} />
        </span>
      </span>
    </div>
  );
}

/**
 * A team line's status, on the right: at least as wide as the players' points
 * under it, and as wide as the wider of the two lines' (whole) statuses, so
 * the scores beside them stay in line as they type in.
 */
function StatusColumn({ game, text }: { game: NFLGame; text: string }) {
  return (
    <span className="grid min-w-[2.7625rem] shrink-0 justify-items-end whitespace-nowrap text-ink-muted" title={text || undefined}>
      {[topStatus(game), bottomStatus(game)].map((whole, i) => (
        <span key={i} aria-hidden className="invisible col-start-1 row-start-1 flex items-baseline gap-[0.3em]">
          <StatusText text={whole} />
        </span>
      ))}
      <span className="col-start-1 row-start-1 flex items-baseline gap-[0.3em]">
        <StatusText text={text} />
      </span>
    </span>
  );
}

/**
 * Where the ball is while a game's on (see FieldSpot), on the home team's line,
 * centered between the football (after the wider record) and the scores' digits
 * — laid over the line in columns as wide as those, so it splits the difference.
 */
function BallSpot({ game }: { game: NFLGame }) {
  const live = game.state === "in" ? game.live : null;
  if (!live?.possession || live.yardsToEndzone === undefined) return null;
  const record = [game.awayRecord ?? "", game.homeRecord ?? ""].sort((a, b) => b.length - a.length)[0];
  const score = [String(game.awayScore), String(game.homeScore)].sort((a, b) => b.length - a.length)[0];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[1.375rem] items-center gap-1.5">
      <span className="w-[2.4em] shrink-0 text-[0.6875rem]" />
      {record ? <span className="invisible shrink-0 text-xs tabular-nums">{record}</span> : null}
      {/* Room for the football after the record. */}
      <span className="w-3 shrink-0" />
      <span className="flex min-w-0 flex-1 justify-center">
        <FieldSpot yardsToEndzone={live.yardsToEndzone} homeOffense={live.possession === game.homeTeam} />
      </span>
      {/* The wider score's digits, right-aligned in the score's column as on the team lines. */}
      <span className="invisible shrink-0 text-[0.9375rem] font-bold tabular-nums">{score}</span>
      <span className="invisible">
        <StatusColumn game={game} text="" />
      </span>
    </div>
  );
}

/**
 * A game's status in the row: the clock, then the quarter a hair bigger and
 * outlined ("12:43 [2Q]"); the down and distance, its ordinal raised ("2ⁿᵈ & 6");
 * anything else in small type.
 */
function StatusText({ text }: { text: string }) {
  // Split at the clock as soon as it's typed, so the sizes hold steady while the quarter types in after it
  // (a quarter as it's typed: "2", "2Q", "O", "OT", "2OT" — not a kickoff time's "PM").
  const clock = /^(\d{1,2}:\d{0,2})(?:\s([1-4]Q?|\d*OT?))?$/.exec(text);
  if (clock) {
    return (
      <>
        <span className="text-[0.6875rem] tabular-nums">{clock[1]}</span>
        {clock[2] ? (
          <span className="border border-ink-primary px-0.5 text-[0.75rem] font-semibold uppercase leading-tight text-ink-primary">{clock[2]}</span>
        ) : null}
      </>
    );
  }
  if (/^\d+(st|nd|rd|th)\b/.test(text)) {
    return (
      <span className="text-[0.6875rem] tabular-nums">
        <Ordinals text={text} />
      </span>
    );
  }
  return <span className="text-xs uppercase">{text}</span>;
}

/** Who a box can list: your starters, and everyone worth watching (a game's, see liveGameRows). */
type Listing = Pick<GameStarters, "players" | "everyone">;

/**
 * A box's views, stepped through by tapping its matchup (or set for every box
 * at once from the bar on top): 0, shut (just the teams); 1, Team — your
 * players; 2, VS — yours and the ones you're facing; 3, ALL — everyone worth
 * watching (see liveGameRows).
 */
export function viewPlayers({ players, everyone }: Listing, view: number): GroupedStarter[] {
  const all = everyone ?? players;
  if (view <= 0) return [];
  // Team: just yours, as yours — one you also face elsewhere in green, with only the leagues you have him in.
  if (view === 1)
    return all
      .filter((p) => (p.side ?? "mine") === "mine" || p.side === "both")
      .map((p) => (p.side === "both" ? { ...p, side: "mine" as const, leagueIds: p.leagueIds.filter((id) => !p.facedIn?.includes(id)), facedIn: undefined } : p));
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
 * position, just the first shows, with "+N" for the others. Gone while its
 * box is shut or its block switched off. Shown, the total follows the points
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
  pace,
}: {
  player: GroupedStarter;
  phase: Phase;
  action: LastAction | undefined;
  /** How far along their game is, as their graph's pace line reads it (see paceShare) — while it's on. */
  pace?: number;
  shown: boolean;
  motion: RowMotion;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Their points-over-time graph is up in place of the map. */
  selected?: boolean;
  /** Puts their graph up (or, already up, takes it down) — none for a player with no game. */
  onSelect?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pieces = linePieces(player, phase, action);
  const total = totalChars(pieces);
  const count = (shown ? total : 0);
  const [time, name, position, delta, points] = typedSlices(pieces, count);
  const [typedIn, setTypedIn] = useState(false);
  if (shown && count >= total && !typedIn) setTypedIn(true);
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
  // Whether every logo would reach the name and position, measured once the line's in.
  const middle = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const positionRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const [crowded, setCrowded] = useState(false);
  useLayoutEffect(() => {
    const el = middle.current;
    if (!el || !typedIn || leagueIds.length < 2) return;
    const measure = () => {
      const logos = leagueIds.length * LINE_LOGO_PX + (leagueIds.length - 1) * LINE_LOGO_GAP_PX;
      // The name at its full width, even while it's cut short, a gap either side of the position, and the +/- with its gap.
      const delta = deltaRef.current ? deltaRef.current.offsetWidth + 4 : 0;
      const used = (nameRef.current?.scrollWidth ?? 0) + (positionRef.current?.offsetWidth ?? 0) + 3 * 4 + delta;
      setCrowded(used + logos > el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [typedIn, leagueIds.length, player.name, player.position]);
  // Yours in one league and faced in another: every league, each boxed green (yours) or red (theirs). While the
  // game's on (the +/- to its right), or crowded, just the first league's and "+N" for the rest.
  const both = side === "both";
  const one = phase === "live" || (crowded && !both);
  const logoIds = one ? leagueIds.slice(0, 1) : leagueIds;
  const marks = (
    // Every league: the first on the right, the rest building leftward. Just the first: it, "+N" up off its top
    // right corner, so it keeps its place in the column of logos.
    <span className={`relative flex shrink-0 ${one ? "" : "flex-row-reverse"} items-center gap-0.5 transition-opacity duration-150 ${typedIn ? "" : "opacity-0"}`} aria-hidden>
      {logoIds.map((id) =>
        both ? (
          <span key={id} className={`flex border p-px ${player.facedIn?.includes(id) ? "border-status-critical" : "border-status-good"}`}>
            <LeagueMark league={legendByLeagueId.get(id)} className="h-3 w-3" />
          </span>
        ) : (
          <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
        )
      )}
      {one && leagueIds.length > 1 ? <PlusMore n={leagueIds.length - 1} /> : null}
    </span>
  );

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
          className={`min-w-0 truncate ${SIDE_NAME_COLOR[side]} ${motion.highlight ? `-mx-1 px-1 ${lit}` : ""} ${
            selected ? "underline decoration-2 underline-offset-2" : onSelect ? "decoration-ink-muted hover:underline" : ""
          }`}
        >
          {name || "​"}
        </span>
        <span ref={positionRef} className={`shrink-0 text-[0.5rem] font-semibold uppercase ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"}`}>
          {position}
        </span>
        <span className="min-w-0 flex-1" />
        {/* While the game's on, the leagues ahead of the play's +/-, clear of it; otherwise on the right. */}
        {phase === "live" ? marks : null}
        {phase === "live" ? (
          <span
            ref={deltaRef}
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
        {phase === "live" ? null : marks}
      </span>
      <span
        className={`w-[3.4em] shrink-0 text-right tabular-nums ${
          phase === "pre"
            ? "pr-[0.2em] font-light italic text-ink-muted"
            : // Live, against their pace; over, against the whole projection.
              `font-semibold ${paceColor(player.points, player.projected, phase === "live" ? pace : 1)}`
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
 * A player's line under a game yet to kick off, under their own team: the away team's down the left (name, then
 * their leagues, then the projection at the middle), the home team's mirrored down the right (projection at the
 * middle, then their leagues, then the name at the right end). Gone while its box is shut or its block switched
 * off.
 */
function PreLine({
  player,
  mirrored,
  shown,
  legendByLeagueId,
  selected,
  onSelect,
}: {
  player: GroupedStarter;
  /** On the right, under the home team: its pieces in mirror order. */
  mirrored: boolean;
  shown: boolean;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  selected: boolean;
  onSelect?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const nameBox = useRef<HTMLSpanElement>(null);
  // Their whole name too long for the room their side of the row leaves it (on a phone), cut to their first initial.
  const [cramped, setCramped] = useState(false);
  useLayoutEffect(() => {
    const row = ref.current;
    const box = nameBox.current;
    if (!row || !box) return;
    const check = () => {
      const style = getComputedStyle(row);
      const kids = [...row.children] as HTMLElement[];
      // All else in the row but the space that stretches between.
      const others = kids.reduce((sum, k) => (k === box || getComputedStyle(k).flexGrow !== "0" ? sum : sum + k.offsetWidth), 0);
      const room = row.clientWidth - others - (parseFloat(style.columnGap) || 0) * (kids.length - 1);
      setCramped(textWidth(player.name, getComputedStyle(box)) > room + 0.5);
    };
    check();
    const resize = new ResizeObserver(check);
    resize.observe(row);
    document.fonts?.ready.then(check);
    return () => resize.disconnect();
  }, [player.name]);
  const pieces = [shortName(player.name, player.position), player.position, player.projected != null ? formatProjection(player.projected) : "–"];
  const total = totalChars(pieces);
  const count = (shown ? total : 0);
  const [name, position, projection] = typedSlices(pieces, count);
  const typedIn = shown && count >= total;
  const side = player.side ?? "mine";
  const leagueIds = [...player.leagueIds].sort(
    (x, y) => (legendByLeagueId.get(x)?.colorIndex ?? 0) - (legendByLeagueId.get(y)?.colorIndex ?? 0)
  );
  const leagueNames = leagueIds.map((id) => legendByLeagueId.get(id)?.leagueName ?? id);
  // The first league's logo, boxed green (yours) or red (theirs) for a player who's both; "+N" for the rest.
  const first = leagueIds[0];
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
      className={`flex items-center gap-1 py-[3px] text-[0.8125rem] leading-tight ${mirrored ? "flex-row-reverse" : ""} ${onSelect ? "cursor-pointer" : ""}`}
      title={leagueNames.length > 0 ? `${player.name} — ${leagueNames.join(", ")}` : player.name}
    >
      <span
        ref={nameBox}
        className={`min-w-0 truncate ${SIDE_NAME_COLOR[side]} ${
          selected ? "underline decoration-2 underline-offset-2" : onSelect ? "decoration-ink-muted hover:underline" : ""
        }`}
      >
        {/* On a phone, their whole name where it fits; from tablet width up (a narrower list), their first initial and last name. */}
        {name ? (
          <>
            <span className="md:hidden">{cramped ? name : player.name}</span>
            <span className="hidden md:inline">{name}</span>
          </>
        ) : (
          "​"
        )}
      </span>
      <span className={`shrink-0 text-[0.5rem] font-semibold uppercase ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-muted"}`}>{position}</span>
      <span className="min-w-0 flex-1" />
      {first ? (
        <span className={`relative flex shrink-0 items-center transition-opacity duration-150 ${typedIn ? "" : "opacity-0"}`} aria-hidden>
          {side === "both" ? (
            <span className={`flex border p-px ${player.facedIn?.includes(first) ? "border-status-critical" : "border-status-good"}`}>
              <LeagueMark league={legendByLeagueId.get(first)} className="h-3 w-3" />
            </span>
          ) : (
            <LeagueMark league={legendByLeagueId.get(first)} className="h-3 w-3" />
          )}
          {leagueIds.length > 1 ? <PlusMore n={leagueIds.length - 1} /> : null}
        </span>
      ) : null}
      <span className={`w-[2.4em] shrink-0 font-light italic tabular-nums text-ink-muted ${mirrored ? "text-left" : "text-right"}`}>{projection}</span>
    </div>
  );
}

let measure: CanvasRenderingContext2D | null = null;

/** How wide `text` is set in `style`'s font (px). */
function textWidth(text: string, style: CSSStyleDeclaration): number {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return 0;
  measure.font = style.font;
  const tracking = parseFloat(style.letterSpacing) || 0;
  return measure.measureText(text).width + tracking * text.length;
}

/** "+N" more leagues, small, up off the top right corner of the league logo it's set beside (in a relative box). */
function PlusMore({ n }: { n: number }) {
  return <span className="absolute -right-2.5 -top-1.5 text-[0.5625rem] leading-none tabular-nums text-ink-muted">+{n}</span>;
}

/** How long a box's lines take to go before it shuts. */
function closeMsFor(): number {
  return reducedMotion() ? 0 : 60;
}

/**
 * A kickoff window's games, collapsing when its block is switched off: its
 * lines go, then the block folds shut. Switched back on, it opens with them.
 */
function BlockGames({
  games,
  hidden,
  views,
  closingGames,
  actions,
  paces,
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
  /** How far along each game on now is, by game id (see paceShare). */
  paces: Record<string, number>;
  /** Moves a game to `view`; shutting it once `closeMs` of deleting has played out. */
  onToggleGame: (gameId: string, view: number, closeMs: number) => void;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Games hidden from the map and the Red Zone, by id. */
  offMap: Set<string>;
  onToggleMap: (gameId: string) => void;
  selectedPlayers: { playerId: string; gameId: string }[];
  onSelectPlayer: (playerId: string, gameId: string) => void;
}) {
  // Folded a moment after its lines go.
  const [prevHidden, setPrevHidden] = useState(hidden);
  const [folded, setFolded] = useState(hidden);
  if (hidden !== prevHidden) {
    setPrevHidden(hidden);
    setFolded(false);
  }
  useEffect(() => {
    if (!hidden || folded) return;
    const id = setTimeout(() => setFolded(true), closeMsFor());
    return () => clearTimeout(id);
  }, [hidden, folded]);
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
              teams={{ away: g.game.awayTeam, home: g.game.homeTeam }}
              view={views.get(g.game.id) ?? 0}
              closing={closingGames.has(g.game.id)}
              hidden={hidden}
              actions={actions}
              pace={paces[g.game.id]}
              onToggle={onToggleGame}
              legendByLeagueId={legendByLeagueId}
              map={{ off: offMap.has(g.game.id), onToggle: () => onToggleMap(g.game.id) }}
              selectedPlayerIds={selectedPlayers.filter((p) => p.gameId === g.game.id).map((p) => p.playerId)}
              onSelectPlayer={(playerId) => onSelectPlayer(playerId, g.game.id)}
            >
              {g.game.state === "pre" ? (
                <PreGameHeader game={g.game} shown={!hidden} />
              ) : (
                <>
                  <TeamLine game={g.game} side="away" shown={!hidden} />
                  <TeamLine game={g.game} side="home" shown={!hidden} />
                  <BallSpot game={g.game} />
                </>
              )}
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

/** An eye — or, crossed out, a game hidden from the map and the Red Zone. */
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
 * box slides over to show a button beside it, the way a list row does on iOS.
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
      {/* The button opens from the right edge as the box slides off it — never under the box, which has no
          background of its own to hide it. */}
      <div
        ref={actionRef}
        className={`absolute inset-y-0 right-0 flex justify-end overflow-hidden ${dragging ? "" : "transition-[width] duration-200 ease-out"}`}
        style={{ width: Math.max(0, -offset) }}
      >
        <div className="flex shrink-0 items-stretch" style={{ width: SWIPE_PX }}>
          {action}
        </div>
      </div>
      <div
        className={`relative ${dragging ? "select-none" : "transition-transform duration-200 ease-out"}`}
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
 * height. A game's matchup swipes left to show a button that hides the game
 * from the map and the Red Zone (or brings it back); while it's hidden its
 * matchup dims.
 */
function GameBox({
  id,
  listing,
  phase,
  live,
  label,
  teams,
  view,
  closing,
  hidden,
  actions,
  pace,
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
  /** Its two teams — before kickoff its players split under them. None for a bye. */
  teams?: { away: string; home: string };
  view: number;
  /** On its way shut, its lines deleting themselves first. */
  closing: boolean;
  /** Its time block is switched off. */
  hidden: boolean;
  actions: Record<string, LastAction>;
  /** How far along its game is, while it's on (see paceShare). */
  pace?: number;
  onToggle: (id: string, view: number, closeMs: number) => void;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  /** Whether it's hidden from the map and the Red Zone, and the button that switches that — none for a bye. */
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

  const toggle = () => onToggle(id, next, closeMsFor());
  const nextLabel = ["show just the teams", "show your players", "show yours and the ones you face", "show everyone"][next];
  // The matchup — and only the matchup — steps through the box's views.
  const matchup = (
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
      className={`relative flex flex-col gap-0.5 ${toggleable ? "cursor-pointer transition-opacity hover:opacity-80" : ""}`}
    >
      {children}
    </div>
  );
  // Each game on the room behind, no box of its own: just its words and its field (dimmed while it's hidden). Marked
  // with its game, for the floor to follow (see FloorCameraControls) — not a bye's.
  return (
    <div data-game={map ? id : undefined}>
      <div ref={box} className="flex flex-col px-2 py-1.5">
        {map ? (
          // Just the matchup swipes over, out to the box's edges, to show the button that hides the game.
          <Swipeable
            className="-mx-2 -mt-1.5"
            action={
              <button
                type="button"
                onClick={map.onToggle}
                aria-pressed={!map.off}
                aria-label={`${map.off ? "Show" : "Hide"} ${label} on the map and in the Red Zone`}
                title={`${map.off ? "Show on" : "Hide from"} the map and the Red Zone`}
                className="flex w-full cursor-pointer items-center justify-center bg-[var(--map-tag)] text-[var(--map-tag-ink)] transition-opacity hover:opacity-90"
              >
                <EyeIcon off={map.off} />
              </button>
            }
          >
            <div className={`px-2 pt-1.5 ${map.off ? "opacity-50" : ""}`}>{matchup}</div>
          </Swipeable>
        ) : (
          matchup
        )}
        {/* The players its view lists, set apart below the teams: before kickoff, each under their own team, their
            projections meeting in the middle — under ALL, lined up by position across the two (see positionRows). */}
        {shown.length > 0 && phase === "pre" && teams && view === 3 ? (
          <div className="mt-1 grid grid-cols-2 gap-x-4 pt-1">
            {positionRows(shown, teams.home).flatMap((row, r) =>
              row.map((player, i) =>
                player ? (
                  <PreLine
                    key={player.playerId}
                    player={player}
                    mirrored={i === 1}
                    shown={!hidden && !closing}
                    legendByLeagueId={legendByLeagueId}
                    selected={selectedPlayerIds.includes(player.playerId)}
                    onSelect={onSelectPlayer ? () => onSelectPlayer(player.playerId) : undefined}
                  />
                ) : (
                  <span key={`${r}-${i}`} />
                )
              )
            )}
          </div>
        ) : shown.length > 0 && phase === "pre" && teams ? (
          <div className="mt-1 grid grid-cols-2 gap-x-4 pt-1">
            {[shown.filter((p) => p.team !== teams.home), shown.filter((p) => p.team === teams.home)].map((column, i) => (
              <div key={i} className="flex min-w-0 flex-col">
                {column.map((player) => (
                  <PreLine
                    key={player.playerId}
                    player={player}
                    mirrored={i === 1}
                    shown={!hidden && !closing}
                    legendByLeagueId={legendByLeagueId}
                    selected={selectedPlayerIds.includes(player.playerId)}
                    onSelect={onSelectPlayer ? () => onSelectPlayer(player.playerId) : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : shown.length > 0 ? (
          <div className="mt-1 pt-1">
            <GameRows
              players={shown}
              sortByPoints={live}
              render={(player, motion) => (
                <GameLine
                  player={player}
                  phase={phase}
                  action={actions[player.playerId]}
                  pace={pace}
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
    </div>
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
  const name = team ?? "No team";
  const count = (shown ? name.length : 0);
  return (
    <div ref={ref} className="flex min-h-[1.375rem] items-center gap-1.5">
      {team ? (
        <span className="flex w-[2.4em] shrink-0 justify-center text-[0.6875rem]">
          <TeamLogo team={team} visible={shown} />
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
          const toggle = () => onToggle(id, next, closeMsFor());
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
              // An open one stands out in bold ink, to tie it to its players below.
              className={`min-w-0 px-2 py-1.5 ${open ? "font-bold text-ink-primary" : ""} ${toggleable ? "cursor-pointer transition-opacity hover:opacity-80" : ""}`}
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
          <div key={id} className="flex flex-col px-2 py-1.5">
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
  onViewsChange,
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
  /** Games hidden from the map and the Red Zone one at a time (their matchups swiped over), by id. */
  offMap: Set<string>;
  /** Takes one game off the map, or puts it back. */
  onToggleMap: (gameId: string) => void;
  /** The players whose points-over-time graphs are up in place of the map. */
  selectedPlayers: { playerId: string; gameId: string }[];
  /** Puts a player's graph up (up to four), or — theirs already up — takes it down. */
  onSelectPlayer: (playerId: string, gameId: string) => void;
  /** Told each box's view (see viewPlayers) whenever one changes, by id — shut when missing — so the map can count the same players. */
  onViewsChange?: (views: Map<string, number>) => void;
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
  // The view the bar on top last set every box to, until a box is tapped on its own — opening as
  // last left on this browser (Team, the first time), every box that lists anyone in it.
  const [barView, setBarView] = useState<number | null>(() => (getHomeView().startersView ?? 1) || null);
  const openTo = (view: number, ids: { id: string; listing: Listing }[]) =>
    ids.filter((box) => viewCycle(box.listing).length > 1).map((box) => [box.id, view] as const);
  const [views, setViews] = useState<Map<string, number>>(() => new Map(barView ? openTo(barView, boxes) : []));
  const [closingGames, setClosingGames] = useState<Set<string>>(() => new Set());
  // Boxes with someone to list only once the live lines come in open to the bar's view too.
  const boxIds = boxes.filter((box) => viewCycle(box.listing).length > 1).map((box) => box.id).join(",");
  const [prevBoxIds, setPrevBoxIds] = useState(boxIds);
  if (boxIds !== prevBoxIds) {
    setPrevBoxIds(boxIds);
    const known = new Set(prevBoxIds.split(","));
    const added = boxes.filter((box) => !known.has(box.id));
    if (barView && added.length > 0) setViews((prev) => new Map([...prev, ...openTo(barView, added)]));
  }
  useEffect(() => onViewsChange?.(views), [views, onViewsChange]);
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
    saveHomeView({ startersView: view });
    closeTimers.current.forEach((t) => clearTimeout(t));
    closeTimers.current.clear();
    setClosingGames(new Set());
    setViews(new Map(openTo(view, boxes)));
  };
  // The blocks in kickoff order — a finished one folds shut where it is (see the page's hiddenBlocks).
  const columns = groupGamesByTimeBlock(games);
  // The view every box in sight is showing, however each got there (the bar, or tapped one by one) — lit on
  // the bar. A box shows a view when it lists just who that view would: one with none of yours "shows" Team shut.
  const folded = new Set(columns.filter((c) => hiddenBlocks.has(c.label)).flatMap((c) => c.games.map((g) => g.game.id)));
  const shownView = (() => {
    const toggleable = boxes.filter((box) => viewCycle(box.listing).length > 1 && !folded.has(box.id));
    if (toggleable.length === 0) return barView;
    const showing = (view: number) =>
      toggleable.every(
        (box) => !closingGames.has(box.id) && viewPlayers(box.listing, views.get(box.id) ?? 0).length === viewPlayers(box.listing, view).length
      );
    if (barView !== null && showing(barView)) return barView;
    return [1, 2, 3].find(showing) ?? null;
  })();
  // The bar: every box to one view at once — or, the view they're all showing tapped, every box shut.
  const setAllViews = (view: number) => {
    if (view === shownView) {
      setBarView(null);
      saveHomeView({ startersView: 0 });
      for (const box of boxes) {
        const current = views.get(box.id) ?? 0;
        if (current === 0 || closingGames.has(box.id)) continue;
        shut(box.id, closeMsFor());
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
  const { actions, playsByGame } = useLastActions(followed);
  const now = useNow();
  // How far along each game on now is, for whether its players are on pace.
  const paces: Record<string, number> = {};
  for (const g of followed) {
    if (g.game.state === "in" && now !== null) paces[g.game.id] = paceShare(new Date(g.game.kickoff).getTime(), playsByGame[g.game.id] ?? [], now, GAME_MS);
  }
  const nothingToShow = games.length === 0 && byes.every((b) => b.everyone.length === 0);
  // A block's header, and the bye's: styled like the map's game tags, the same solid contrasting fill and ink.
  const headerBar = "flex w-full items-baseline justify-between gap-2 bg-[var(--title-plate)] px-2 py-1 text-left text-xs font-bold uppercase tracking-wide text-[var(--map-tag-ink)]";

  return (
    // Room over the bar, under the ticker; the games start right under it.
    <div className="flex flex-col gap-0.5 md:pt-3.5">
      {nothingToShow ? null : (
        // Every box to one view at once.
        <div className="grid grid-cols-3" role="group" aria-label="Show in every game">
          {VIEW_NAMES.map(([view, name]) => (
            <button
              key={view}
              type="button"
              onClick={() => setAllViews(view)}
              aria-pressed={shownView === view}
              className={`cursor-pointer py-1 text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-80 ${
                shownView === view ? "bg-[var(--title-plate)] text-[var(--map-tag-ink)]" : "text-ink-secondary"
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
                paces={paces}
                onToggleGame={toggleGame}
                legendByLeagueId={legendByLeagueId}
                offMap={offMap}
                onToggleMap={onToggleMap}
                selectedPlayers={selectedPlayers}
                onSelectPlayer={onSelectPlayer}
              />
            </div>
          ))}

          {/* The byes, always last. */}
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
