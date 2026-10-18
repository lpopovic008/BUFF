"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExpandVerticalIcon } from "@/components/ui/Icon";
import { Ordinals } from "@/components/Ordinals";
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
  spotlit = false,
}: {
  entry: FeedEntry;
  starterById: Map<string, GroupedStarter>;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  arrivedLive: boolean;
  index: number;
  /** The play by a player graph's cursor: lit up. */
  spotlit?: boolean;
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
      data-play={`${game.id}-${play.id}`}
      onClick={(e) => replayRedZonePlay(e.currentTarget)}
      title={hasPoints ? "Replay" : undefined}
      // Every row leaves room down its left for a marked play's strip (see MarkColumn).
      className={`relative flex flex-col gap-1 border-b border-border py-2 pl-3 pr-1 last:border-b-0 ${
        spotlit ? "bg-[color-mix(in_srgb,var(--ink-primary)_8%,var(--surface-raised))] outline outline-1 -outline-offset-1 outline-ink-primary" : ""
      } ${hasPoints ? "md:cursor-pointer md:hover:bg-[color-mix(in_srgb,var(--ink-primary)_4%,transparent)]" : ""}`}
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
        {/* The snap: down and distance, where on the field, then when. */}
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap tabular-nums text-ink-muted">
          {play.downDistance ? (
            <span className="font-semibold text-ink-secondary">
              <Ordinals text={play.downDistance} />
            </span>
          ) : null}
          {/* Outlined, so it stands apart from the down and distance and the clock around it. */}
          {spot ? (
            <span className="border border-ink-primary px-1 py-px font-semibold text-ink-primary" title={`Snapped from the ${spot}`}>
              {spot}
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
          {alert.downDistance ? <Ordinals text={alert.downDistance} /> : `${alert.team} in the red zone`}
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

/** Which plays the Red Zone shows: your starters', theirs and the ones you face too, or every play. */
export type RedZoneScope = "mine" | "vs" | "all";

// The Red Zone's own buttons — its choice is its own, not tied to the bar over the starters list.
const SCOPES: { label: string; value: RedZoneScope }[] = [
  { label: "Team", value: "mine" },
  { label: "VS", value: "vs" },
  { label: "All", value: "all" },
];

/**
 * The Red Zone: plays as they happen, newest on top — the ones your starters
 * are part of (Team), those and the ones your opponents' starters are (VS),
 * or every play of every game (All, the default), picked with its own buttons — and, pinned
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
  spotlight = null,
  full,
}: {
  /** Your starters, grouped by the game they're playing in. */
  starters: GameStarters[];
  /** The starters you're facing, grouped the same way — their plays join yours under VS. */
  opponents: GameStarters[];
  /** Every game of the week. */
  weekGames: NFLGame[];
  legend: LeagueLegendEntry[];
  /** Everyone's stat line so far this week, by Sleeper id — who's played tells which of ESPN's names is likeliest who. */
  weekStats: Record<string, Record<string, number>>;
  /**
   * The play by a player graph's cursor, while it's up: on a phone the box scrolls to it (lit up), and
   * from tablet width up it's pinned in the title bar, over the title. Either way, once it's gone the
   * plays are back just where they were.
   */
  spotlight?: { gameId: string; playId: string } | null;
  /** On phones, show the plays in a box about one play tall (or, ⇕ or the side header double-tapped, as tall as the screen) that scrolls on its own, instead of running down the page. */
  compactOnPhone?: boolean;
  /** From tablet width up, whether the box is stretched to the whole column's height, and the ⇕ button's switch for it (on a phone the button fits the box to the screen). */
  full?: { on: boolean; toggle: () => void };
}) {
  const mode = useLiveMode();
  const [scope, setScope] = useState<RedZoneScope>("all");
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
  // Games switched off from the title bar: none of their plays shown.
  const [offGames, setOffGames] = useState<Set<string>>(() => new Set());
  const toggleGame = (id: string) =>
    setOffGames((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const shownFollowed = useMemo(() => followed.filter((g) => !offGames.has(g.game.id)), [followed, offGames]);
  const shownGames = useMemo(() => weekGames.filter((g) => !offGames.has(g.id)), [weekGames, offGames]);
  // The games on now — and any switched off that have since ended, so they can be switched back on.
  const switchable = weekGames.filter((g) => g.state === "in" || offGames.has(g.id));
  const feedScope: FeedScope = scope === "all" ? "all" : "mine";
  const feed = useRedZoneFeed(shownFollowed, shownGames, feedScope, teamPlayers);
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
  const boxRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Double-tapping the side header (or its ⇕) fits the phone box to the screen — the card's top under the
  // header and ticker, its bottom at the tab bar's top — and doing it again takes it back to a play's height.
  const headRef = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const [boxHeight, setBoxHeight] = useState<number | null>(null);
  const toggleFit = () => {
    const head = headRef.current;
    const box = boxRef.current;
    const card = head?.parentElement;
    if (!head || !box || !card) return;
    if (boxHeight !== null) {
      setBoxHeight(null);
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const covered = (parseFloat(css.getPropertyValue("--header-h")) || 0) + (parseFloat(css.getPropertyValue("--ticker-h")) || 0);
    const tabBar = parseFloat(css.getPropertyValue("--tabbar-h")) || 0;
    const cardRect = card.getBoundingClientRect();
    const above = box.getBoundingClientRect().top - cardRect.top;
    const below = cardRect.bottom - box.getBoundingClientRect().bottom;
    setBoxHeight(Math.max(0, Math.floor(window.innerHeight - covered - tabBar - above - below)));
    window.scrollTo({ top: window.scrollY + cardRect.top - covered, behavior: "smooth" });
  };
  const onHeadTap = (e: React.PointerEvent) => {
    // Its buttons are buttons; and only on a phone, where the box is.
    if (!compactOnPhone || (e.target as HTMLElement).closest("button") || !window.matchMedia("(max-width: 767px)").matches) return;
    const now = performance.now();
    if (now - lastTap.current < 350) {
      lastTap.current = 0;
      toggleFit();
    } else lastTap.current = now;
  };
  // The play by a graph's cursor. Not among these plays (another of the buttons is picked)? Found among the game's
  // every play instead, just for it.
  const spotIndex = spotlight ? feed.entries.findIndex((e) => e.game.id === spotlight.gameId && e.play.id === spotlight.playId) : -1;
  const spotGame = useMemo(
    () => (spotlight && spotIndex < 0 ? weekGames.filter((g) => g.id === spotlight.gameId) : []),
    [spotlight, spotIndex, weekGames]
  );
  const spotFeed = useRedZoneFeed(starters, spotGame, "all", teamPlayers);
  const spotEntry = spotlight
    ? spotIndex >= 0
      ? feed.entries[spotIndex]
      : spotFeed.entries.find((e) => e.game.id === spotlight.gameId && e.play.id === spotlight.playId)
    : undefined;
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // On a phone, the box scrolls to it — its rows loaded that far — and back to where it was once it's gone.
  const scrollIn = phone && compactOnPhone && spotIndex >= 0;
  const savedScroll = useRef<number | null>(null);
  const spotKey = spotlight && scrollIn ? `${spotlight.gameId}-${spotlight.playId}` : null;
  if (scrollIn && spotIndex >= shown) setShown(spotIndex + PAGE);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (spotKey === null) {
      if (savedScroll.current !== null) box.scrollTop = savedScroll.current;
      savedScroll.current = null;
      return;
    }
    const row = box.querySelector<HTMLElement>(`[data-play="${CSS.escape(spotKey)}"]`);
    if (!row) return;
    savedScroll.current ??= box.scrollTop;
    box.scrollTop = row.offsetTop;
  }, [spotKey, shown]);
  const pinned = spotEntry && !scrollIn ? spotEntry : null;
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

  // Another scope starts the plays over from the top.
  const pickScope = (next: RedZoneScope) => {
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
    scope === "all" ? weekGames.some((g) => g.state !== "pre") : followed.some((g) => g.game.state !== "pre" && g.players.length > 0);

  const stretched = phone ? boxHeight !== null : !!full?.on;
  return (
    // No box: the header runs down the left side as narrow as it goes, the plays spread out beside it to the
    // next section or the screen's edge. From tablet width up it fills the room it's given; on a phone it's
    // about one big play tall.
    <div className="flex flex-row md:min-h-0 md:flex-1">
      <div
        // Its contents sit inside it, never making the Red Zone taller; the games scroll should they outrun it.
        ref={headRef}
        onPointerUp={onHeadTap}
        className="relative w-6 shrink-0 touch-manipulation select-none border-r border-border"
      >
        <div className="absolute inset-0 flex flex-col items-center gap-1.5 px-0.5 py-1.5">
          {/* The title down the top, ⇕ beside it. */}
          <div className="flex shrink-0 items-start gap-px">
            <h2 className="flex flex-col items-center gap-1" aria-label="Red Zone">
              <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                {live ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-critical opacity-60" /> : null}
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${live ? "bg-status-critical" : "bg-ink-muted"}`} />
              </span>
              {/* Each letter under the last, a little gap between the words. */}
              <span className="flex flex-col items-center text-[0.5625rem] font-bold uppercase leading-none text-ink-primary" aria-hidden>
                {"RED ZONE".split("").map((ch, i) => (ch === " " ? <span key={i} className="h-1" /> : <span key={i}>{ch}</span>))}
              </span>
            </h2>
            {/* ⇕: the box as tall as the screen (on a phone, fit under the header; wider, the map's whole column) — and back. */}
            <button
              type="button"
              onClick={() => (phone ? toggleFit() : full?.toggle())}
              aria-pressed={stretched}
              aria-label={stretched ? "Back to size" : "Fit to the screen"}
              title={stretched ? "Back to size" : "Fit to the screen"}
              className="-mr-0.5 flex shrink-0 items-center justify-center text-ink-secondary transition-colors hover:text-ink-primary"
            >
              <ExpandVerticalIcon inward={stretched} width={11} height={11} />
            </button>
          </div>
          {/* The games on now, each switched in or out of the plays: the visitors over the home team. */}
          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none]" role="group" aria-label="Games in the Red Zone">
            {switchable.map((g) => {
              const on = !offGames.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleGame(g.id)}
                  title={`${on ? "Hide" : "Show"} ${g.awayTeam} @ ${g.homeTeam}`}
                  className={`flex w-full shrink-0 flex-col items-center gap-0.5 border py-0.5 transition-opacity ${
                    on ? "border-ink-primary" : "border-border opacity-35 grayscale"
                  }`}
                >
                  <TeamLogo team={g.awayTeam} side={12} />
                  <TeamLogo team={g.homeTeam} side={12} />
                </button>
              );
            })}
          </div>
          {/* Which plays, along the bottom. */}
          <div className="flex w-full shrink-0 flex-col border border-border text-[0.5625rem] font-semibold" role="group" aria-label="Which plays">
            {SCOPES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={scope === opt.value}
                onClick={() => pickScope(opt.value)}
                className={`leading-[1.6] transition-colors ${
                  scope === opt.value ? "bg-ink-primary text-surface-raised" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1 pl-1.5 max-md:pr-2 md:min-h-0">
        {/* The play by a graph's cursor, pinned over the plays (see spotlight). */}
        {pinned ? (
          <ol aria-label="The play by the graph's cursor" className="shrink-0">
            <FeedRow key="pinned" entry={pinned} starterById={starterById} legendByLeagueId={legendByLeagueId} arrivedLive={false} index={0} spotlit />
          </ol>
        ) : null}

        {feed.redZone.length > 0 ? (
          <ul className="flex shrink-0 flex-col gap-1" aria-label="In the red zone now">
            {feed.redZone.map((alert) => (
              <RedZoneAlert key={alert.game.id} alert={alert} />
            ))}
          </ul>
        ) : null}

        {entries.length > 0 ? (
          <div className="relative md:min-h-0 md:flex-1">
            <div
              ref={boxRef}
              className={`relative md:h-full md:overflow-y-auto md:overscroll-contain ${
                // About one play tall: one with three people in it and three lines of description.
                compactOnPhone ? "max-md:h-[var(--rz-user-h,12.25rem)] max-md:overflow-y-auto max-md:overscroll-contain" : ""
              }`}
              style={boxHeight !== null ? ({ "--rz-user-h": `${boxHeight}px` } as React.CSSProperties) : undefined}
            >
              <ol className="flex flex-col" aria-label={scope === "mine" ? "Plays your starters were part of" : scope === "vs" ? "Plays your starters or the ones you face were part of" : "Every play"} aria-live="polite">
                {entries.slice(0, shown).map((entry, i) => (
                  <FeedRow
                    key={`${entry.game.id}-${entry.play.id}`}
                    entry={entry}
                    starterById={starterById}
                    legendByLeagueId={legendByLeagueId}
                    arrivedLive={settled}
                    index={i}
                    spotlit={scrollIn && i === spotIndex}
                  />
                ))}
              </ol>
              {/* The last screen or so of plays: scrolling into it brings in the next ones before you reach the end. */}
              {entries.length > shown ? <div ref={sentinelRef} className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(60rem,100%)]" aria-hidden /> : null}
            </div>
          </div>
        ) : (
          <p className="py-3 text-center text-xs text-ink-muted max-md:min-h-[12.25rem]">
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
      </div>
    </div>
  );
}
