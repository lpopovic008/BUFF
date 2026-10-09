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
    <span className="bg-[var(--map-tag)] px-1 py-px text-[0.6875rem] font-bold tabular-nums text-[var(--map-tag-ink)]">{total.toFixed(2)}</span>
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
      {/* Tagged so the starters list can fly a copy of it over to this player's total. */}
      <span
        {...(line.playerId ? { "data-rz-player": line.playerId } : { "data-rz-actor": line.label ?? "", "data-rz-team": line.team ?? "" })}
        data-rz-delta={line.delta}
        data-rz-at={at}
        className={`text-sm font-bold ${mine ? deltaClass(line.delta) : "text-ink-primary"}`}
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
  stats,
  legendByLeagueId,
  at,
}: {
  line: PlayLine;
  /** Set when they're one of your starters. */
  starter: GroupedStarter | undefined;
  stats: Record<string, number> | undefined;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  at: number;
}) {
  const defense = line.position === "DEF";
  const summary = statLine(line.position, stats);
  return (
    <li className="flex items-center gap-2">
      {defense && line.team ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-page">
          <TeamLogo team={line.team} side={16} />
        </span>
      ) : line.playerId ? (
        <PlayerHeadshot playerId={line.playerId} size={24} />
      ) : (
        <span className="h-6 w-6 shrink-0 rounded-full border border-border bg-page" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
        {line.position ? (
          <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[line.position] ?? "text-ink-muted"}`}>
            {line.position}
          </span>
        ) : null}
        <span className="min-w-0 break-words text-[0.8125rem] font-bold text-ink-primary">{line.name}</span>
        {starter && starter.leagueIds.length > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5 self-center">
            {starter.leagueIds.map((id) => (
              <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
            ))}
          </span>
        ) : null}
        {/* On phones the stat line always gets a line of its own (kept, empty, for someone without one), so every player is the same height. */}
        {summary ? (
          <span className="whitespace-nowrap text-[0.6875rem] tabular-nums text-ink-muted max-md:basis-full">{summary}</span>
        ) : (
          <span className="hidden text-[0.6875rem] max-md:block max-md:basis-full" aria-hidden>
            {"\u00a0"}
          </span>
        )}
      </span>
      <LinePoints line={line} mine={!!starter} at={at} />
    </li>
  );
}

function Badge({ children, className }: { children: string; className: string }) {
  return <span className={`px-1 py-px text-[0.625rem] font-bold uppercase leading-none tracking-wide ${className}`}>{children}</span>;
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

/**
 * Each play's marks, abbreviated: a score (TD/FG/SAF), a turnover (TO — green
 * when it's your defense taking the ball away, red when your player gave it
 * up), a red-zone snap (RZ), a long gain (+21).
 */
function PlayBadges({ entry }: { entry: FeedEntry }) {
  const { play, players } = entry;
  const defense = players.length > 0 && players.every((p) => p.position === "DEF");
  return (
    <>
      {play.scoring ? <Badge className="bg-status-good text-white">{scoreLabel(play.type, play.text)}</Badge> : null}
      {play.turnover ? (
        <Badge className={defense ? "bg-status-good text-white" : "bg-status-critical text-white"}>TO</Badge>
      ) : null}
      {play.redZone && !play.scoring ? <Badge className="border border-status-critical text-status-critical">RZ</Badge> : null}
      {play.yards >= 20 && !play.scoring ? <Badge className="border border-ink-muted text-ink-secondary">{`+${play.yards}`}</Badge> : null}
    </>
  );
}

/** The time of day a play happened, e.g. "1:42 PM". */
function clockTime(at: number | null): string {
  return at === null ? "" : new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * One play: when it happened, the team with the ball and the matchup on top
 * (the down and distance it was snapped on, and the game clock, across from
 * them); a line for each person in it; ESPN's description underneath. A play
 * that arrives while you watch slides in and washes its row in the theme's
 * ink — green for a good one for you.
 */
function FeedRow({
  entry,
  starterById,
  weekStats,
  legendByLeagueId,
  arrivedLive,
  index,
}: {
  entry: FeedEntry;
  starterById: Map<string, GroupedStarter>;
  weekStats: Record<string, Record<string, number>>;
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
  const team = play.offense ?? game.awayTeam;
  return (
    // Tapping a play (on desktop) replays its points flying over to the starters list.
    <li
      onClick={(e) => replayRedZonePlay(e.currentTarget)}
      title={hasPoints ? "Replay" : undefined}
      className={`flex flex-col gap-1.5 border-b border-border py-2 pr-1 last:border-b-0 ${
        play.scoring ? "pl-2.5 shadow-[inset_3px_0_0_var(--status-good)]" : "pl-1"
      } ${hasPoints ? "md:cursor-pointer md:hover:bg-[color-mix(in_srgb,var(--ink-primary)_4%,transparent)]" : ""}`}
      style={{
        animation: live
          ? "rise 0.35s ease-out backwards, rz-flash 2.4s ease-out"
          : `rise 0.4s ease-out ${Math.min(index, 10) * 40}ms backwards`,
        // A new play flashes in the theme's ink (black, or white in dark mode); a good one for you, green.
        ["--rz-flash" as string]: good ? "var(--status-good)" : "var(--ink-primary)",
      }}
    >
      <span className="flex items-center justify-between gap-2 text-[0.6875rem] leading-none">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          {time ? <span className="tabular-nums text-ink-muted">{time}</span> : null}
          <span className="font-bold text-ink-primary">{team}</span>
          <span className="flex items-center gap-1" title={`${game.awayTeam} @ ${game.homeTeam}`}>
            <TeamLogo team={game.awayTeam} side={14} />
            <span className="text-ink-muted">@</span>
            <TeamLogo team={game.homeTeam} side={14} />
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums text-ink-muted">
          <PlayBadges entry={entry} />
          {play.downDistance ? <span className="font-semibold text-ink-secondary">{play.downDistance}</span> : null}
          {whenLabel(entry)}
        </span>
      </span>
      {lines.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {lines.map((line) => (
            <PlayerLine
              key={line.key}
              line={line}
              starter={line.playerId ? starterById.get(line.playerId) : undefined}
              stats={line.playerId ? weekStats[line.playerId] : undefined}
              legendByLeagueId={legendByLeagueId}
              at={play.at ?? 0}
            />
          ))}
        </ul>
      ) : null}
      <span className="break-words text-[0.75rem] leading-snug text-ink-secondary">{play.text}</span>
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

const SCOPES: { label: string; value: FeedScope }[] = [
  { label: "Team", value: "mine" },
  { label: "All", value: "all" },
];

/**
 * The Red Zone: plays as they happen, newest on top — by default only the
 * ones your starters are part of, or every play of every game — and, pinned
 * above them, the games where a team has the ball inside the 20. Follows the
 * shared live clock, so it moves with the scores everywhere else on the page.
 */
export function RedZone({
  starters,
  weekGames,
  legend,
  weekStats,
  compactOnPhone = false,
}: {
  /** Your starters, grouped by the game they're playing in. */
  starters: GameStarters[];
  /** Every game of the week. */
  weekGames: NFLGame[];
  legend: LeagueLegendEntry[];
  /** Everyone's stat line so far this week, by Sleeper id. */
  weekStats: Record<string, Record<string, number>>;
  /** On phones, show the plays in a box three rows tall that scrolls on its own, instead of running down the page. */
  compactOnPhone?: boolean;
}) {
  const mode = useLiveMode();
  const [scope, setScope] = useState<FeedScope>("mine");
  const teamPlayers = useTeamPlayers(weekStats);
  const feed = useRedZoneFeed(starters, weekGames, scope, teamPlayers);
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

  const pickScope = (next: FeedScope) => {
    if (next === scope) return;
    setScope(next);
    setShown(PAGE);
    setSettled(false);
    boxRef.current?.scrollTo({ top: 0 });
  };

  const legendByLeagueId = new Map(legend.map((l) => [l.leagueId, l]));
  const entries = feed.entries;
  const live = mode === "live";
  const anyStarted =
    scope === "mine"
      ? starters.some((g) => g.game.state !== "pre" && g.players.length > 0)
      : weekGames.some((g) => g.state !== "pre");

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
          <div className="flex shrink-0 border border-border text-[0.6875rem] font-semibold" role="group" aria-label="Which plays">
            {SCOPES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={scope === opt.value}
                onClick={() => pickScope(opt.value)}
                className={`whitespace-nowrap px-2 py-0.5 transition-colors ${
                  scope === opt.value ? "bg-ink-primary text-surface-raised" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            <ol ref={listRef} className="flex flex-col" aria-label={scope === "mine" ? "Plays your starters were part of" : "Every play"} aria-live="polite">
              {entries.slice(0, shown).map((entry, i) => (
                <FeedRow
                  key={`${entry.game.id}-${entry.play.id}`}
                  entry={entry}
                  starterById={starterById}
                  weekStats={weekStats}
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
                : "Every play lands here as it happens, once the week's games kick off."
              : scope === "mine"
                ? "No plays from your starters yet."
                : "No plays yet."}
        </p>
      )}
    </Card>
  );
}
