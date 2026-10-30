"use client";

import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExpandVerticalIcon } from "@/components/ui/Icon";
import { Ordinals } from "@/components/Ordinals";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { LeagueLegendEntry, LeagueMark } from "@/components/LeagueMark";
import { showPlayOnFloor } from "@/components/FloorPlay";
import { penaltyOf, playSummary, sceneFor } from "@/lib/play-scene";
import { FeedEntry, FeedScope, RedZoneNow, useRedZoneFeed } from "@/hooks/useRedZoneFeed";
import { useLiveMode } from "@/hooks/useLiveTick";
import { useTeamPlayers } from "@/hooks/useTeamPlayers";
import { useDragScroll } from "@/hooks/useDragScroll";
import { ScrollThumb } from "@/components/ScrollThumb";
import { GameStarters, GroupedStarter } from "@/lib/my-starters";
import { gameClock, NFLGame } from "@/lib/nfl-schedule";
import { formatPlayPoints } from "@/lib/play-points";
import { yardLineLabel } from "@/lib/play-by-play";
import { linePoints, playAction, PlayLine, statParts } from "@/lib/play-lines";
import { useFullPlays } from "@/hooks/useFullPlays";
import { nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { inWindow, PLAY_PAGE as PAGE, PlayWindow, windowAround } from "@/lib/play-window";

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

/** When in the game a play happened: "Q2 4:31" — or, a play just in between quarters, the game's status ("End 2Q"). */
function whenLabel(entry: FeedEntry): string {
  const { play, game } = entry;
  if (play.period > 0) return `${periodLabel(play.period)} ${play.clock}`.trim();
  // Between quarters: the game's own status, worded as everywhere else ("End 2Q", "Half").
  return gameClock(game.statusDetail ?? "") || "Live";
}

const POINTS_TITLE =
  "Points worked out from ESPN's play-by-play alone, under your league's scoring (standard PPR for anyone you don't start) — Sleeper's official numbers can differ.";

/** Each league's scoring, by league id — a starter's line is scored under his first league's, as his graph is. */
/** How recent a play coming in must be to be acted out on the floor (ms) — not one the play-by-play's only now caught up on. */
const RECENT_MS = 10 * 60_000;

const ScoringContext = createContext<Map<string, Record<string, number> | undefined>>(new Map());

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
function LinePoints({ line, mine, at, scoring }: { line: PlayLine; mine: boolean; at: number; scoring?: Record<string, number> }) {
  const { delta, total } = linePoints(line, scoring);
  if (delta === null || total === null) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap leading-none tabular-nums" title={POINTS_TITLE}>
      {/* Tagged so the starters list can find it and light it up as it applies it to this player's total. */}
      <span
        {...(line.playerId ? { "data-rz-player": line.playerId } : { "data-rz-actor": line.label ?? "", "data-rz-team": line.team ?? "" })}
        data-rz-delta={delta}
        data-rz-at={at}
        // The total's type, not bold (green or red for your own player's).
        className={`text-[0.8125rem] ${mine ? deltaClass(delta) : "text-ink-secondary"}`}
      >
        {formatPlayPoints(delta)}
      </span>
      <TotalChip total={total} />
    </span>
  );
}

/**
 * One person in a play: their photo (a defense's logo), position and name,
 * the leagues you start them in (in full), how their game is going, and what the play
 * was worth to them.
 */
