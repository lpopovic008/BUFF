"use client";

import { useEffect, useState } from "react";
import { getWeeklyPlayerLines, WeeklyPlayerLine } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players";
import { LIVE_PROJECTION_FLOOR, LivePlayerLine } from "@/lib/my-starters";
import { LIVE_TTL_SECONDS } from "@/lib/live-clock";
import { useLiveTick } from "@/hooks/useLiveTick";

export interface LivePlayerLines {
  /** Everyone who has scored this week or is projected for LIVE_PROJECTION_FLOOR or more. */
  lines: LivePlayerLine[];
  /** Every player's PPR projection for the week, by id. */
  projected: Record<string, number>;
  /** Every player's projected stat line, by id — to score a projection under a league's own rules. */
  projectionStats: Record<string, Record<string, number>>;
}

const EMPTY: LivePlayerLines = { lines: [], projected: {}, projectionStats: {} };

/**
 * Every NFL player's standard PPR points so far this week and their
 * projection, from Sleeper's NFL-wide stats and projections. Projections are
 * always read (they're what a game shows before kickoff); points only once
 * `gamesStarted`, and then again on each live-clock tick.
 */
export function useLivePlayerLines(season: string | null, week: number | null, gamesStarted: boolean): LivePlayerLines {
  const [result, setResult] = useState<LivePlayerLines>(EMPTY);
  const tick = useLiveTick();

  useEffect(() => {
    if (!season || week == null) return;
    let cancelled = false;

    (async () => {
      const [stats, projections] = await Promise.all([
        gamesStarted
          ? getWeeklyPlayerLines("stats", season, week, LIVE_TTL_SECONDS)
          : Promise.resolve<Record<string, WeeklyPlayerLine>>({}),
        getWeeklyPlayerLines("projections", season, week),
      ]);
      const projected: Record<string, number> = {};
      const projectionStats: Record<string, Record<string, number>> = {};
      for (const [id, { stats: line }] of Object.entries(projections)) {
        projectionStats[id] = line;
        if (typeof line.pts_ppr === "number") projected[id] = line.pts_ppr;
      }
      const pointsOf = (id: string) => stats[id]?.stats.pts_ppr ?? 0;
      const ids = [...new Set([...Object.keys(stats), ...Object.keys(projected)])].filter(
        (id) => pointsOf(id) !== 0 || (projected[id] ?? 0) >= LIVE_PROJECTION_FLOOR
      );
      const resolved = ids.length > 0 ? await resolvePlayers(ids) : [];
      if (cancelled) return;
      setResult({
        projected,
        projectionStats,
        lines: resolved.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          position: p.position,
          // The team they played for this week, which is what puts them in a game.
          team: stats[p.playerId]?.team ?? projections[p.playerId]?.team ?? p.team,
          points: pointsOf(p.playerId),
          projected: projected[p.playerId] ?? null,
        })),
      });
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [season, week, gamesStarted, tick]);

  return result;
}
