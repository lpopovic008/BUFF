"use client";

import { useMemo } from "react";
import { GameStarters } from "@/lib/my-starters";
import { LatestScore, latestScoringPlay } from "@/lib/live-play-points";
import { useGamePlays, withScoreboardPlay } from "@/hooks/useRedZoneFeed";

/**
 * Each game's latest play that one of your players got points on, by game id —
 * for the line under each game in the starters list. Follows the same
 * play-by-play as the Red Zone (the fetches are shared).
 */
export function useLatestScores(games: GameStarters[]): Record<string, LatestScore> {
  const yours = useMemo(() => games.filter((g) => g.players.length > 0), [games]);
  const playsByGame = useGamePlays(yours);
  return useMemo(() => {
    const out: Record<string, LatestScore> = {};
    for (const { game, players } of yours) {
      const plays = playsByGame[game.id];
      if (!plays) continue;
      const candidates = players.map((p) => ({ playerId: p.playerId, name: p.name, position: p.position, team: p.team }));
      const latest = latestScoringPlay(withScoreboardPlay(game, plays), candidates);
      if (latest) out[game.id] = latest;
    }
    return out;
  }, [yours, playsByGame]);
}