function PlayerLine({
  line,
  starter,
  legendByLeagueId,
  at,
  action,
  leagues = true,
}: {
  line: PlayLine;
  /** What he did on the play, said beside his name (simple descriptions) — none in full. */
  action?: string;
  /** Whether the leagues you start him in are marked by his name (in full, not with simple descriptions). */
  leagues?: boolean;
  /** Set when they're one of your starters. */
  starter: GroupedStarter | undefined;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  at: number;
}) {
  const defense = line.position === "DEF";
  const scoringByLeague = useContext(ScoringContext);
  // Their game as it stood once this play was over — the numbers it moved in green (for the better) or red.
  const summary = statParts(line.position, line.stats ?? undefined, line.did);
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
        {action ? <span className="text-[0.75rem] font-semibold text-ink-secondary">{action}</span> : null}
        {leagues && starter && starter.leagueIds.length > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5 self-center">
            {starter.leagueIds.map((id) => (
              <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
            ))}
          </span>
        ) : null}
        {/* On phones the stat line always gets a line of its own (kept, empty, for someone without one), so every player is the same height. */}
        {summary.length > 0 ? (
          <span className="whitespace-nowrap text-[0.6875rem] tabular-nums text-ink-muted max-md:basis-full max-md:leading-tight">
            {summary.map((part, i) => (
              <span key={i} className={part.tone === "good" ? "font-semibold text-status-good" : part.tone === "bad" ? "font-semibold text-status-critical" : undefined}>
                {part.text}
              </span>
            ))}
          </span>
        ) : (
          <span className="hidden text-[0.6875rem] max-md:block max-md:basis-full max-md:leading-tight" aria-hidden>
            {"\u00a0"}
          </span>
        )}
      </span>
      <LinePoints line={line} mine={!!starter} at={at} scoring={starter?.leagueIds[0] ? scoringByLeague.get(starter.leagueIds[0]) : undefined} />
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

/** Equal all the way down, for the plain data a play's row is drawn from. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Whether a row would draw just the same: a new play re-reads every game's plays, but only the
 * rows that changed are drawn again — with thousands of plays on a Sunday, drawing them all freezes a phone.
 */
function sameRow(a: FeedRowProps, b: FeedRowProps): boolean {
  return (
    a.starterById === b.starterById &&
    a.legendByLeagueId === b.legendByLeagueId &&
    a.arrivedLive === b.arrivedLive &&
    a.spotlit === b.spotlit &&
    a.latest === b.latest &&
    (a.entry === b.entry ||
      (a.entry.game.id === b.entry.game.id &&
        a.entry.game.statusDetail === b.entry.game.statusDetail &&
        sameData(a.entry.play, b.entry.play) &&
        sameData(a.entry.lines, b.entry.lines) &&
        sameData(
          a.entry.players.map((p) => p.playerId),
          b.entry.players.map((p) => p.playerId)
        )))
  );
}

interface FeedRowProps {
  entry: FeedEntry;
  starterById: Map<string, GroupedStarter>;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  arrivedLive: boolean;
  /** Where it sits as the plays first show, for its turn sliding in. */
  index: number;
  /** The play by a player graph's cursor: lit up. */
  spotlit?: boolean;
  /** Its game's latest play: "Latest" after its matchup, lit like a map tag. */
  latest?: boolean;
}

/**
 * One play: when it happened and the matchup along the top, with the snap
 * across from them — the down and distance, where on the field, the quarter
 * and clock; then a line for each person in it; then ESPN's description, led
 * by the team with the ball. A play
 * that arrives while you watch slides in and washes its row in the theme's
 * ink — green for a good one for you.
 */
