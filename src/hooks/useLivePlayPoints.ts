"use client";

import { useEffect, useRef, useState } from "react";
import { GameStarters } from "@/lib/my-starters";
import { pendingPlayPoints, SeenPlay } from "@/lib/live-play-points";
import { useGamePlays, withScoreboardPlay } from "@/hooks/useRedZoneFeed";
import { useLiveTick } from "@/hooks/useLiveTick";

/**
 * The Red Zone points each listed player has coming that Sleeper hasn't
 * counted yet, by player id (see lib/live-play-points.ts). `watched` is the
 * games whose play-by-play to follow, with the players whose plays should
 * prompt a re-read (your starters and the ones you face); `listed` is every
 * player shown under each game, whose Sleeper numbers are tracked.
 */
export function useLivePlayPoints(watched: GameStarters[], listed: GameStarters[]): Record<string, number> {
  const playsByGame = useGamePlays(watched);
  const tick = useLiveTick();
  /** When each play was first seen — 0 for those already there when its game first loaded. */
  const seenAt = useRef(new Map<string, number>());
  const baselined = useRef(new Set<string>());
  /** Each player's last Sleeper number, and when this page saw it change. */
  const sleeper = useRef(new Map<string, { points: number | null; changedAt: number }>());
  const [pending, setPending] = useState<Record<string, number>>({});

  useEffect(() => {
    const now = Date.now();
    const out: Record<string, number> = {};
    for (const { game, players } of listed) {
      const changedAt = new Map<string, number>();
      for (const p of players) {
        const prev = sleeper.current.get(p.playerId);
        if (!prev || prev.points !== p.points) sleeper.current.set(p.playerId, { points: p.points, changedAt: now });
        changedAt.set(p.playerId, sleeper.current.get(p.playerId)!.changedAt);
      }
      const loaded = playsByGame[game.id];
      if (!loaded) continue;
      // Plays already there on the first load are history Sleeper has had time to count.
      const first = !baselined.current.has(game.id);
      baselined.current.add(game.id);
      const plays: SeenPlay[] = withScoreboardPlay(game, loaded).map((play) => {
        if (!seenAt.current.has(play.id)) seenAt.current.set(play.id, first ? 0 : now);
        return { play, seenAt: seenAt.current.get(play.id)! };
      });
      const candidates = players.map((p) => ({ playerId: p.playerId, name: p.name, position: p.position, team: p.team }));
      Object.assign(out, pendingPlayPoints(plays, candidates, changedAt, now));
    }
    queueMicrotask(() => setPending(out));
  }, [listed, playsByGame, tick]);

  return pending;
}
