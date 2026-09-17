"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ResolvedMatchupGame, ResolvedSlot } from "@/hooks/useLeagueMatchupCarousel";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icon";
import { formatPoints } from "@/lib/format";
import { POSITION_SOFT_BG } from "@/lib/position-colors";

// Sleeper's own slot code — abbreviate the one that's spelled out.
function slotLabel(slot: string): string {
  return slot === "SUPER_FLEX" ? "SF" : slot;
}

// The "Pos Rk" / "Dynasty"-"Fantasy" ranks ride as a compact third line under
// the position/team line rather than their own table columns — this view is
// only ~150px wide per side on a phone (main's px-3 + the Card's own p-3
// leave little room even for a player's name), and a real column layout for
// two extra numbers per side left almost nothing for the name itself.
// Spelling the labels out on every row ("Pos Rk 5 · Dynasty 13") overflowed
// that same narrow width and clipped the numbers themselves — the one thing
// that actually has to be legible — so each row shows bare numbers and the
// slide explains what they mean once, in RankLegend below.
function RankLine({ resolved, align }: { resolved: ResolvedSlot; align: "left" | "right" }) {
  return (
    <div className={`truncate text-[9px] tabular-nums text-ink-muted ${align === "right" ? "text-right" : ""}`}>
      {resolved.posRank ?? "–"} · {resolved.valueRank ?? "–"}
    </div>
  );
}

function MySlotPlayer({ resolved }: { resolved: ResolvedSlot }) {
  if (!resolved.player) {
    return <div className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">Empty</div>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <PlayerHeadshot playerId={resolved.player.playerId} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-ink-primary">{resolved.player.name}</div>
        <div className="truncate text-[10px] text-ink-muted">
          {resolved.player.position}
          {resolved.player.team ? ` · ${resolved.player.team}` : ""}
        </div>
        <RankLine resolved={resolved} align="left" />
      </div>
      <span className="shrink-0 tabular-nums text-xs text-ink-secondary">{formatPoints(resolved.livePoints)}</span>
    </div>
  );
}

function TheirSlotPlayer({ resolved }: { resolved: ResolvedSlot }) {
  if (!resolved.player) {
    return <div className="flex min-w-0 items-center justify-end gap-2 text-xs text-ink-muted">Empty</div>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 tabular-nums text-xs text-ink-secondary">{formatPoints(resolved.livePoints)}</span>
      <div className="min-w-0 flex-1 text-right">
        <div className="truncate text-xs font-medium text-ink-primary">{resolved.player.name}</div>
        <div className="truncate text-[10px] text-ink-muted">
          {resolved.player.position}
          {resolved.player.team ? ` · ${resolved.player.team}` : ""}
        </div>
        <RankLine resolved={resolved} align="right" />
      </div>
      <PlayerHeadshot playerId={resolved.player.playerId} size={32} />
    </div>
  );
}

/** Explains the two bare numbers under each player once per slide, instead of spelling the labels out (and clipping) on every row. */
function RankLegend({ valueRankLabel }: { valueRankLabel: "Dynasty" | "Fantasy" }) {
  return (
    <div className="text-center text-[10px] text-ink-muted">
      Below each player: <span className="font-medium">Pos Rk</span> · <span className="font-medium">{valueRankLabel}</span> rank
    </div>
  );
}

function SlotRow({ slot, my, their }: { slot: string; my: ResolvedSlot; their: ResolvedSlot | undefined }) {
  const colorClasses = POSITION_SOFT_BG[slot];
  return (
    <div className="grid grid-cols-[1fr_2rem_1fr] items-center gap-2">
      <MySlotPlayer resolved={my} />
      <span
        className={`px-1 py-0.5 text-center text-[10px] font-medium uppercase ${
          colorClasses ?? "text-ink-muted"
        }`}
      >
        {slotLabel(slot)}
      </span>
      {their ? <TheirSlotPlayer resolved={their} /> : <div />}
    </div>
  );
}

function MatchupSlide({
  leagueId,
  game,
  myRosterId,
  valueRankLabel,
}: {
  leagueId: string;
  game: ResolvedMatchupGame;
  myRosterId: number | null;
  valueRankLabel: "Dynasty" | "Fantasy";
}) {
  const mine = game.teams.find((t) => t.rosterId === myRosterId) ?? game.teams[0];
  const other = game.teams.find((t) => t.rosterId !== mine.rosterId);

  return (
    <div className="w-full shrink-0 snap-center px-0.5">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/team?league=${leagueId}&roster=${mine.rosterId}`}
            className="min-w-0 truncate text-sm font-medium text-series-1 hover:underline"
          >
            {mine.teamName}
          </Link>
          {other ? (
            <Link
              href={`/team?league=${leagueId}&roster=${other.rosterId}`}
              className="min-w-0 truncate text-right text-sm font-medium text-ink-primary hover:underline"
            >
              {other.teamName}
            </Link>
          ) : null}
        </div>
        <div className="flex items-baseline justify-between gap-3 text-lg font-semibold tabular-nums text-ink-primary">
          <span>{formatPoints(mine.points)}</span>
          {other ? <span>{formatPoints(other.points)}</span> : null}
        </div>
        <RankLegend valueRankLabel={valueRankLabel} />
        <div className="flex flex-col gap-2.5">
          {mine.slots.map((slot, i) => (
            <SlotRow key={i} slot={slot.slot} my={slot} their={other?.slots[i]} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Sleeper-style matchup view: full lineup, slot by slot, for the league's current week — swipeable between every matchup that week. */
export function LeagueMatchupCarousel({
  leagueId,
  games,
  myRosterId,
  valueRankLabel,
}: {
  leagueId: string;
  games: ResolvedMatchupGame[];
  myRosterId: number | null;
  valueRankLabel: "Dynasty" | "Fantasy";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToMine = useRef(false);
  const [index, setIndex] = useState(0);

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

  return (
    <div className="flex flex-col gap-3">
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
            valueRankLabel={valueRankLabel}
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
  );
}