const FeedRow = memo(function FeedRow({ entry, starterById, legendByLeagueId, arrivedLive, index, spotlit = false, latest = false }: FeedRowProps) {
  // Decided once, when the row first appears.
  const [live] = useState(arrivedLive);
  const [slot] = useState(index);
  const { play, players, lines, game } = entry;
  const hasPoints = lines.some((l) => !!l.delta);
  // Simple descriptions (unless switched to full): each player's line says what he did, and ESPN's description is
  // left out — the play said in a few words instead when no one's line can say what happened (a punt), and when
  // there's a flag, just what it was for and how far (see playSummary).
  const full = useFullPlays();
  const acted = full ? [] : lines.filter((l) => playAction(l.did));
  const simple = acted.length > 0;
  const flag = full ? null : penaltyOf(play.text);
  const summary = full || (simple && !flag) ? null : playSummary(play, [game.homeTeam, game.awayTeam]);
  const shown = simple ? lines.filter((l) => playAction(l.did) || l.delta) : hasPoints ? lines : [];
  const good = play.scoring || (play.turnover && players.length > 0 && players.every((p) => p.position === "DEF"));
  const time = clockTime(play.at);
  const defense = play.offense ? ([game.homeTeam, game.awayTeam].find((t) => t !== play.offense) ?? null) : null;
  const spot = yardLineLabel(play, defense);
  // The game's score once the play was over — ESPN's, or for its latest play the scoreboard's.
  const score = play.score ?? (latest && game.state !== "pre" ? { home: game.homeScore, away: game.awayScore } : null);
  // A play that can be acted out on the floor by pixel players (see FloorPlay): as it comes in, and tapped, again.
  const actable = useMemo(() => sceneFor(play, [game.homeTeam, game.awayTeam]) !== null, [play, game.homeTeam, game.awayTeam]);
  useEffect(() => {
    // Only one just made — not one the play-by-play's catching up on from a while ago.
    if (live && actable && (play.at === null || Date.now() - play.at < RECENT_MS)) showPlayOnFloor(play, [game.homeTeam, game.awayTeam]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it comes in
  }, []);
  return (
    // Tapping a play acts it out on the floor again.
    <li
      data-play={`${game.id}-${play.id}`}
      onClick={actable ? () => showPlayOnFloor(play, [game.homeTeam, game.awayTeam], true) : undefined}
      title={actable ? "Replay" : undefined}
      // Every row leaves room down its left for a marked play's strip (see MarkColumn).
      className={`relative flex flex-col gap-1 py-2 pl-3 pr-1 ${
        spotlit ? "bg-[color-mix(in_srgb,var(--ink-primary)_8%,var(--surface-raised))] outline outline-1 -outline-offset-1 outline-ink-primary" : ""
      } ${actable ? "cursor-pointer md:hover:bg-[color-mix(in_srgb,var(--ink-primary)_4%,transparent)]" : ""}`}
      style={{
        animation: live
          ? "rise 0.35s ease-out backwards, rz-flash 2.4s ease-out"
          : `rise 0.4s ease-out ${Math.min(slot, 10) * 40}ms backwards`,
        // A new play flashes in the theme's ink (black, or white in dark mode); a good one for you, green.
        ["--rz-flash" as string]: good ? "var(--status-good)" : "var(--ink-primary)",
      }}
    >
      <MarkColumn marks={playMarks(entry)} />
      <span className="flex items-center justify-between gap-2 text-[0.6875rem] leading-none">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          {time ? <span className="tabular-nums text-ink-muted">{time}</span> : null}
          {/* The matchup and its score after the play — and on its game's latest play, "Latest" after it, lit like a map tag. */}
          <span className="flex items-center gap-1" title={`${game.awayTeam} @ ${game.homeTeam}`}>
            <TeamLogo team={game.awayTeam} side={14} />
            {score ? <span className="font-semibold tabular-nums text-ink-primary">{score.away}</span> : null}
            <span className="text-ink-muted">@</span>
            {score ? <span className="font-semibold tabular-nums text-ink-primary">{score.home}</span> : null}
            <TeamLogo team={game.homeTeam} side={14} />
          </span>
          {latest ? (
            <span className="bg-[var(--map-tag)] px-1 py-0.5 font-bold uppercase tracking-wide text-[var(--map-tag-ink)]" title="This game's latest play">
              Latest
            </span>
          ) : null}
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
      {/* The people in it: with simple descriptions, whoever did something; in full, everyone when the play put points
          on the board for someone, and no one otherwise — a play worth nothing being its line and description. */}
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {shown.map((line) => (
            <PlayerLine
              key={line.key}
              line={line}
              starter={line.playerId ? starterById.get(line.playerId) : undefined}
              legendByLeagueId={legendByLeagueId}
              at={play.at ?? 0}
              action={simple ? playAction(line.did) : undefined}
              leagues={full}
            />
          ))}
        </ul>
      ) : null}
      {/* What happened, led by the team with the ball (a flag, by the team it's on): in a few words, or ESPN's own. */}
      {full || summary ? (
        <span className="break-words text-[0.75rem] leading-snug text-ink-secondary">
          {(flag?.team ?? play.offense) ? (
            <span className="mr-1.5 inline-flex translate-y-[0.15em] align-baseline">
              <TeamLogo team={(flag?.team ?? play.offense)!} side={14} />
            </span>
          ) : null}
          {summary ?? play.text}
        </span>
      ) : null}
    </li>
  );
}, sameRow);

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

