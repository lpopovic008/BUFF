"use client";

import { useMemo } from "react";
import { GameStarters } from "@/lib/my-starters";
import { LastAction, lastActions } from "@/lib/live-play-points";
import { useGamePlays, withScoreboardPlay } from "@/hooks/useRedZoneFeed";

/**
 * Each listed player's latest play that moved their points, by player id —
 * for the starters list's player lines. Only follows the games handed in
 * (those with players showing), sharing the Red Zone's play-by-play fetches.
 */
export function useLastActions(games: GameStarters[]): Record<string, LastAction> {
  const playsByGame = useGamePlays(games);
  return useMemo(() => {
    const out: Record<string, LastAction> = {};
    for (const { game, players } of games) {
      const plays = playsByGame[game.id];
      if (!plays || game.state === "pre") continue;
      const candidates = players.map((p) => ({ playerId: p.playerId, name: p.name, position: p.position, team: p.team }));
      Object.assign(out, lastActions(withScoreboardPlay(game, plays), candidates));
    }
    return out;
  }, [games, playsByGame]);
}
