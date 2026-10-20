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

/**
 * How a starter's points read, by player id: "pre" before they've played (a dash), "good" on pace for
 * their projection (or, game over, beating it), "bad" behind it, null with nothing to measure against.
 */
export type LineTone = "pre" | "good" | "bad" | null;
const EMPTY_TONES = new Map<string, LineTone>();
const LineToneContext = createContext<Map<string, LineTone>>(EMPTY_TONES);

/**
 * What a starter's second line says, by player id: the team they're playing this week (null not known yet, or
 * on a bye), that defense's rank against their position (1 the fewest points allowed, of `of`), and their
 * projected points.
 */
export interface LineNote {
  opponent: string | null;
  bye: boolean;
  rank: number | null;
  of: number;
  projected: number | null;
}
const EMPTY_NOTES = new Map<string, LineNote>();
const LineNoteContext = createContext<Map<string, LineNote>>(EMPTY_NOTES);

/** A defense's rank as a color: red for the toughest (1), through yellow, to green for the easiest. */
function matchupColor(rank: number, of: number): string {
  const t = of > 1 ? (rank - 1) / (of - 1) : 0.5;
  return t < 0.5
    ? `color-mix(in oklab, var(--status-warning) ${Math.round(t * 200)}%, var(--status-critical))`
    : `color-mix(in oklab, var(--status-good) ${Math.round((t - 0.5) * 200)}%, var(--status-warning))`;
}

/** A starter's points in the lineup: a dash before they've played; green on pace, red behind — their projection under them, small. */
function SlotPoints({ resolved, align }: { resolved: ResolvedSlot; align: "left" | "right" }) {
  const tone = useContext(LineToneContext).get(resolved.player?.playerId ?? "");
  const projected = useContext(LineNoteContext).get(resolved.player?.playerId ?? "")?.projected ?? null;
  const notYet = tone === "pre" && resolved.livePoints === 0;
  const color = tone === "good" ? "font-semibold text-status-good" : tone === "bad" ? "font-semibold text-status-critical" : "text-ink-secondary";
  return (
    <span className={`flex flex-col tabular-nums ${align === "right" ? "items-end" : "items-start"}`}>
      <span className={`${ROW_TEXT} leading-tight ${notYet ? "text-ink-muted" : color}`}>{notYet ? "–" : formatPoints(resolved.livePoints)}</span>
      <span className={`${NOTE_TEXT} text-ink-muted`} title="Projected">
        {projected !== null ? formatPoints(projected) : "\u00a0"}
      </span>
    </span>
  );
}

/** Under a starter's name: the team they're playing, colored by how that defense ranks against their position, the rank beside it. */
function OpponentNote({ playerId }: { playerId: string }) {
  const note = useContext(LineNoteContext).get(playerId);
  if (note?.bye) return <span className={`${NOTE_TEXT} text-ink-muted`}>BYE</span>;
  if (!note?.opponent) return <span className={NOTE_TEXT}>{"\u00a0"}</span>;
  return (
    <span
      className={`${NOTE_TEXT} whitespace-nowrap font-semibold tabular-nums`}
      style={note.rank !== null ? { color: matchupColor(note.rank, note.of) } : undefined}
      title={note.rank !== null ? `${note.opponent}'s defense: ${note.rank} of ${note.of} against the position (1 allows the fewest points)` : undefined}
    >
      {note.opponent}
      {note.rank !== null ? ` (${note.rank})` : ""}
    </span>
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
const MY_ROW_COLS = "grid-cols-[1.375rem_minmax(0,1fr)_1.75rem] sm:grid-cols-[1.375rem_minmax(0,1fr)_2.5rem]";
const THEIR_ROW_COLS = "grid-cols-[1.75rem_minmax(0,1fr)_1.375rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_1.375rem]";
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

/**
 * The player's name with their rank at their position (12 for the 12th-best
 * WR; see positionBlendRankIndexFor) on its outer side — left of the name for your team, right of
 * it for theirs — styled like the standings rank beside team names.
 */
function RankedName({ resolved, align }: { resolved: ResolvedSlot; align: "left" | "right" }) {
  // Always the same width — room for three digits, kept even when there's no
  // rank — so every name in the column starts (or, on their side, ends) on
  // the same line. The number sits against the name.
  const rank = (
    <span
      className={`w-[3ch] shrink-0 text-[0.625rem] font-medium tabular-nums text-series-4 sm:text-xs ${
        align === "left" ? "text-right" : "text-left"
      }`}
      title={
        resolved.seasonRank
          ? `${resolved.player?.position ?? ""}${resolved.seasonRank} — season points, points per game and dynasty value (in dynasty leagues), blended`
          : undefined
      }
    >
      {resolved.seasonRank ?? ""}
    </span>
  );
  // The name over its matchup, the rank level with the name.
  return (
    <span className={`flex min-w-0 items-baseline gap-1 ${align === "right" ? "justify-end" : ""}`}>
      {align === "left" ? rank : null}
      <span className={`flex min-w-0 flex-col ${align === "right" ? "items-end" : "items-start"}`}>
        <span className={`max-w-full truncate ${ROW_TEXT} font-medium leading-tight text-ink-primary`}>
          <PlayerName name={resolved.player!.name} />
        </span>
        <OpponentNote playerId={resolved.player!.playerId} />
      </span>
      {align === "right" ? rank : null}
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
      <PlayerHeadshot playerId={resolved.player.playerId} size={22} />
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
      <PlayerHeadshot playerId={resolved.player.playerId} size={22} />
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

/** A matchup's lineups, slot by slot: yours (or the first team's) on the left. */
function MatchupLineup({ game, myRosterId }: { game: ResolvedMatchupGame; myRosterId: number | null }) {
  const [mine, other] = sides(game, myRosterId);
  return (
    <div className="flex flex-col gap-2.5 px-2">
      {mine.slots.map((slot, i) => (
        <SlotRow key={i} slot={slot.slot} my={slot} their={other?.slots[i]} />
      ))}
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
    </LineNoteContext.Provider>
    </LineToneContext.Provider>
    </ProjectedContext.Provider>
  );
}
