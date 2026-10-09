"use client";

import { useState } from "react";
import Link from "next/link";
import { useLeagueTeamRosters } from "@/hooks/useLeagueTeamRosters";
import { RosterWeb } from "@/components/RosterWeb";
import { IconButton } from "@/components/ui/IconButton";
import { PlateCard } from "@/components/ui/PlateCard";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icon";

/** One league's rosters on the Values page, each drawn as a web of its players (see RosterWeb) — your team first, the arrows paging through the rest. */
export function LeagueRosterPanel({
  leagueId,
  leagueName,
  sleeperUserId,
}: {
  leagueId: string;
  leagueName: string;
  sleeperUserId: string | null;
}) {
  const data = useLeagueTeamRosters(leagueId, sleeperUserId);
  // The team shown: yours until another is paged to.
  const [picked, setPicked] = useState<number | null>(null);
  const mine = data ? Math.max(0, data.teams.findIndex((t) => t.rosterId === data.myRosterId)) : 0;
  const index = picked ?? mine;
  const team = data?.teams[index] ?? null;

  return (
    <PlateCard title={leagueName}>
      {!data ? (
        <p className="py-4 text-center text-sm text-ink-secondary">Loading…</p>
      ) : team ? (
        <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Link
              href={`/team?league=${leagueId}&roster=${team.rosterId}`}
              className="min-w-0 truncate text-sm font-bold text-ink-primary hover:underline"
            >
              {team.teamName}
            </Link>
            {data.teams.length > 1 ? (
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  icon={<ChevronLeftIcon />}
                  label="Previous team"
                  onClick={() => setPicked(Math.max(0, index - 1))}
                  disabled={index === 0}
                />
                <IconButton
                  icon={<ChevronRightIcon />}
                  label="Next team"
                  onClick={() => setPicked(Math.min(data.teams.length - 1, index + 1))}
                  disabled={index === data.teams.length - 1}
                />
              </div>
            ) : null}
          </div>
          <RosterWeb players={team.players} label={`${team.teamName}: each player a dot, sized by value`} />
        </>
      ) : null}
    </PlateCard>
  );
}
