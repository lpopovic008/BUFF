"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLeagueTeamRosters } from "@/hooks/useLeagueTeamRosters";
import { RosterValueTable } from "@/components/RosterValueTable";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "@/components/ui/Icon";

/** One league's row in the Values tab's league list — click the name to expand and load that league's rosters, then page through teams with the arrows. Only fetches once expanded. */
export function LeagueAccordion({
  leagueId,
  leagueName,
  sleeperUserId,
  isOpen,
  onToggle,
}: {
  leagueId: string;
  leagueName: string;
  sleeperUserId: string | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const data = useLeagueTeamRosters(isOpen ? leagueId : null, sleeperUserId);
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(() => setIndex(null));
      return;
    }
    if (!data || index !== null) return;
    const myIndex = data.teams.findIndex((t) => t.rosterId === data.myRosterId);
    queueMicrotask(() => setIndex(myIndex >= 0 ? myIndex : 0));
  }, [isOpen, data, index]);

  const team = data && index !== null ? data.teams[index] : null;

  return (
    <div className="border-b border-grid last:border-0">
      <div className="flex w-full items-center justify-between gap-3 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
          <span className="truncate text-sm font-medium text-ink-primary">{leagueName}</span>
        </button>
        {isOpen && data && data.teams.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              icon={<ChevronLeftIcon />}
              label="Previous team"
              onClick={() => setIndex((i) => Math.max(0, (i ?? 0) - 1))}
              disabled={index === 0}
            />
            <IconButton
              icon={<ChevronRightIcon />}
              label="Next team"
              onClick={() => setIndex((i) => Math.min(data.teams.length - 1, (i ?? 0) + 1))}
              disabled={index === data.teams.length - 1}
            />
          </div>
        ) : null}
      </div>

      {isOpen ? (
        <div className="animate-[expand_0.15s_ease-out] pb-4">
          {!data ? (
            <p className="py-4 text-center text-sm text-ink-secondary">Loading…</p>
          ) : team ? (
            <>
              <Link
                href={`/team?league=${leagueId}&roster=${team.rosterId}`}
                className="mb-2 block text-sm font-medium text-series-1 hover:underline"
              >
                {team.teamName}
              </Link>
              <RosterValueTable players={team.players} />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
