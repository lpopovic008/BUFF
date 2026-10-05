"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GameStarters, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { LIVE_TTL_SECONDS } from "@/lib/live-clock";
import { FeedCandidate, GamePlay, getGamePlays, playFirstSeenAt, playFromLastPlay, playersInPlay } from "@/lib/play-by-play";
import { pprPointsForPlay } from "@/lib/play-points";

/** A play one or more of your starters was part of. */
export interface FeedEntry {
  play: GamePlay;
  game: NFLGame;
  players: GroupedStarter[];
  /** Per player: standard PPR points from this play, and their game total through it. */
  points: Record<string, { delta: number; total: number }>;
}

/** A game where a team you have starters on has the ball inside the 20 right now. */
export interface RedZoneNow {
  game: NFLGame;
  team: string;
  downDistance: string | null;
  players: GroupedStarter[];
}

export interface RedZoneFeed {
  /** Newest first. */
  entries: FeedEntry[];
  redZone: RedZoneNow[];
  /** Games have started but no play-by-play has arrived yet. */
  loading: boolean;
}

// A game in progress re-reads its play-by-play when the scoreboard shows a new
// play that one of your starters was in, or a score — and otherwise at most
// this often, so the plays in between still fill in.
const BACKFILL_MS = 60_000;

function candidatesOf(players: GroupedStarter[]): FeedCandidate[] {
  return players.map((p) => ({ playerId: p.playerId, name: p.name, position: p.position, team: p.team }));
}

/**
 * The plays your starters are part of, across every game they're playing in
 * this week, newest first, plus which of their teams are in the red zone right
 * now. Follows the games it's handed: pass in games re-read on each tick of
 * the live clock and it keeps itself current.
 */
export function useRedZoneFeed(games: GameStarters[]): RedZoneFeed {
  const [playsByGame, setPlaysByGame] = useState<Record<string, GamePlay[]>>({});
  const lastFetchAt = useRef(new Map<string, number>());
  /** The scoreboard's latest play id as of each game's last fetch. */
  const fetchedThrough = useRef(new Map<string, string | null>());
  /** Finished games whose final play-by-play is in hand. */
  const finalFetched = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const load = (gameId: string, ttlSeconds: number, final: boolean) => {
      lastFetchAt.current.set(gameId, now);
      if (final) finalFetched.current.add(gameId);
      void getGamePlays(gameId, ttlSeconds).then((plays) => {
        if (plays === null) {
          // Try again on a later tick.
          if (final) finalFetched.current.delete(gameId);
        }
        if (cancelled && plays === null) return;
        setPlaysByGame((prev) => (plays === null ? (gameId in prev ? prev : { ...prev, [gameId]: [] }) : { ...prev, [gameId]: plays }));
      });
    };

    for (const { game, players } of games) {
      if (game.state === "pre" || players.length === 0) continue;
      if (game.state === "post") {
        // Fresh once more at the final whistle, then never again.
        if (!finalFetched.current.has(game.id)) load(game.id, lastFetchAt.current.has(game.id) ? 0 : Infinity, true);
        continue;
      }
      const last = lastFetchAt.current.get(game.id);
      const lastPlay = game.live?.lastPlay ?? null;
      if (last === undefined) {
        fetchedThrough.current.set(game.id, lastPlay?.id ?? null);
        load(game.id, LIVE_TTL_SECONDS, false);
        continue;
      }
      const stale = now - last >= BACKFILL_MS;
      if (!lastPlay) {
        if (stale) load(game.id, LIVE_TTL_SECONDS, false);
        continue;
      }
      if (lastPlay.id === fetchedThrough.current.get(game.id)) continue;
      const mine = playersInPlay(playFromLastPlay(game.id, lastPlay, now), candidatesOf(players)).length > 0;
      if (mine || lastPlay.scoreValue > 0 || stale) {
        fetchedThrough.current.set(game.id, lastPlay.id);
        load(game.id, LIVE_TTL_SECONDS, false);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [games]);

  const entries = useMemo(() => {
    const out: FeedEntry[] = [];
    for (const { game, players } of games) {
      if (game.state === "pre" || players.length === 0) continue;
      const candidates = candidatesOf(players);
      const byId = new Map(players.map((p) => [p.playerId, p]));
      const plays = [...(playsByGame[game.id] ?? [])];
      // The scoreboard's latest play leads until the play-by-play catches up to it.
      const last = game.live?.lastPlay;
      if (last) {
        const synthetic = playFromLastPlay(game.id, last, playFirstSeenAt(last.id));
        if (!plays.some((p) => p.id === synthetic.id || p.text === synthetic.text)) plays.push(synthetic);
      }
      // In game order, so each player's running total builds up play by play.
      plays.sort((a, b) => a.sequence - b.sequence);
      const totals = new Map<string, number>();
      for (const play of plays) {
        const matched = playersInPlay(play, candidates);
        if (matched.length === 0) continue;
        const points: FeedEntry["points"] = {};
        for (const c of matched) {
          const delta = pprPointsForPlay(play, c);
          const total = Math.round(((totals.get(c.playerId) ?? 0) + delta) * 100) / 100;
          totals.set(c.playerId, total);
          points[c.playerId] = { delta, total };
        }
        const involved = matched.map((c) => byId.get(c.playerId)).filter((p): p is GroupedStarter => !!p);
        out.push({ play, game, players: involved, points });
      }
    }
    return out.sort((a, b) => {
      const byTime = (b.play.at ?? 0) - (a.play.at ?? 0);
      return byTime !== 0 ? byTime : b.play.sequence - a.play.sequence;
    });
  }, [games, playsByGame]);

  const redZone = useMemo(() => {
    const out: RedZoneNow[] = [];
    for (const { game, players } of games) {
      const live = game.live;
      if (game.state !== "in" || !live?.isRedZone || !live.possession) continue;
      const onOffense = players.filter((p) => p.team === live.possession && p.position !== "DEF");
      if (onOffense.length > 0) out.push({ game, team: live.possession, downDistance: live.downDistance, players: onOffense });
    }
    return out;
  }, [games]);

  const started = games.filter((g) => g.game.state !== "pre" && g.players.length > 0);
  const loading = started.length > 0 && !started.some((g) => g.game.id in playsByGame);

  return { entries, redZone, loading };
}
