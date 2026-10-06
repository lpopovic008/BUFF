"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GameStarters, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { LIVE_TTL_SECONDS } from "@/lib/live-clock";
import { FeedCandidate, GamePlay, getGamePlays, playFirstSeenAt, playFromLastPlay, playersInPlay, playTextActors, playTextNamePattern } from "@/lib/play-by-play";
import { pprPointsForPlay } from "@/lib/play-points";

/** A play — with whichever of your starters were part of it (none, in the all-plays view, for most). */
export interface FeedEntry {
  play: GamePlay;
  game: NFLGame;
  players: GroupedStarter[];
  /** Per player: standard PPR points from this play, and their game total through it. */
  points: Record<string, { delta: number; total: number }>;
  /** In the all-plays view, everyone else the play scored points for — by ESPN's shorthand name ("B.Mayfield"), or a team defense ("TB D/ST"). */
  others: { key: string; label: string; delta: number; total: number }[];
}

/** A game where a team has the ball inside the 20 right now — in your-players view, only a team you have starters on. */
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

/** Your players' plays only, or every play of every game. */
export type FeedScope = "mine" | "all";

/**
 * This week's plays, newest first, plus who's in the red zone right now. With
 * scope "mine", only the plays your starters are part of, across the games
 * they're playing in; with "all", every play of every game that's started
 * (games without your starters are only fetched once you ask for them).
 * Follows the games it's handed: pass in games re-read on each tick of the
 * live clock and it keeps itself current.
 *
 * `starters` is your starters grouped by game; `weekGames` is every game of the week.
 */
export function useRedZoneFeed(starters: GameStarters[], weekGames: NFLGame[], scope: FeedScope): RedZoneFeed {
  const games = useMemo<GameStarters[]>(() => {
    if (scope === "mine") return starters.filter((g) => g.players.length > 0);
    const playersByGame = new Map(starters.map((g) => [g.game.id, g.players]));
    return weekGames.map((game) => ({ game, players: playersByGame.get(game.id) ?? [] }));
  }, [starters, weekGames, scope]);

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
      if (game.state === "pre") continue;
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
      if (game.state === "pre") continue;
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
      const addTo = (key: string, delta: number) => {
        const total = Math.round(((totals.get(key) ?? 0) + delta) * 100) / 100;
        totals.set(key, total);
        return total;
      };
      for (const play of plays) {
        const matched = playersInPlay(play, candidates);
        if (matched.length === 0 && scope === "mine") continue;
        const points: FeedEntry["points"] = {};
        for (const c of matched) {
          const delta = pprPointsForPlay(play, c);
          points[c.playerId] = { delta, total: addTo(c.playerId, delta) };
        }
        // Everyone else's points too, in the all-plays view — named the way
        // ESPN's line names them, kept apart from your own starters already above.
        const others: FeedEntry["others"] = [];
        if (scope === "all") {
          const mine = matched.map((c) => playTextNamePattern(c.name)).filter((r): r is RegExp => r !== null);
          for (const { label, candidate } of playTextActors(play)) {
            if (mine.some((r) => r.test(label))) continue;
            const delta = pprPointsForPlay(play, candidate);
            const total = addTo(candidate.playerId, delta);
            if (delta !== 0) others.push({ key: candidate.playerId, label, delta, total });
          }
          const defense = play.offense ? [game.homeTeam, game.awayTeam].find((t) => t !== play.offense) : undefined;
          if (defense && !matched.some((c) => c.position === "DEF" && c.team === defense)) {
            const key = `DEF:${defense}`;
            const delta = pprPointsForPlay(play, { playerId: key, name: `${defense} D/ST`, position: "DEF", team: defense });
            const total = addTo(key, delta);
            if (delta !== 0) others.push({ key, label: `${defense} D/ST`, delta, total });
          }
        }
        const involved = matched.map((c) => byId.get(c.playerId)).filter((p): p is GroupedStarter => !!p);
        out.push({ play, game, players: involved, points, others });
      }
    }
    return out.sort((a, b) => {
      const byTime = (b.play.at ?? 0) - (a.play.at ?? 0);
      return byTime !== 0 ? byTime : b.play.sequence - a.play.sequence;
    });
  }, [games, playsByGame, scope]);

  const redZone = useMemo(() => {
    const out: RedZoneNow[] = [];
    for (const { game, players } of games) {
      const live = game.live;
      if (game.state !== "in" || !live?.isRedZone || !live.possession) continue;
      const onOffense = players.filter((p) => p.team === live.possession && p.position !== "DEF");
      if (onOffense.length > 0 || scope === "all") out.push({ game, team: live.possession, downDistance: live.downDistance, players: onOffense });
    }
    return out;
  }, [games, scope]);

  const started = games.filter((g) => g.game.state !== "pre");
  const loading = started.length > 0 && !started.some((g) => g.game.id in playsByGame);

  return { entries, redZone, loading };
}
