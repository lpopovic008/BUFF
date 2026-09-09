"use client";

import { leagueColor } from "@/lib/game-map";

export interface LeagueLegendEntry {
  leagueId: string;
  leagueName: string;
  /** Position in the tracked-league list — the fallback colour when a league has no logo. */
  colorIndex: number;
  /** The league's own Sleeper avatar, if the commish set one. Null falls back to a colour dot. */
  leagueAvatar: string | null;
}

/** A league's mark — its own logo when it has one, otherwise a colour dot. Used in the starters legend, per-player rows, and the map's game preview. */
export function LeagueMark({ league, className }: { league: LeagueLegendEntry | undefined; className: string }) {
  if (league?.leagueAvatar) {
    return <img src={league.leagueAvatar} alt="" className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span
      className={`shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: leagueColor(league?.colorIndex ?? 0) }}
    />
  );
}
