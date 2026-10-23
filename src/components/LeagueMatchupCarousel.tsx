"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ResolvedMatchupGame, ResolvedSlot } from "@/hooks/useLeagueMatchupCarousel";
import { HeadToHeadBadge, PointsRankBadges, TeamNameLabel } from "@/components/DashboardMatchupCard";
import { AllTimeRecord, headToHeadAsItStands, headToHeadKey, useAllTimeHeadToHead } from "@/hooks/useAllTimeHeadToHead";
import { PendingMatchups } from "@/hooks/useAsItStands";
import { TeamStanding } from "@/lib/league-data";
import { MatchupRows } from "@/components/LeagueTicker";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { abbreviateFirstName, formatPoints } from "@/lib/format";
import { getHomeView, saveHomeView } from "@/lib/localStore";

/**
 * How a starter's points read, by player id: "pre" before they've played (a dash), "good" on pace for
 * their projection (or, game over, beating it), "bad" behind it, null with nothing to measure against.
 */
export type LineTone = "pre" | "good" | "bad" | null;
const EMPTY_TONES = new Map<string, LineTone>();
const LineToneContext = createContext<Map<string, LineTone>>(EMPTY_TONES);

/**
 * What a starter's second line says, by player id: the team they're playing this week (null not known yet, or
 * on a bye), that defense's rank against their position (1 the fewest points allowed) and how many it allows as a
 * share of the way from the position's stingiest defense to its most generous (0 to 1), and their projected points.
 */
export interface LineNote {
  opponent: string | null;
  bye: boolean;
  rank: number | null;
  share: number | null;
  projected: number | null;
}
const EMPTY_NOTES = new Map<string, LineNote>();
const LineNoteContext = createContext<Map<string, LineNote>>(EMPTY_NOTES);

// A defense's colors, toughest to easiest.
const MATCHUP_STOPS = ["var(--status-critical)", "var(--status-warning)", "var(--status-good)"];

/**
 * A defense as a color by how many points it allows — not its rank, so defenses that allow about as many land
 * together and a gap between them shows: the stingiest third of the scale red, the middle yellow, the most
 * generous green.
 */
function matchupColor(share: number): string {
  return MATCHUP_STOPS[Math.min(MATCHUP_STOPS.length - 1, Math.floor(share * MATCHUP_STOPS.length))];
}

/** A starter's points in the lineup: a dash before they've played; green on pace, red behind — their projection under them, small. */
function SlotPoints({ resolved, align }: { resolved: ResolvedSlot; align: "left" | "right" }) {
  const tone = useContext(LineToneContext).get(resolved.player?.playerId ?? "");
  const projected = useContext(LineNoteContext).get(resolved.player?.playerId ?? "")?.projected ?? null;
  const notYet = tone === "pre" && resolved.livePoints === 0;
  const color = tone === "good" ? "text-status-good" : tone === "bad" ? "text-status-critical" : "text-ink-secondary";
  return (
    <span className={`flex flex-col tabular-nums ${align === "right" ? "items-end" : "items-start"}`}>
      <span className={`${ROW_TEXT} font-bold leading-tight ${notYet ? "text-ink-muted" : color}`}>{notYet ? "–" : formatPoints(resolved.livePoints)}</span>
      <span className={`${NOTE_TEXT} text-ink-muted`} title="Projected">
        {projected !== null ? formatPoints(projected) : "\u00a0"}
      </span>
    </span>
  );
}

/** The team a starter's playing, colored by how that defense ranks against their position, the rank beside it — or BYE. */
function OpponentNote({ playerId }: { playerId: string }) {
  const note = useContext(LineNoteContext).get(playerId);
  if (note?.bye) return <span className="text-ink-muted">BYE</span>;
  if (!note?.opponent) return null;
  return (
    <span
      className="whitespace-nowrap font-semibold"
      style={note.share !== null ? { color: matchupColor(note.share) } : undefined}
      title={note.rank !== null ? `${note.opponent}'s defense: ${note.rank} against the position (1 allows the fewest points)` : undefined}
    >
      {note.opponent}
      {note.rank !== null ? ` (${note.rank})` : ""}
    </span>
  );
}

