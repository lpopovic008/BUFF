"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TeamRosterView } from "@/hooks/useLeagueTeamRosters";
import { RosterValueTable } from "@/components/RosterValueTable";

function TeamSlide({ leagueId, team }: { leagueId: string; team: TeamRosterView }) {
  return (
    <div className="w-full shrink-0 snap-center px-0.5">
      <div className="flex flex-col gap-3">
        <Link
          href={`/team?league=${leagueId}&roster=${team.rosterId}`}
          className="truncate text-sm font-medium text-series-1 hover:underline"
        >
          {team.teamName}
        </Link>
        <RosterValueTable players={team.players} />
      </div>
    </div>
  );
}

/** Every team's roster in a league, swipeable — the Values tab's "My Teams" carousel, defaulting to your own team. */
export function LeagueRosterCarousel({
  leagueId,
  teams,
  myRosterId,
}: {
  leagueId: string;
  teams: TeamRosterView[];
  myRosterId: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToMine = useRef(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (hasScrolledToMine.current || !containerRef.current || myRosterId == null || teams.length === 0) return;
    const myIndex = teams.findIndex((t) => t.rosterId === myRosterId);
    if (myIndex < 0) return;
    const container = containerRef.current;
    container.scrollTo({ left: myIndex * container.clientWidth });
    hasScrolledToMine.current = true;
    queueMicrotask(() => setIndex(myIndex));
  }, [teams, myRosterId]);

  function scrollToIndex(i: number) {
    if (!containerRef.current) return;
    const clamped = Math.max(0, Math.min(teams.length - 1, i));
    containerRef.current.scrollTo({ left: clamped * containerRef.current.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  }

  function handleScroll() {
    if (!containerRef.current || containerRef.current.clientWidth === 0) return;
    setIndex(Math.round(containerRef.current.scrollLeft / containerRef.current.clientWidth));
  }

  if (teams.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {teams.map((t) => (
          <TeamSlide key={t.rosterId} leagueId={leagueId} team={t} />
        ))}
      </div>
      {teams.length > 1 ? (
        <div className="flex items-center justify-center gap-3 text-xs text-ink-muted">
          <button
            type="button"
            onClick={() => scrollToIndex(index - 1)}
            disabled={index === 0}
            aria-label="Previous team"
            className="rounded-md border border-border px-2 py-1 disabled:opacity-30"
          >
            ←
          </button>
          <span className="tabular-nums">
            Team {index + 1} of {teams.length}
          </span>
          <button
            type="button"
            onClick={() => scrollToIndex(index + 1)}
            disabled={index === teams.length - 1}
            aria-label="Next team"
            className="rounded-md border border-border px-2 py-1 disabled:opacity-30"
          >
            →
          </button>
        </div>
      ) : null}
    </div>
  );
}
