"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { LeagueLegendEntry, LeagueMark } from "@/components/LeagueMark";
import { replayRedZonePlay } from "@/components/GameRows";
import { FeedEntry, FeedScope, RedZoneNow, useRedZoneFeed } from "@/hooks/useRedZoneFeed";
import { useLiveMode } from "@/hooks/useLiveTick";
import { useTeamPlayers } from "@/hooks/useTeamPlayers";
import { GameStarters, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { formatPlayPoints } from "@/lib/play-points";
import { yardLineLabel } from "@/lib/play-by-play";
import { PlayLine, statLine } from "@/lib/play-lines";
import { nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";

const PAGE = 30;

function TeamLogo({ team, side = 16 }: { team: string; side?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
    <img
      src={nflLogoUrl(team)}
      alt={team}
      title={team}
      loading="lazy"
      draggable={false}
      {...nflLogoSize(team, side)}
      className="shrink-0 object-contain"
    />
  );
}

/** A starter's name as the alerts show it — a team defense by its team. */
function displayName(p: GroupedStarter): string {
  return p.position === "DEF" && p.team ? `${p.team} D/ST` : p.name;
}

function periodLabel(period: number): string {
  if (period <= 0) return "";
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

/** When in the game a play happened: "Q2 4:31", or the scoreboard's own line for a play just in. */
function whenLabel(entry: FeedEntry): string {
  const { play, game } = entry;
  if (play.period > 0) return `${periodLabel(play.period)} ${play.clock}`.trim();
  return game.statusDetail ?? "Live";
}

const POINTS_TITLE =
  "Standard PPR points, worked out from ESPN's play-by-play — your league's scoring, and Sleeper's official numbers, can differ.";

function deltaClass(delta: number): string {
  return delta > 0 ? "text-status-good" : delta < 0 ? "text-status-critical" : "text-ink-muted";
}

/** The player's game total through a play, on the app's highlight plate. */
function TotalChip({ total }: { total: number }) {
  return (
    // The same size as the player's name, and exactly as tall as their photo.
    <span className="flex h-[1.125rem] items-center bg-[var(--map-tag)] px-1.5 text-[0.8125rem] font-bold leading-none tabular-nums text-[var(--map-tag-ink)]">
      {total.toFixed(2)}
    </span>
  );
}

/**
 * What the play was worth to one person: the points it earned (green up, red
 * down, for your starters), then their PPR total for the game through this
 * play, highlighted.
 */
function LinePoints({ line, mine, at }: { line: PlayLine; mine: boolean; at: number }) {
  if (line.delta === null || line.total === null) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap leading-none tabular-nums" title={POINTS_TITLE}>
      {/* Tagged so the starters list can find it and light it up as it applies it to this player's total. */}
      <span
        {...(line.playerId ? { "data-rz-player": line.playerId } : { "data-rz-actor": line.label ?? "", "data-rz-team": line.team ?? "" })}
        data-rz-delta={line.delta}
        data-rz-at={at}
        // The total's type, not bold (green or red for your own player's).
        className={`text-[0.8125rem] ${mine ? deltaClass(line.delta) : "text-ink-secondary"}`}
      >
        {formatPlayPoints(line.delta)}
      </span>
      <TotalChip total={line.total} />
    </span>
  );
}

/**
 * One person in a play: their photo (a defense's logo), position and name,
 * the leagues you start them in, how their game is going, and what the play
 * was worth to them.
 */
function PlayerLine({
  line,
  starter,
  legendByLeagueId,
  at,
}: {
  line: PlayLine;
  /** Set when they're one of your starters. */
  starter: GroupedStarter | undefined;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  at: number;
}) {
  const defense = line.position === "DEF";
  // Their game as it stood once this play was over.
  const summary = statLine(line.position, line.stats ?? undefined);
  return (
    <li className="flex items-center gap-2">
      {defense && line.team ? (
        <span className="flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-page">
          <TeamLogo team={line.team} side={13} />
        </span>
      ) : line.playerId ? (
        <PlayerHeadshot playerId={line.playerId} size={18} />
      ) : (
        <span className="h-[1.125rem] w-[1.125rem] shrink-0 rounded-full border border-border bg-page" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
        {line.position ? (
          <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[line.position] ?? "text-ink-muted"}`}>
            {line.position}
          </span>
        ) : null}
        <span data-rz-name className="min-w-0 break-words text-[0.8125rem] font-bold text-ink-primary max-md:leading-tight">
          {line.name}
        </span>
        {starter && starter.leagueIds.length > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5 self-center">
            {starter.leagueIds.map((id) => (
              <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
            ))}
          </span>
        ) : null}
        {/* On phones the stat line always gets a line of its own (kept, empty, for someone without one), so every player is the same height. */}
        {summary ? (
          <span className="whitespace-nowrap text-[0.6875rem] tabular-nums text-ink-muted max-md:basis-full max-md:leading-tight">{summary}</span>
        ) : (
          <span className="hidden text-[0.6875rem] max-md:block max-md:basis-full max-md:leading-tight" aria-hidden>
            {"\u00a0"}
          </span>
        )}
      </span>
      <LinePoints line={line} mine={!!starter} at={at} />
    </li>
  );
}

/** A scoring play's short name: TD, FG, SAF, or 2PT for a two-point try. */
function scoreLabel(type: string, text: string): string {
  const both = `${type} ${text}`;
  if (/touchdown/i.test(both)) return "TD";
  if (/field goal/i.test(both)) return "FG";
  if (/safety/i.test(both)) return "SAF";
  if (/two-point/i.test(both)) return "2PT";
  return "PTS";
}

/** One of a play's marks: its abbreviation, and the color it's drawn in. */
interface PlayMark {
  label: string;
  /** Classes for its fill and the ink on it. */
  className: string;
}

/**
 * Each play's marks, abbreviated: a score (TD/FG/SAF/2PT, green), a turnover
 * (TO — green when it's your defense taking the ball away, red when your
 * player gave it up), a red-zone snap (RZ, red), a long gain (+21, in ink).
 */
function playMarks(entry: FeedEntry): PlayMark[] {
  const { play, players } = entry;
  const defense = players.length > 0 && players.every((p) => p.position === "DEF");
  const marks: PlayMark[] = [];
  if (play.scoring) marks.push({ label: scoreLabel(play.type, play.text), className: "bg-status-good text-white" });
  if (play.turnover) marks.push({ label: "TO", className: defense ? "bg-status-good text-white" : "bg-status-critical text-white" });
  if (play.redZone && !play.scoring) marks.push({ label: "RZ", className: "bg-status-critical text-white" });
  if (play.yards >= 20 && !play.scoring) marks.push({ label: `+${play.yards}`, className: "bg-ink-primary text-surface-raised" });
  return marks;
}

/**
 * A marked play's strip down the left of its row, in its first mark's color.
 * The marks' abbreviations are only read out, for now.
 */
function MarkColumn({ marks }: { marks: PlayMark[] }) {
  if (marks.length === 0) return null;
  return (
    <span className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${marks[0].className}`}>
      <span className="sr-only">{marks.map((m) => m.label).join(", ")}</span>
    </span>
  );
}

/** The field line's thickness. */
const FIELD_LINE = 1.5;

/**
 * Where on the field the ball was snapped, as a little diagram: the field a
 * green line with short green ticks at the two goal lines and the 50 — half
 * the line's height, so the yard line fits above them — and a slim triangle
 * at the ball, pointing the way the offense is going, its yard line centered
 * over it. ESPN doesn't say which end of the stadium a team is attacking
 * (teams switch ends every quarter), so the field is laid out the same way all
 * game: the home team's goal line on the left, the home team driving right
 * and the visitors left.
 */
function FieldSpot({ yardsToEndzone, homeOffense }: { yardsToEndzone: number; homeOffense: boolean }) {
  const left = 2;
  const right = 62;
  const ground = 13.5;
  // How far the ball is from the home team's goal line, 0–100.
  const fromHomeGoal = homeOffense ? 100 - yardsToEndzone : yardsToEndzone;
  const x = left + ((right - left) * fromHomeGoal) / 100;
  const yard = Math.min(yardsToEndzone, 100 - yardsToEndzone);
  // A triangle longer than it is wide, centered on the ball, its tip toward the goal it's driving at.
  const dir = homeOffense ? 1 : -1;
  const half = 2.75;
  const wide = 1.6;
  return (
    <svg viewBox="0 0 64 15" className="h-[0.9375rem] w-16 shrink-0 overflow-visible" aria-hidden>
      {/* The ticks run down to the field line's bottom edge, flush with it. */}
      {[left, (left + right) / 2, right].map((tx) => (
        <line key={tx} x1={tx} y1={ground + FIELD_LINE / 2} x2={tx} y2={ground - 4.5} stroke="var(--color-status-good)" strokeWidth={1} />
      ))}
      <line x1={left} y1={ground} x2={right} y2={ground} stroke="var(--color-status-good)" strokeWidth={FIELD_LINE} />
      <path
        d={`M${x + dir * half},${ground} L${x - dir * half},${ground - wide} L${x - dir * half},${ground + wide} Z`}
        fill="var(--color-ink-primary)"
      />
      {/* Always centered over the ball, even at the goal line. */}
      <text x={x} y={6.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--color-ink-primary)" className="tabular-nums">
        {yard}
      </text>
    </svg>
  );
}

/** The time of day a play happened, e.g. "1:42 PM". */
function clockTime(at: number | null): string {
  return at === null ? "" : new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * One play: when it happened and the matchup along the top, with the snap
 * across from them — the down and distance, where on the field, the quarter
 * and clock; then a line for each person in it; then ESPN's description, led
 * by the team with the ball. A play
 * that arrives while you watch slides in and washes its row in the theme's
 * ink — green for a good one for you.
 */
function FeedRow({
  entry,
  starterById,
  legendByLeagueId,
  arrivedLive,
  index,
}: {
  entry: FeedEntry;
  starterById: Map<string, GroupedStarter>;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  arrivedLive: boolean;
  index: number;
}) {
  // Decided once, when the row first appears.
  const [live] = useState(arrivedLive);
  const { play, players, lines, game } = entry;
  const hasPoints = lines.some((l) => !!l.delta);
  const good = play.scoring || (play.turnover && players.length > 0 && players.every((p) => p.position === "DEF"));
  const time = clockTime(play.at);
  const defense = play.offense ? ([game.homeTeam, game.awayTeam].find((t) => t !== play.offense) ?? null) : null;
  const spot = yardLineLabel(play, defense);
  return (
    // Tapping a play (on desktop) replays its points being applied in the starters list.
    <li
      onClick={(e) => replayRedZonePlay(e.currentTarget)}
      title={hasPoints ? "Replay" : undefined}
      // Every row leaves room down its left for a marked play's strip (see MarkColumn).
      className={`relative flex flex-col gap-1 border-b border-border py-2 pl-3 pr-1 last:border-b-0 ${hasPoints ? "md:cursor-pointer md:hover:bg-[color-mix(in_srgb,var(--ink-primary)_4%,transparent)]" : ""}`}
      style={{
        animation: live
          ? "rise 0.35s ease-out backwards, rz-flash 2.4s ease-out"
          : `rise 0.4s ease-out ${Math.min(index, 10) * 40}ms backwards`,
        // A new play flashes in the theme's ink (black, or white in dark mode); a good one for you, green.
        ["--rz-flash" as string]: good ? "var(--status-good)" : "var(--ink-primary)",
      }}
    >
      <MarkColumn marks={playMarks(entry)} />
      <span className="flex items-center justify-between gap-2 text-[0.6875rem] leading-none">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          {time ? <span className="tabular-nums text-ink-muted">{time}</span> : null}
          <span className="flex items-center gap-1" title={`${game.awayTeam} @ ${game.homeTeam}`}>
            <TeamLogo team={game.awayTeam} side={14} />
            <span className="text-ink-muted">@</span>
            <TeamLogo team={game.homeTeam} side={14} />
          </span>
        </span>
        {/* The snap: down and distance, where on the field (see FieldSpot), then when. */}
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap tabular-nums text-ink-muted">
          {play.downDistance ? <span className="font-semibold text-ink-secondary">{play.downDistance}</span> : null}
          {play.yardsToEndzone !== undefined ? (
            <span className="flex items-center" title={spot ? `Snapped from the ${spot}` : undefined}>
              <FieldSpot yardsToEndzone={play.yardsToEndzone} homeOffense={play.offense === game.homeTeam} />
            </span>
          ) : null}
          <span>{whenLabel(entry)}</span>
        </span>
      </span>
      {lines.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {lines.map((line) => (
            <PlayerLine
              key={line.key}
              line={line}
              starter={line.playerId ? starterById.get(line.playerId) : undefined}
              legendByLeagueId={legendByLeagueId}
              at={play.at ?? 0}
            />
          ))}
        </ul>
      ) : null}
      {/* What happened, led by the team with the ball. */}
      <span className="break-words text-[0.75rem] leading-snug text-ink-secondary">
        {play.offense ? (
          <span className="mr-1.5 inline-flex translate-y-[0.15em] align-baseline">
            <TeamLogo team={play.offense} side={14} />
          </span>
        ) : null}
        {play.text}
      </span>
    </li>
  );
}

/** Who on your side has the ball inside the 20 right now. */
function RedZoneAlert({ alert }: { alert: RedZoneNow }) {
  return (
    <li
      className="flex items-center gap-2 bg-[color-mix(in_srgb,var(--status-critical)_12%,transparent)] py-1.5 pl-3 pr-2 animate-[rz-pulse_1.6s_ease-in-out_infinite]"
      aria-label={`${alert.team} in the red zone${alert.downDistance ? `, ${alert.downDistance}` : ""}`}
    >
      <TeamLogo team={alert.team} side={18} />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] font-bold uppercase tracking-wide text-status-critical">
          {alert.downDistance ?? `${alert.team} in the red zone`}
        </span>
        <span className="block break-words text-[0.75rem] text-ink-primary">
          {alert.players.length > 0 ? alert.players.map(displayName).join(", ") : `${alert.game.awayTeam} @ ${alert.game.homeTeam}`}
        </span>
      </span>
      <span className="flex shrink-0 -space-x-2">
        {alert.players.slice(0, 4).map((p) => (
          <span key={p.playerId} className="rounded-full ring-2 ring-surface-raised">
            <PlayerHeadshot playerId={p.playerId} size={24} />
          </span>
        ))}
      </span>
    </li>
  );
}

/** How many plays the phone's live box shows at once. */
const PHONE_ROWS = 3;

/** Which plays the Red Zone shows: your starters', theirs and the ones you face too, or every play. */
export type RedZoneScope = "mine" | "vs" | "all";

// What the Red Zone is showing, named as the bar over the starters list names it.
const SCOPE_NAMES: Record<RedZoneScope, string> = { mine: "Team", vs: "VS", all: "All" };

/**
 * The Red Zone: plays as they happen, newest on top — the ones your starters
 * are part of (Team), those and the ones your opponents' starters are (VS),
 * or every play of every game (All), as the bar over the starters list sets
 * it (named in the top right) — and, pinned
 * above them, the games where a team has the ball inside the 20. Follows the
 * shared live clock, so it moves with the scores everywhere else on the page.
 */
export function RedZone({
  starters,
  opponents,
  weekGames,
  legend,
  weekStats,
  compactOnPhone = false,
  scope,
}: {
  /** Your starters, grouped by the game they're playing in. */
  starters: GameStarters[];
  /** The starters you're facing, grouped the same way — their plays join yours under VS. */
  opponents: GameStarters[];
  /** Which plays to show — set by the Team / VS / ALL bar over the starters list. */
  scope: RedZoneScope;
  /** Every game of the week. */
  weekGames: NFLGame[];
  legend: LeagueLegendEntry[];
  /** Everyone's stat line so far this week, by Sleeper id — who's played tells which of ESPN's names is likeliest who. */
  weekStats: Record<string, Record<string, number>>;
  /** On phones, show the plays in a box three rows tall that scrolls on its own, instead of running down the page. */
  compactOnPhone?: boolean;
}) {
  const mode = useLiveMode();
  const teamPlayers = useTeamPlayers(weekStats);
  // Under VS, the plays of your starters and the ones you face alike.
  const followed = useMemo<GameStarters[]>(() => {
    if (scope !== "vs") return starters;
    const byGame = new Map<string, GameStarters>(starters.map((g) => [g.game.id, { ...g, players: [...g.players] }]));
    for (const g of opponents) {
      const entry = byGame.get(g.game.id) ?? { game: g.game, players: [] };
      for (const p of g.players) if (!entry.players.some((q) => q.playerId === p.playerId)) entry.players.push(p);
      byGame.set(g.game.id, entry);
    }
    return [...byGame.values()];
  }, [scope, starters, opponents]);
  const feedScope: FeedScope = scope === "all" ? "all" : "mine";
  const feed = useRedZoneFeed(followed, weekGames, feedScope, teamPlayers);
  const starterById = useMemo(() => new Map(starters.flatMap((g) => g.players.map((p) => [p.playerId, p] as const))), [starters]);
  const [shown, setShown] = useState(PAGE);
  // Plays already on hand when the feed fills in just slide in; ones that arrive after that flash.
  const [settled, setSettled] = useState(false);
  const hasEntries = feed.entries.length > 0;
  useEffect(() => {
    if (!hasEntries || settled) return;
    const id = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(id);
  }, [hasEntries, settled]);
  // The phone box is exactly as tall as its first three rows — measured, since rows wrap to different heights.
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    const list = listRef.current;
    if (!compactOnPhone || !box || !list) return;
    const measure = () => {
      const rows = Array.from(list.children).slice(0, PHONE_ROWS) as HTMLElement[];
      const height = rows.reduce((sum, row) => sum + row.offsetHeight, 0);
      if (height > 0) box.style.setProperty("--rz-box-h", `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [compactOnPhone, hasEntries]);
  const moreToShow = feed.entries.length > shown;
  // Scrolling near the end of the plays loads the next page of them — no button.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [moreToShow, shown]);

  // A new scope, picked on the starters list's bar, starts the plays over from the top.
  const [prevScope, setPrevScope] = useState(scope);
  if (scope !== prevScope) {
    setPrevScope(scope);
    setShown(PAGE);
    setSettled(false);
  }
  useEffect(() => {
    boxRef.current?.scrollTo({ top: 0 });
  }, [scope]);

  const legendByLeagueId = new Map(legend.map((l) => [l.leagueId, l]));
  const entries = feed.entries;
  const live = mode === "live";
  const anyStarted =
    scope === "all" ? weekGames.some((g) => g.state !== "pre") : followed.some((g) => g.game.state !== "pre" && g.players.length > 0);

  return (
    // The plays run on down the page (or, side by side, the map's column),
    // with the title and anything in the red zone now sticking at the top as
    // they pass under it — so one swipe carries straight on from the page into
    // the plays. On a phone with a game on, they sit in a short box of their own instead.
    <Card className="flex flex-col gap-2 p-3">
      <div
        className={`z-10 -mx-3 -mt-3 flex flex-col gap-2 border-b border-border bg-surface-raised px-3 pb-2 pt-3 md:sticky md:top-0 ${
          compactOnPhone ? "" : "max-md:sticky max-md:top-[calc(var(--header-h,0px)+var(--ticker-h,0px))]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              {live ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-critical opacity-60" /> : null}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-status-critical" : "bg-ink-muted"}`} />
            </span>
            <span className="whitespace-nowrap text-sm font-bold uppercase tracking-[0.2em] text-ink-primary">Red Zone</span>
          </h2>
          {/* What it's showing — set by the bar over the starters list. */}
          <span className="shrink-0 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-secondary" aria-label={`Showing: ${SCOPE_NAMES[scope]}`}>
            {SCOPE_NAMES[scope]}
          </span>
        </div>

        {feed.redZone.length > 0 ? (
          <ul className="flex flex-col gap-1" aria-label="In the red zone now">
            {feed.redZone.map((alert) => (
              <RedZoneAlert key={alert.game.id} alert={alert} />
            ))}
          </ul>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <>
          <div
            ref={boxRef}
            className={
              `relative ${compactOnPhone ? "max-md:max-h-[var(--rz-box-h,15rem)] max-md:overflow-y-auto max-md:overscroll-contain max-md:border-b max-md:border-border" : ""}`
            }
          >
            <ol ref={listRef} className="flex flex-col" aria-label={scope === "mine" ? "Plays your starters were part of" : scope === "vs" ? "Plays your starters or the ones you face were part of" : "Every play"} aria-live="polite">
              {entries.slice(0, shown).map((entry, i) => (
                <FeedRow
                  key={`${entry.game.id}-${entry.play.id}`}
                  entry={entry}
                  starterById={starterById}
                  legendByLeagueId={legendByLeagueId}
                  arrivedLive={settled}
                  index={i}
                />
              ))}
            </ol>
            {/* The last screen or so of plays: scrolling into it brings in the next ones before you reach the end. */}
            {entries.length > shown ? <div ref={sentinelRef} className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(60rem,100%)]" aria-hidden /> : null}
          </div>
        </>
      ) : (
        <p className="py-3 text-center text-xs text-ink-muted">
          {feed.loading
            ? "Loading play-by-play…"
            : !anyStarted
              ? scope === "mine"
                ? "Plays your starters are part of land here as they happen, once their games kick off."
                : scope === "vs"
                  ? "Plays your starters and the ones you face are part of land here as they happen, once their games kick off."
                  : "Every play lands here as it happens, once the week's games kick off."
              : scope === "mine"
                ? "No plays from your starters yet."
                : scope === "vs"
                  ? "No plays from your starters or the ones you face yet."
                  : "No plays yet."}
        </p>
      )}
    </Card>
  );
}