/** Whether the league's a dynasty league, for what the starters' value ranks are by. */
const DynastyContext = createContext(false);

/** What the numbers on each starter's second line are, under the lineup's middle — each in its own color. */
function LineLegend() {
  const dynasty = useContext(DynastyContext);
  return (
    <p className={`flex flex-wrap justify-center gap-x-2 gap-y-0.5 font-semibold ${NOTE_TEXT}`}>
      <span className="text-series-4">{dynasty ? "Dynasty" : "Redraft"} rank</span>
      <span className="text-series-1">Season rank</span>
      <span className="text-ink-muted">Points per game</span>
    </p>
  );
}

/** Each team's live projected total, by roster (see liveProjection) — none until the projections load. */
const ProjectedContext = createContext<Map<number, number> | null>(null);

/** A team's projected total, small, on its name's line (over its score). */
function Projected({ rosterId, align }: { rosterId: number; align: "left" | "right" }) {
  const projected = useContext(ProjectedContext)?.get(rosterId);
  if (projected === undefined) return null;
  return (
    <span
      className={`shrink-0 text-[0.6875rem] font-normal tabular-nums opacity-70 ${align === "right" ? "text-right" : "text-left"}`}
      title="Projected: Sleeper's pregame projections, with each player's actual points once their game is over"
    >
      {formatPoints(projected)}
    </span>
  );
}

// Sleeper's own slot code — abbreviate the one that's spelled out.
function slotLabel(slot: string): string {
  return slot === "SUPER_FLEX" ? "SF" : slot;
}

// Fixed column widths so every row's headshot/name/points line up. On a
// phone this is only ~150px wide per side, so names go through
// abbreviateFirstName ("Josh Allen" -> "J. Allen") there, and from sm up the
// columns widen and show the full name. All rem, so it scales with the fluid
// root. Mirrored left-to-right for the "their" side, which reads
// right-to-left (points nearest the middle, headshot on the outside).
const MY_ROW_COLS = "grid-cols-[1.875rem_minmax(0,1fr)_1.75rem] sm:grid-cols-[2.125rem_minmax(0,1fr)_2.5rem]";
const THEIR_ROW_COLS = "grid-cols-[1.75rem_minmax(0,1fr)_1.875rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_2.125rem]";
// The middle column fits the widest slot label (FLEX) in bold, and no more; every slot box fills it.
const SLOT_COLS = "grid-cols-[1fr_1.5rem_1fr] sm:grid-cols-[1fr_1.8rem_1fr]";
const ROW_TEXT = "text-[0.6875rem] sm:text-[0.8125rem]";
// A starter's second line, under their name and points: smaller, set tight, so the two lines take about the photo's height.
const NOTE_TEXT = "text-[0.5625rem] leading-none sm:text-[0.625rem] sm:leading-none";

/** "J. Allen" on a phone, "Josh Allen" from sm up. */
function PlayerName({ name }: { name: string }) {
  return (
    <>
      <span className="sm:hidden">{abbreviateFirstName(name)}</span>
      <span className="hidden sm:inline">{name}</span>
    </>
  );
}

/** A starter's photo, square (see PlayerHeadshot), bigger than their row — spilling into the gaps above and below it, never making the row taller. */
function SlotPhoto({ playerId }: { playerId: string }) {
  return (
    <span className="-my-1 flex justify-center">
      <PlayerHeadshot playerId={playerId} sizeClass="h-[1.875rem] w-[1.875rem] sm:h-[2.125rem] sm:w-[2.125rem]" square />
    </span>
  );
}

/**
 * The player's name, and under it, from the outside in, each in a column lined up with every other row's: their rank at their position by KTC value (dynasty in
 * a dynasty league, redraft otherwise), by this season's points, their points a game this season, and who
 * they're playing (see OpponentNote).
 */