const NO_GAMES = new Set<string>();
const NO_SCORING = new Map<string, Record<string, number> | undefined>();

/** Which plays the Red Zone shows: your starters', theirs and the ones you face too, or every play. */
export type RedZoneScope = "mine" | "vs" | "all";

// The Red Zone's own buttons — its choice is its own, not tied to the bar over the starters list.
const SCOPES: { label: string; value: RedZoneScope }[] = [
  { label: "Team", value: "mine" },
  { label: "VS", value: "vs" },
  { label: "All", value: "all" },
];

/** The Red Zone's title: the switch that puts it away, when there's one (`onClick`); otherwise just the title. */
function TitleSwitch({ onClick, className, children }: { onClick?: () => void; className: string; children: React.ReactNode }) {
  return onClick ? (
    <button type="button" onClick={onClick} aria-label="Put the Red Zone away" title="Put the Red Zone away" className={`${className} cursor-pointer`}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}

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
  fill = false,
  spotlight = null,
  full,
  onSwitchOff,
  hiddenGames = NO_GAMES,
  onEmptyChange,
  onFitChange,
  scoringByLeague = NO_SCORING,
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
   * The play by a player graph's cursor, while it's up: the plays scroll to it, lit up, so you can
   * scroll on from there to what led up to it; once it's gone they're back just where they were.
   */
  spotlight?: { gameId: string; playId: string } | null;
  /** On phones, show the plays in a box about a play and a half tall (or, ⇕ or the side header double-tapped, as tall as the screen) that scrolls on its own, instead of running down the page. */
  compactOnPhone?: boolean;
  /**
   * Fills the box it's given on any screen, its plays scrolling within it, its header across its top — and ⇕ (or the
   * header double-tapped) is `full`'s switch on a phone too.
   */
  fill?: boolean;
  /** From tablet width up, whether the box is stretched to the whole column's height, and the ⇕ button's switch for it (on a phone the button fits the box to the screen). */
  full?: { on: boolean; toggle: () => void };
  /** On a phone, switches the Red Zone off: its title's the switch. */
  onSwitchOff?: () => void;
  /** Each of your leagues' scoring, by league id: a starter's points are scored under his first league's (see linePoints). */
  scoringByLeague?: Map<string, Record<string, number> | undefined>;
  /** Games hidden in the starters list (their matchups swiped over), by id: none of their plays shown. */
  hiddenGames?: Set<string>;
  /** Told whether it has no plays to show (just its header, then), so its room can go to the rest of the page. */
  onEmptyChange?: (empty: boolean) => void;
  /** Told whether, on a phone, it's fitted to the screen (⇕) — so what's under it can step aside. */
  onFitChange?: (fitted: boolean) => void;
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
  // Games hidden in the starters list (their matchups swiped over): none of their plays shown.
  const shownFollowed = useMemo(() => followed.filter((g) => !hiddenGames.has(g.game.id)), [followed, hiddenGames]);
  const shownGames = useMemo(() => weekGames.filter((g) => !hiddenGames.has(g.id)), [weekGames, hiddenGames]);
  const feedScope: FeedScope = scope === "all" ? "all" : "mine";
  const feed = useRedZoneFeed(shownFollowed, shownGames, feedScope, teamPlayers);
  const starterById = useMemo(() => new Map(starters.flatMap((g) => g.players.map((p) => [p.playerId, p] as const))), [starters]);
  // The plays loaded: from the top, a page more as the end comes near — or, around a graph cursor's play far down
  // them, a page either side of it, a page more as either end comes near (see play-window.ts).
  const [range, setRange] = useState<PlayWindow>({ start: 0, end: PAGE });
  // Plays already on hand when the feed fills in just slide in; ones that arrive after that flash.
  const [settled, setSettled] = useState(false);
  const hasEntries = feed.entries.length > 0;
  useEffect(() => {
    if (!hasEntries || settled) return;
    const id = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(id);
  }, [hasEntries, settled]);
  const boxRef = useRef<HTMLDivElement>(null);
  // Filling its box, its plays are scrolled by the page itself, so its reflection keeps up with them (see useDragScroll).
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  useDragScroll(fill ? box : null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Double-tapping the side header (or its ⇕) fits the phone box to the screen — the card's top under the
  // header and ticker, its bottom at the tab bar's top — and doing it again takes it back to a play's height.
  const headRef = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const [boxHeight, setBoxHeight] = useState<number | null>(null);
  useEffect(() => onFitChange?.(boxHeight !== null), [boxHeight, onFitChange]);
  // Where the page was before the box was fitted, to go back to once it's taken back down.
  const scrollBeforeFit = useRef<number | null>(null);
  const toggleFit = () => {
    const head = headRef.current;
    const box = boxRef.current;
    const card = head?.parentElement;
    if (!head || !box || !card) return;
    if (boxHeight !== null) {
      setBoxHeight(null);
      const before = scrollBeforeFit.current;
      scrollBeforeFit.current = null;
      if (before !== null) requestAnimationFrame(() => window.scrollTo({ top: before }));
      return;
    }
    scrollBeforeFit.current = window.scrollY;
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
    if (!(compactOnPhone || fill) || (e.target as HTMLElement).closest("button") || !window.matchMedia("(max-width: 767px)").matches) return;
    const now = performance.now();
    if (now - lastTap.current < 350) {
      lastTap.current = 0;
      if (fill) full?.toggle();
      else toggleFit();
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
  // Among the plays: the box scrolls to it, lit up, so you can scroll on from there to what led up to it — and back
  // to where it was once it's gone. Not among those loaded, just the page around it is loaded (not every play down
  // to it), and the ones it took the place of come back with the scroll.
  const savedScroll = useRef<number | null>(null);
  const savedRange = useRef<PlayWindow | null>(null);
  const spotKey = spotlight && spotIndex >= 0 ? `${spotlight.gameId}-${spotlight.playId}` : null;
  if (spotIndex >= 0 && !inWindow(range, spotIndex)) {
    savedRange.current ??= range;
    setRange(windowAround(spotIndex, feed.entries.length));
  }
  // The play the box was last brought to: it's brought to each play once, so scrolling on from there — and the
  // plays that loads in — is left alone.
  const pinnedKey = useRef<string | null>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (spotKey === null) {
      pinnedKey.current = null;
      if (savedRange.current !== null) setRange(savedRange.current);
      savedRange.current = null;
      if (savedScroll.current !== null) {
        const top = savedScroll.current;
        requestAnimationFrame(() => (box.scrollTop = top));
      }
      savedScroll.current = null;
      return;
    }
    if (pinnedKey.current === spotKey) return;
    const row = box.querySelector<HTMLElement>(`[data-play="${CSS.escape(spotKey)}"]`);
    if (!row) return;
    savedScroll.current ??= box.scrollTop;
    box.scrollTop = row.offsetTop;
    pinnedKey.current = spotKey;
  }, [spotKey, range]);
  // Not among them (another of the buttons is picked): laid over the top of the plays instead.
  const pinned = spotEntry && spotIndex < 0 ? spotEntry : null;
  const moreBelow = feed.entries.length > range.end;
  const moreAbove = range.start > 0;
  // Scrolling near the end of the plays loaded loads the next page of them — no button. Watched within the box
  // when it scrolls on its own, else the screen; a page is only added once the end of the plays comes near.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const box = boxRef.current;
    if (!sentinel || !box) return;
    const observer = new IntersectionObserver(
      (seen) => {
        if (seen.some((e) => e.isIntersecting)) setRange((r) => ({ ...r, end: r.end + PAGE }));
      },
      { root: getComputedStyle(box).overflowY === "visible" ? null : box, rootMargin: "0px 0px 800px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [moreBelow, range.end, phone]);
  // And near the start of them, while there are plays above (loaded around a graph cursor's play), the page before
  // them — the plays in view held where they are as it goes in over them.
  const heightBeforePrepend = useRef<number | null>(null);
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const box = boxRef.current;
    if (!sentinel || !box) return;
    const observer = new IntersectionObserver(
      (seen) => {
        if (!seen.some((e) => e.isIntersecting)) return;
        heightBeforePrepend.current = box.scrollHeight;
        setRange((r) => ({ ...r, start: Math.max(0, r.start - PAGE) }));
      },
      { root: getComputedStyle(box).overflowY === "visible" ? null : box, rootMargin: "200px 0px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [moreAbove, range.start, phone]);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const before = heightBeforePrepend.current;
    heightBeforePrepend.current = null;
    if (!box || before === null) return;
    const grew = box.scrollHeight - before;
    if (getComputedStyle(box).overflowY === "visible") window.scrollBy(0, grew);
    else box.scrollTop += grew;
  }, [range.start]);

  // Another scope starts the plays over from the top.
  const pickScope = (next: RedZoneScope) => {
    if (next === scope) return;
    setScope(next);
    setRange({ start: 0, end: PAGE });
    setSettled(false);
    boxRef.current?.scrollTo({ top: 0 });
  };

  const legendByLeagueId = useMemo(() => new Map(legend.map((l) => [l.leagueId, l])), [legend]);
  const entries = feed.entries;
  // Each game's latest play (the plays run newest first), marked "Latest".
  const latestPlays = new Set<string>();
  const gamesSeen = new Set<string>();
  for (const e of entries) {
    if (gamesSeen.has(e.game.id)) continue;
    gamesSeen.add(e.game.id);
    latestPlays.add(`${e.game.id}-${e.play.id}`);
  }
  const live = mode === "live";
  const stretched = phone && !fill ? boxHeight !== null : !!full?.on;
  // With no game on, the header runs across the top instead of down the side — and with no plays, it's just
  // the header, across the top, no room kept for them.
  const empty = entries.length === 0 && feed.redZone.length === 0 && !pinned;
  const across = !live || empty || fill;
  useEffect(() => onEmptyChange?.(empty), [empty, onEmptyChange]);
  return (
    // Each starter's points scored under his league's scoring (see PlayerLine).
    <ScoringContext.Provider value={scoringByLeague}>
    {/* No box: while games are on, the header runs down the left side as narrow as it goes, the plays spread out
        beside it to the next section or the screen's edge; otherwise it runs across the top, the plays under it.
        From tablet width up it fills the room it's given; on a phone it's about a play and a half tall. */}
    <div className={`flex ${fill ? "min-h-0 flex-1" : "md:min-h-0 md:flex-1"} ${across ? "flex-col" : "flex-row"}`}>
      <div
        // Down the side, its contents sit inside it, never making the Red Zone taller.
        ref={headRef}
        data-rz-head
        onPointerUp={onHeadTap}
        // Dragged to set the Red Zone's height (see the page), so no scrolling or zooming from it.
        // Across the top, its title just where the Red Zone's switch stands below it (1rem in, and the switch's own
        // 0.75rem), so the switch turns into it where it stands (see FloorCameraControls).
        className={`relative shrink-0 cursor-ns-resize touch-none select-none ${across ? "pl-7 max-md:pr-2" : "w-7"}`}
      >
        <div className={across ? `flex items-center gap-2 ${fill ? "py-0.5" : "py-1"}` : "absolute inset-0 flex flex-col items-center gap-1.5 px-0.5 py-1.5"}>
          {/* The title, ⇕ after it (under it, down the side). */}
          <div className={`flex shrink-0 items-center gap-1 ${across ? "flex-row" : "flex-col"}`}>
            <h2 data-rz-title className="flex" aria-label="Red Zone">
              {/* On a phone, the Red Zone's switch (it flies up into here as it comes up). */}
              <TitleSwitch onClick={onSwitchOff} className={`flex items-center ${across ? "flex-row gap-1" : "flex-col gap-1"}`}>
              <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                {live ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-critical opacity-60" /> : null}
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${live ? "bg-status-critical" : "bg-ink-muted"}`} />
              </span>
              {across ? (
                // The switch's own type (it turns into this).
                <span className="text-xs font-bold uppercase leading-none text-ink-primary" aria-hidden>
                  Red Zone
                </span>
              ) : (
                // Each letter under the last, a little gap between the words.
                <span className="flex flex-col items-center text-[0.5625rem] font-bold uppercase leading-none text-ink-primary" aria-hidden>
                  {"RED ZONE".split("").map((ch, i) => (ch === " " ? <span key={i} className="h-1" /> : <span key={i}>{ch}</span>))}
                </span>
              )}
              </TitleSwitch>
            </h2>
            {/* ⇕: the box as tall as the screen (on a phone, fit under the header; wider, the map's whole column) — and back. */}
            <button
              type="button"
              onClick={() => (phone && !fill ? toggleFit() : full?.toggle())}
              aria-pressed={stretched}
              aria-label={stretched ? "Back to size" : "Fit to the screen"}
              title={stretched ? "Back to size" : "Fit to the screen"}
              className="flex shrink-0 items-center justify-center text-ink-secondary transition-colors hover:text-ink-primary"
            >
              <ExpandVerticalIcon inward={stretched} width={14} height={14} />
            </button>
          </div>
          {/* Which plays, at the end. */}
          <div
            className={`flex shrink-0 border border-border font-semibold ${across ? "ml-auto flex-row text-[0.625rem]" : "mt-auto w-full flex-col text-[0.5625rem]"}`}
            role="group"
            aria-label="Which plays"
          >
            {SCOPES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={scope === opt.value}
                onClick={() => pickScope(opt.value)}
                className={`leading-tight transition-colors ${fill ? "py-0.5" : "py-1"} ${across ? "px-2" : ""} ${
                  scope === opt.value ? "bg-ink-primary text-surface-raised" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {empty ? (
        feed.loading ? <p className="py-1 text-xs text-ink-muted max-md:px-2">Loading play-by-play…</p> : null
      ) : (
        <div data-rz-plays className={`relative flex min-w-0 flex-1 flex-col gap-2 py-1 ${fill ? "min-h-0" : "md:min-h-0"} ${across ? "max-md:px-2" : "pl-1.5 max-md:pr-2"}`}>
          {/* The play by a graph's cursor when it isn't among these plays, laid over the top of them (see spotlight). */}
          {pinned ? (
            <ol aria-label="The play by the graph's cursor" className="absolute left-1.5 right-0 top-1 z-20 bg-page shadow-md max-md:right-2">
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
            <div className={`relative ${fill ? "min-h-0 flex-1" : "md:min-h-0 md:flex-1"}`}>
              <div
                ref={(el) => {
                  boxRef.current = el;
                  setBox(el);
                }}
                data-drag-scroll={fill ? "" : undefined}
                className={`relative ${
                  fill
                    ? "h-full touch-none overflow-y-auto overscroll-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    : "md:h-full md:overflow-y-auto md:overscroll-contain"
                } ${
                  // About a play and a half tall.
                  compactOnPhone ? "max-md:h-[var(--rz-user-h,9.5rem)] max-md:overflow-y-auto max-md:overscroll-contain" : ""
                }`}
                style={boxHeight !== null ? ({ "--rz-user-h": `${boxHeight}px` } as React.CSSProperties) : undefined}
              >
                {/* The start of the plays loaded, when there are more above: coming near it brings in the ones before. */}
                {range.start > 0 ? <div ref={topSentinelRef} className="h-px" aria-hidden /> : null}
                <ol className="flex translate-y-[var(--overscroll,0px)] flex-col" aria-label={scope === "mine" ? "Plays your starters were part of" : scope === "vs" ? "Plays your starters or the ones you face were part of" : "Every play"} aria-live="polite">
                  {entries.slice(range.start, range.end).map((entry, i) => (
                    <FeedRow
                      key={`${entry.game.id}-${entry.play.id}`}
                      entry={entry}
                      starterById={starterById}
                      legendByLeagueId={legendByLeagueId}
                      arrivedLive={settled}
                      index={i}
                      spotlit={range.start + i === spotIndex}
                      latest={latestPlays.has(`${entry.game.id}-${entry.play.id}`)}
                    />
                  ))}
                </ol>
                {/* The end of the plays shown: coming within a screen or so of it brings in the next ones. */}
                {entries.length > range.end ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
              </div>
              {fill ? <ScrollThumb source={box} /> : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
    </ScoringContext.Provider>
  );
}
