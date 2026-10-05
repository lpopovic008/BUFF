"use client";

import { useEffect, useRef, useState } from "react";
import { ResolvedMatchupGame, ResolvedSlot } from "@/hooks/useLeagueMatchupCarousel";
import { PointsRankBadges, TeamNameLabel } from "@/components/DashboardMatchupCard";
import { TeamStanding } from "@/lib/league-data";
import { MatchupRows } from "@/components/LeagueTicker";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icon";
import { abbreviateFirstName, formatPoints } from "@/lib/format";
import { POSITION_SOFT_BG } from "@/lib/position-colors";

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
const SLOT_COLS = "grid-cols-[1fr_1.875rem_1fr] sm:grid-cols-[1fr_2.75rem_1fr]";
const ROW_TEXT = "text-[0.6875rem] sm:text-[0.8125rem]";

/** "J. Allen" on a phone, "Josh Allen" from sm up. */
function PlayerName({ name }: { name: string }) {
  return (
    <>
      <span className="sm:hidden">{abbreviateFirstName(name)}</span>
      <span className="hidden sm:inline">{name}</span>
    </>
  );
}

/** The player's season rank at their position ("WR12"), then their name — styled like the standings rank beside team names in the league boxes. */
function RankedName({ resolved, align }: { resolved: ResolvedSlot; align: "left" | "right" }) {
  return (
    <span className={`flex min-w-0 items-baseline gap-1 ${align === "right" ? "justify-end" : ""}`}>
      {resolved.seasonRank ? (
        <span
          className="shrink-0 text-[0.625rem] font-medium tabular-nums text-series-4 sm:text-xs"
          title="Season rank at position, by fantasy points"
        >
          {resolved.seasonRank}
        </span>
      ) : null}
      <span className={`truncate ${ROW_TEXT} font-medium text-ink-primary`}>
        <PlayerName name={resolved.player!.name} />
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
      <PlayerHeadshot playerId={resolved.player.playerId} size={22} />
      <RankedName resolved={resolved} align="left" />
      <span className={`text-right tabular-nums ${ROW_TEXT} text-ink-secondary`}>{formatPoints(resolved.livePoints)}</span>
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
      <span className={`tabular-nums ${ROW_TEXT} text-ink-secondary`}>{formatPoints(resolved.livePoints)}</span>
      <RankedName resolved={resolved} align="right" />
      <PlayerHeadshot playerId={resolved.player.playerId} size={22} />
    </div>
  );
}