function RankedName({ resolved, align }: { resolved: ResolvedSlot; align: "left" | "right" }) {
  const { player, valueRank, seasonRank, ppg } = resolved;
  // Each in a column of its own width, kept even when it's empty, so every row's line up — the numbers centered in
  // the column.
  const pieces = [
    <span key="value" className="w-[3ch] shrink-0 text-center text-series-4" title={valueRank ? `${player!.position}${valueRank} by trade value` : undefined}>
      {valueRank ?? ""}
    </span>,
    <span key="season" className="w-[3ch] shrink-0 text-center text-series-1" title={seasonRank ? `${player!.position}${seasonRank} by points this season` : undefined}>
      {seasonRank ?? ""}
    </span>,
    <span key="ppg" className="w-[4ch] shrink-0 text-center text-ink-muted" title={ppg !== null ? "Points per game this season" : undefined}>
      {ppg !== null ? ppg.toFixed(1) : ""}
    </span>,
    <OpponentNote key="opponent" playerId={player!.playerId} />,
  ];
  return (
    <span className={`flex min-w-0 flex-col ${align === "right" ? "items-end" : "items-start"}`}>
      <span className={`max-w-full truncate ${ROW_TEXT} font-bold leading-tight text-ink-primary`}>
        <PlayerName name={player!.name} />
      </span>
      {/* Kept a line tall even with nothing on it. */}
      <span className={`flex min-h-[1em] max-w-full gap-1 overflow-hidden whitespace-nowrap font-semibold tabular-nums ${NOTE_TEXT}`}>
        {align === "right" ? pieces.reverse() : pieces}
      </span>
    </span>
  );
}

function MySlotPlayer({ resolved }: { resolved: ResolvedSlot }) {
  if (!resolved.player) {
    return (
      <div className={`grid ${MY_ROW_COLS} items-center gap-0.5 sm:gap-1 ${ROW_TEXT} text-ink-muted`}>
        <span />
        <span>Empty</span>
        <span />
      </div>
    );
  }
  return (
    <div className={`grid ${MY_ROW_COLS} items-center gap-0.5 sm:gap-1`}>
      <SlotPhoto playerId={resolved.player.playerId} />
      <RankedName resolved={resolved} align="left" />
      <SlotPoints resolved={resolved} align="right" />
    </div>
  );
}

function TheirSlotPlayer({ resolved }: { resolved: ResolvedSlot }) {
  if (!resolved.player) {
    return (
      <div className={`grid ${THEIR_ROW_COLS} items-center gap-0.5 sm:gap-1 ${ROW_TEXT} text-ink-muted`}>
        <span />
        <span className="text-right">Empty</span>
        <span />
      </div>
    );
  }
  return (
    <div className={`grid ${THEIR_ROW_COLS} items-center gap-0.5 sm:gap-1`}>
      <SlotPoints resolved={resolved} align="left" />
      <RankedName resolved={resolved} align="right" />
      <SlotPhoto playerId={resolved.player.playerId} />
    </div>
  );
}

function SlotRow({ slot, my, their }: { slot: string; my: ResolvedSlot; their: ResolvedSlot | undefined }) {
  return (
    <div className={`grid ${SLOT_COLS} items-center gap-1 sm:gap-2`}>
      <MySlotPlayer resolved={my} />
      {/* Every box the same width — the column's, which fits FLEX and no more. Outlined in its own text color, every slot alike. */}
      <span className="justify-self-stretch border border-current py-px text-center text-[0.625rem] font-bold uppercase leading-tight text-ink-primary sm:text-[0.6875rem]">
        {slotLabel(slot)}
      </span>
      {their ? <TheirSlotPlayer resolved={their} /> : <div />}
    </div>
  );
}

type MatchupTeam = ResolvedMatchupGame["teams"][number];

/** Every position the league's lineups can start — the bench's columns. */
const NO_POSITIONS: string[] = [];
const PositionsContext = createContext<string[]>(NO_POSITIONS);