function SlotRow({ slot, my, their }: { slot: string; my: ResolvedSlot; their: ResolvedSlot | undefined }) {
  const colorClasses = POSITION_SOFT_BG[slot];
  return (
    <div className={`grid ${SLOT_COLS} items-center gap-1 sm:gap-2`}>
      <MySlotPlayer resolved={my} />
      <span
        className={`px-1 py-0.5 text-center text-[0.625rem] font-medium uppercase sm:text-[0.6875rem] ${
          colorClasses ?? "text-ink-muted"
        }`}
      >
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
 * each score sitting right over its column of player points, PF/PA ranks
 * tight to the outside edges — all on one highlighted block, like a map tag.
 */
function MatchupHeader({
  leagueId,
  left,
  right,
  standings,
}: {
  leagueId: string;
  left: MatchupTeam;
  right: MatchupTeam | undefined;
  standings: Map<number, TeamStanding>;
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
  const badges = (t: MatchupTeam) => (
    <PointsRankBadges pointsRanks={standings.get(t.rosterId)?.pointsRanks} leagueSize={standings.size} onTag />
  );
  return (
    <div className="flex flex-col gap-1.5 bg-[var(--map-tag)] px-2 py-2 text-[var(--map-tag-ink)]">
      <div className={`grid ${SLOT_COLS} items-start gap-1 sm:gap-2`}>
        {label(left, "left")}
        <span />
        {right ? label(right, "right") : <div />}
      </div>
      <div className={`grid ${SLOT_COLS} items-baseline gap-1 text-base font-semibold tabular-nums sm:gap-2 sm:text-lg`}>
        <span className="flex items-baseline justify-between gap-1.5 sm:gap-2">
          {badges(left)}
          {formatPoints(left.points)}
        </span>
        <span />
        {right ? (
          <span className="flex items-baseline justify-between gap-1.5 sm:gap-2">
            {formatPoints(right.points)}
            {badges(right)}
          </span>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function MatchupSlide({
  leagueId,
  game,
  myRosterId,
  standings,
}: {
  leagueId: string;
  game: ResolvedMatchupGame;
  myRosterId: number | null;
  standings: Map<number, TeamStanding>;
}) {
  const mine = game.teams.find((t) => t.rosterId === myRosterId) ?? game.teams[0];
  const other = game.teams.find((t) => t.rosterId !== mine.rosterId);

  return (
    <div className="w-full shrink-0 snap-center px-0.5">
      <div className="flex flex-col gap-3">
        <MatchupHeader
          leagueId={leagueId}
          left={mine}
          right={other}
          standings={standings}
        />
        <div className="flex flex-col gap-2.5 px-2">
          {mine.slots.map((slot, i) => (
            <SlotRow key={i} slot={slot.slot} my={slot} their={other?.slots[i]} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A matchup's two teams, yours first when it's yours — the order the full view shows them in. */
function sides(game: ResolvedMatchupGame, myRosterId: number | null) {
  const mine = game.teams.find((t) => t.rosterId === myRosterId) ?? game.teams[0];
  const other = game.teams.find((t) => t.rosterId !== mine.rosterId);
  return other ? [mine, other] : [mine];
}

/**
 * Sleeper-style matchup view: full lineup, slot by slot, for the league's
 * current week. On a phone it's a carousel, swiped between every matchup
 * that week; from tablet width up the chosen matchup takes the left 70%
 * and every matchup is listed down the right 30% — boxes in the league
 * ticker's format — to pick from. Opens on your own matchup.
 */
export function LeagueMatchupCarousel({
  leagueId,
  games,
  myRosterId,
  standings,
}: {
  leagueId: string;
  games: ResolvedMatchupGame[];
  myRosterId: number | null;
  /** Every team's standing in the league (see teamStandings), shown around its name and score. */
  standings: Map<number, TeamStanding>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToMine = useRef(false);
  const [index, setIndex] = useState(0);
  // The matchup shown large beside the list (tablet and up): yours until another is picked.
  const [pickedId, setPickedId] = useState<number | null>(null);

  useEffect(() => {
    if (hasScrolledToMine.current || !containerRef.current || myRosterId == null || games.length === 0) return;
    const myIndex = games.findIndex((g) => g.teams.some((t) => t.rosterId === myRosterId));
    if (myIndex < 0) return;
    const container = containerRef.current;
    container.scrollTo({ left: myIndex * container.clientWidth });
    hasScrolledToMine.current = true;
    queueMicrotask(() => setIndex(myIndex));
  }, [games, myRosterId]);

  function scrollToIndex(i: number) {
    if (!containerRef.current) return;
    const clamped = Math.max(0, Math.min(games.length - 1, i));
    containerRef.current.scrollTo({ left: clamped * containerRef.current.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  }

  function handleScroll() {
    if (!containerRef.current || containerRef.current.clientWidth === 0) return;
    setIndex(Math.round(containerRef.current.scrollLeft / containerRef.current.clientWidth));
  }

  if (games.length === 0) return null;
  const myGame = games.find((g) => g.teams.some((t) => t.rosterId === myRosterId));
  const picked = games.find((g) => g.matchupId === pickedId) ?? myGame ?? games[0];

  return (
    <>
      {/* Phones: swipe between matchups. */}
      <div className="flex flex-col gap-3 md:hidden">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {games.map((g) => (
            <MatchupSlide
              key={g.matchupId}
              leagueId={leagueId}
              game={g}
              myRosterId={myRosterId}
              standings={standings}
            />
          ))}
        </div>
        {games.length > 1 ? (
          <div className="flex items-center justify-center gap-3 text-xs text-ink-muted">
            <IconButton
              icon={<ChevronLeftIcon />}
              label="Previous matchup"
              onClick={() => scrollToIndex(index - 1)}
              disabled={index === 0}
            />
            <span className="tabular-nums">
              {index + 1} / {games.length}
            </span>
            <IconButton
              icon={<ChevronRightIcon />}
              label="Next matchup"
              onClick={() => scrollToIndex(index + 1)}
              disabled={index === games.length - 1}
            />
          </div>
        ) : null}
      </div>

      {/* Tablet and up: the chosen matchup large on the left (70%), every matchup listed on the right (30%, never narrower than 16rem so names stay readable). */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,7fr)_minmax(16rem,3fr)] md:items-start md:gap-3">
        <MatchupSlide leagueId={leagueId} game={picked} myRosterId={myRosterId} standings={standings} />
        <ul className="flex flex-col gap-2" aria-label="This week's matchups">
          {games.map((g) => {
            const active = g.matchupId === picked.matchupId;
            return (
              <li key={g.matchupId}>
                <button
                  type="button"
                  aria-current={active || undefined}
                  onClick={() => setPickedId(g.matchupId)}
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
    </>
  );
}