/**
 * The bench's sorts: each a label and how to order two players (best first), given their second line's note.
 * Players with nothing to sort by go last.
 */
const BENCH_SORTS: { id: string; label: (dynasty: boolean) => string; key: (s: ResolvedSlot, note: LineNote | undefined) => number | null }[] = [
  { id: "projected", label: () => "Projected", key: (_, note) => note?.projected ?? null },
  // Easiest first: the defense allowing the position the most.
  { id: "matchup", label: () => "Matchup", key: (_, note) => note?.share ?? null },
  { id: "ppg", label: () => "Points per game", key: (s) => s.ppg },
  { id: "points", label: () => "Points", key: (s) => s.livePoints },
  { id: "season", label: () => "Season rank", key: (s) => (s.seasonRank === null ? null : -s.seasonRank) },
  { id: "value", label: (dynasty) => `${dynasty ? "Dynasty" : "Redraft"} rank`, key: (s) => (s.valueRank === null ? null : -s.valueRank) },
];

/** The fewest bench players a row fits across, and the narrowest one can be (rem) for its numbers to show whole — as many fit as can. */
const BENCH_FIT = { phone: { least: 2, min: 9 }, wide: { least: 2, min: 12.5 } };

/**
 * Your bench, under your lineup: a row for each position the league can start (and any other a bench player
 * plays), its players side by side to swipe through, sorted as picked (most projected first unless another's
 * chosen), each laid out as a starter is, every number alike. Every player in a row shows whole: two across on a
 * phone, three or as many more as fit wider.
 */
function Bench({ bench }: { bench: ResolvedSlot[] }) {
  const leaguePositions = useContext(PositionsContext);
  const notes = useContext(LineNoteContext);
  const dynasty = useContext(DynastyContext);
  const [sortId, setSortId] = useState(() => getHomeView().benchSort ?? "projected");
  const sort = BENCH_SORTS.find((s) => s.id === sortId) ?? BENCH_SORTS[0];
  // Each player's width, so a whole number of them fill the row exactly — measured off the first row.
  const stripRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState<number | null>(null);
  const hasBench = bench.length > 0;
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const fit = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const { least, min } = window.matchMedia("(min-width: 640px)").matches ? BENCH_FIT.wide : BENCH_FIT.phone;
      const n = Math.max(least, Math.floor((el.clientWidth + gap) / (min * rem + gap)));
      setCardWidth(Math.floor((el.clientWidth - (n - 1) * gap) / n));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasBench]);
  if (!hasBench) return null;
  const positions = [...new Set([...leaguePositions, ...bench.map((s) => s.player!.position)])];
  const keyOf = (s: ResolvedSlot) => sort.key(s, notes.get(s.player!.playerId)) ?? -Infinity;
  const pick = (id: string) => {
    setSortId(id);
    saveHomeView({ benchSort: id });
  };
  return (
    <div className="flex flex-col gap-2.5 border-t border-border pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted sm:text-[0.6875rem]">Bench</p>
        <label className="flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted sm:text-[0.6875rem]">
          Sort
          <select
            value={sort.id}
            onChange={(e) => pick(e.target.value)}
            className="border border-ink-primary bg-page px-1 py-px font-bold uppercase text-ink-primary"
          >
            {BENCH_SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label(dynasty)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {positions.map((position, row) => {
        const players = bench.filter((s) => s.player!.position === position).sort((a, b) => keyOf(b) - keyOf(a));
        return (
          // On a phone the position sits over its row, so two players fit across whole; wider, beside it.
          <div key={position} className="flex flex-col gap-1 sm:grid sm:grid-cols-[1.8rem_minmax(0,1fr)] sm:items-center sm:gap-4">
            <span className="w-[1.5rem] border border-current py-px text-center text-[0.625rem] font-bold uppercase leading-tight text-ink-primary sm:w-auto sm:text-[0.6875rem]">
              {position}
            </span>
            {/* Room above and below for the photos, which spill past their rows; no scrollbar, it's swiped — the
                last player snapping to the end, so the row swipes all the way to them. */}
            <div
              ref={row === 0 ? stripRef : undefined}
              className="-my-1 flex snap-x snap-mandatory gap-2 overflow-x-auto py-1 [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
            >
              {players.length === 0 ? <span className={`text-ink-muted ${ROW_TEXT}`}>–</span> : null}
              {players.map((s, i) => (
                <div
                  key={s.player!.playerId}
                  className={`shrink-0 ${i === players.length - 1 ? "snap-end" : "snap-start"} ${cardWidth === null ? "basis-1/2 sm:basis-1/3" : ""}`}
                  style={cardWidth === null ? undefined : { width: cardWidth }}
                >
                  <MySlotPlayer resolved={s} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The matchup's header, laid on the lineup's own grid: each team's line
 * (rank, name, record, streak — the league boxes' format) over its score, and
 * each score sitting right over its column of player points, the all-time
 * head-to-head record at the outside edges with PF/PA ranks just inside —
 * all on one highlighted block, like a map tag.
 */
function MatchupHeader({
  leagueId,
  left,
  right,
  standings,
  headToHead,
}: {
  leagueId: string;
  left: MatchupTeam;
  right: MatchupTeam | undefined;
  standings: Map<number, TeamStanding>;
  /** Each side's all-time record against the other, by roster — absent until it's loaded. */
  headToHead: Map<number, AllTimeRecord> | null;
}) {
  const label = (t: MatchupTeam, align: "left" | "right") => (
    <TeamNameLabel
      name={t.teamName}
      standing={standings.get(t.rosterId) ?? {}}
      align={align}
      href={`/team?league=${leagueId}&roster=${t.rosterId}`}
      onTag
      stackOnPhone
    />
  );
  // The all-time head-to-head record at the outside edge, then PF/PA just inside it.
  const badges = (t: MatchupTeam, side: "left" | "right") => {
    const pf = <PointsRankBadges pointsRanks={standings.get(t.rosterId)?.pointsRanks} leagueSize={standings.size} onTag />;
    const rec = right ? headToHead?.get(t.rosterId) : undefined;
    const h2h = rec ? <HeadToHeadBadge wins={rec.wins} losses={rec.losses} onTag /> : null;
    return (
      <span className="flex items-baseline gap-1 lg:gap-2">
        {side === "left" ? h2h : pf}
        {side === "left" ? pf : h2h}
      </span>
    );
  };
  return (
    <div className="flex flex-col gap-1.5 bg-[var(--map-tag)] px-2 py-2 text-[var(--map-tag-ink)]">
      {/* Each name with its projected total right over the score, on a line that's there anyway: the name's
          own, or on a phone (where the name sits over its rank and record) the rank and record's. */}
      <div className={`grid ${SLOT_COLS} items-start gap-1 sm:gap-2`}>
        <div className="flex min-w-0 items-baseline-last justify-between gap-2 sm:items-baseline">
          <div className="min-w-0">{label(left, "left")}</div>
          <Projected rosterId={left.rosterId} align="right" />
        </div>
        <span />
        {right ? (
          <div className="flex min-w-0 items-baseline-last justify-between gap-2 sm:items-baseline">
            <Projected rosterId={right.rosterId} align="left" />
            <div className="min-w-0">{label(right, "right")}</div>
          </div>
        ) : (
          <div />
        )}
      </div>
      <div className={`grid ${SLOT_COLS} items-baseline gap-1 text-[0.9375rem] font-semibold tabular-nums sm:gap-2 sm:text-lg`}>
        <span className="flex items-baseline justify-between gap-1 lg:gap-2">
          {badges(left, "left")}
          {formatPoints(left.points)}
        </span>
        <span />
        {right ? (
          <span className="flex items-baseline justify-between gap-1 lg:gap-2">
            {formatPoints(right.points)}
            {badges(right, "right")}
          </span>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

/** A matchup's lineups, slot by slot: yours (or the first team's) on the left — and when it's yours, your bench under them. */
function MatchupLineup({ game, myRosterId }: { game: ResolvedMatchupGame; myRosterId: number | null }) {
  const [mine, other] = sides(game, myRosterId);
  return (
    <div className="flex flex-col gap-2.5 px-2">
      {mine.slots.map((slot, i) => (
        <SlotRow key={i} slot={slot.slot} my={slot} their={other?.slots[i]} />
      ))}
      <LineLegend />
      {mine.rosterId === myRosterId ? <Bench bench={mine.bench} /> : null}
    </div>
  );
}

function MatchupSlide({
  leagueId,
  game,
  myRosterId,
  standings,
  owners,
  allTime,
}: {
  leagueId: string;
  game: ResolvedMatchupGame;
  myRosterId: number | null;
  standings: Map<number, TeamStanding>;
  owners: Map<number, string>;
  allTime: Map<string, Map<string, AllTimeRecord>> | null;
}) {
  const [mine, other] = sides(game, myRosterId);
  return (
    <div className="flex flex-col gap-3">
      <MatchupHeader
        leagueId={leagueId}
        left={mine}
        right={other}
        standings={standings}
        headToHead={headToHeadFor(mine, other, owners, allTime)}
      />
      <MatchupLineup game={game} myRosterId={myRosterId} />
    </div>
  );
}

/**
 * A shut matchup in the phone's stack, on one line: each team's name and
 * score, the scores meeting in the middle — on the same plate as the full
 * header it opens into.
 */
function CompactHeader({ left, right }: { left: MatchupTeam; right: MatchupTeam | undefined }) {
  return (
    <div
      className={`grid ${SLOT_COLS} items-baseline gap-1 bg-[var(--map-tag)] px-2 py-2 text-[0.8125rem] text-[var(--map-tag-ink)] sm:gap-2`}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{left.teamName}</span>
        <Projected rosterId={left.rosterId} align="right" />
        <span className="shrink-0 font-semibold tabular-nums">{formatPoints(left.points)}</span>
      </span>
      <span />
      {right ? (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-semibold tabular-nums">{formatPoints(right.points)}</span>
          <Projected rosterId={right.rosterId} align="left" />
          <span className="min-w-0 flex-1 truncate text-right font-semibold">{right.teamName}</span>
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

/** How long a lineup takes to fold open or shut in the phone's stack. */
const FOLD_MS = 450;

/**
 * Phones: every matchup stacked, yours on top — the open one with its full
 * header and lineup, the rest down to a line each (names and scores).
 * Tapping one opens it and shuts whichever was open (tapping the open one shuts
 * it). Opens on yours. The tapped header holds still on screen while the one
 * above it folds shut, rather than jumping up with it.
 */
function MatchupStack({
  leagueId,
  games,
  myRosterId,
  standings,
  owners,
  allTime,
  onOpen,
}: {
  leagueId: string;
  games: ResolvedMatchupGame[];
  myRosterId: number | null;
  standings: Map<number, TeamStanding>;
  owners: Map<number, string>;
  allTime: Map<string, Map<string, AllTimeRecord>> | null;
  /** Told whenever a matchup is opened. */
  onOpen?: (matchupId: number) => void;
}) {
  const myGame = games.find((g) => g.teams.some((t) => t.rosterId === myRosterId));
  const stacked = myGame ? [myGame, ...games.filter((g) => g !== myGame)] : games;
  // Undefined until something's tapped: then yours is the one open.
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  const openId = chosen === undefined ? (myGame?.matchupId ?? null) : chosen;
  const hold = useRef(0);
  useEffect(() => () => cancelAnimationFrame(hold.current), []);

  function toggle(matchupId: number, header: HTMLElement) {
    setChosen(openId === matchupId ? null : matchupId);
    if (openId !== matchupId) onOpen?.(matchupId);
    // Keep the tapped header where it is while everything around it folds.
    cancelAnimationFrame(hold.current);
    const top = header.getBoundingClientRect().top;
    let start: number | null = null;
    const follow = (now: number) => {
      start ??= now;
      const drift = header.getBoundingClientRect().top - top;
      if (Math.abs(drift) >= 1) window.scrollBy(0, drift);
      if (now - start < FOLD_MS + 100) hold.current = requestAnimationFrame(follow);
    };
    hold.current = requestAnimationFrame(follow);
  }

  return (
    <ul className="flex flex-col gap-2 [overflow-anchor:none]" aria-label="This week's matchups">
      {stacked.map((g) => {
        const [mine, other] = sides(g, myRosterId);
        const open = g.matchupId === openId;
        return (
          <li key={g.matchupId}>
            {/* The whole header toggles its lineup — except the team names, which still go to each team's page. */}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={open}
              aria-controls={`lineup-${g.matchupId}`}
              onClick={(e) => {
                if ((e.target as Element).closest("a")) return;
                toggle(g.matchupId, e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                e.preventDefault();
                toggle(g.matchupId, e.currentTarget);
              }}
              className="cursor-pointer"
            >
              {/* Open, the full header; shut, just the names and scores. */}
              {open ? (
                <MatchupHeader
                  leagueId={leagueId}
                  left={mine}
                  right={other}
                  standings={standings}
                  headToHead={headToHeadFor(mine, other, owners, allTime)}
                />
              ) : (
                <CompactHeader left={mine} right={other} />
              )}
            </div>
            {/* Folds open and shut by its height (0fr to 1fr). */}
            <div
              id={`lineup-${g.matchupId}`}
              className={`grid transition-[grid-template-rows] ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              style={{ transitionDuration: `${FOLD_MS}ms` }}
              inert={!open}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pb-2 pt-3">
                  <MatchupLineup game={g} myRosterId={myRosterId} />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Both teams' all-time records against each other, by roster, from the
 * league-wide head-to-head — by manager, or for an unclaimed team by its
 * team slot. Two teams who've never met are 0-0; null until loaded.
 */
function headToHeadFor(
  a: MatchupTeam,
  b: MatchupTeam | undefined,
  owners: Map<number, string>,
  allTime: Map<string, Map<string, AllTimeRecord>> | null
): Map<number, AllTimeRecord> | null {
  if (!b || !allTime) return null;
  // An unclaimed team (no owner) is looked up by its team slot instead.
  const keyA = headToHeadKey(a.rosterId, owners.get(a.rosterId));
  const keyB = headToHeadKey(b.rosterId, owners.get(b.rosterId));
  const rec = allTime.get(keyA)?.get(keyB) ?? { wins: 0, losses: 0 };
  return new Map([
    [a.rosterId, rec],
    [b.rosterId, { wins: rec.losses, losses: rec.wins }],
  ]);
}

/** A matchup's two teams, yours first when it's yours — the order the full view shows them in. */
function sides(game: ResolvedMatchupGame, myRosterId: number | null) {
  const mine = game.teams.find((t) => t.rosterId === myRosterId) ?? game.teams[0];
  const other = game.teams.find((t) => t.rosterId !== mine.rosterId);
  return other ? [mine, other] : [mine];
}

/**
 * Sleeper-style matchup view: full lineup, slot by slot, for the league's
 * current week. On a phone every matchup's header is stacked, and tapping one
 * opens its lineup (see MatchupStack); from tablet width up the chosen matchup takes the left 70%
 * and every matchup is listed down the right 30% — boxes in the league
 * ticker's format — to pick from. Opens on your own matchup.
 */
export function LeagueMatchupCarousel({
  leagueId,
  games,
  myRosterId,
  standings,
  owners,
  pending,
  onShowMatchup,
  projected = null,
  lineTones,
  lineNotes,
  dynasty = false,
  positions = NO_POSITIONS,
}: {
  leagueId: string;
  games: ResolvedMatchupGame[];
  myRosterId: number | null;
  /** Every team's standing in the league (see teamStandings), shown around its name and score. */
  standings: Map<number, TeamStanding>;
  /** Each roster's owner (Sleeper user id), to look up all-time head-to-head records. */
  owners: Map<number, string>;
  /** With "as it stands" on, this season's unfinished weeks' matchups, counted in the head-to-heads. */
  pending?: PendingMatchups | null;
  /** Told whenever another matchup is picked to look at (opened on a phone, picked from the list from tablet width up). */
  onShowMatchup?: (matchupId: number) => void;
  /** Each team's live projected total, by roster, shown over its score. */
  projected?: Map<number, number> | null;
  /** How each starter's points read (see LineTone), by player id. */
  lineTones?: Map<string, LineTone>;
  /** Each starter's second line (see LineNote), by player id. */
  lineNotes?: Map<string, LineNote>;
  /** A dynasty league (see DynastyContext). */
  dynasty?: boolean;
  /** Every position the league's lineups can start (see PositionsContext). */
  positions?: string[];
}) {
  // The matchup shown large beside the list (tablet and up): yours until another is picked.
  const [pickedId, setPickedId] = useState<number | null>(null);
  const allTimeOfficial = useAllTimeHeadToHead(leagueId);
  const allTimeByOwner = useMemo(
    () => (pending && allTimeOfficial.size > 0 ? headToHeadAsItStands(allTimeOfficial, pending, owners) : allTimeOfficial),
    [allTimeOfficial, pending, owners]
  );
  // Empty until every season's matchups have loaded.
  const allTime = allTimeByOwner.size > 0 ? allTimeByOwner : null;

  if (games.length === 0) return null;
  const myGame = games.find((g) => g.teams.some((t) => t.rosterId === myRosterId));
  const picked = games.find((g) => g.matchupId === pickedId) ?? myGame ?? games[0];

  return (
    <ProjectedContext.Provider value={projected}>
    <LineToneContext.Provider value={lineTones ?? EMPTY_TONES}>
    <LineNoteContext.Provider value={lineNotes ?? EMPTY_NOTES}>
    <DynastyContext.Provider value={dynasty}>
    <PositionsContext.Provider value={positions}>
      {/* Phones: every matchup's header stacked; tap one for its lineup. */}
      <div className="md:hidden">
        <MatchupStack
          leagueId={leagueId}
          games={games}
          myRosterId={myRosterId}
          standings={standings}
          owners={owners}
          allTime={allTime}
          onOpen={onShowMatchup}
        />
      </div>

      {/* Tablet and up: the chosen matchup large on the left (70%), every matchup listed on the right (30%, never narrower than 16rem so names stay readable). */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,7fr)_minmax(16rem,3fr)] md:items-start md:gap-3">
        <MatchupSlide leagueId={leagueId} game={picked} myRosterId={myRosterId} standings={standings} owners={owners} allTime={allTime} />
        <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2" aria-label="This week's matchups">
          {games.map((g) => {
            const active = g.matchupId === picked.matchupId;
            return (
              <li key={g.matchupId}>
                <button
                  type="button"
                  aria-current={active || undefined}
                  onClick={() => {
                    setPickedId(g.matchupId);
                    onShowMatchup?.(g.matchupId);
                  }}
                  className={`w-full border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-ink-primary bg-[color-mix(in_srgb,var(--map-tag)_7%,transparent)]"
                      : "border-border hover:border-ink-primary/40"
                  }`}
                >
                  <MatchupRows
                    fitWidth
                    teams={sides(g, myRosterId).map((t) => ({
                      name: t.teamName,
                      points: t.points,
                      standing: standings.get(t.rosterId),
                      mine: t.rosterId === myRosterId,
                    }))}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        </div>
      </div>
    </PositionsContext.Provider>
    </DynastyContext.Provider>
    </LineNoteContext.Provider>
    </LineToneContext.Provider>
    </ProjectedContext.Provider>
  );
}
