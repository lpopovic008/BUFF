"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GameStarters, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { LIVE_TTL_SECONDS } from "@/lib/live-clock";
import { FeedCandidate, GamePlay, getGamePlays, playFirstSeenAt, playFromLastPlay, playersInPlay } from "@/lib/play-by-play";
import { LinePlayer, linesForPlays, PlayLine } from "@/lib/play-lines";

/** A play — with whichever of your starters were part of it (none, in the all-plays view, for most) — and everyone in it, a line each. */
export interface FeedEntry {
  play: GamePlay;
  game: NFLGame;
  /** Your starters in the play. */
  players: GroupedStarter[];
  /** Everyone the play names, then the defense when it scored — each with the play's standard PPR points and their game total through it. */
  lines: PlayLine[];
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

/**
 * A game's plays, with the scoreboard's latest play added on the end until
 * the play-by-play catches up to it.
 */
export function withScoreboardPlay(game: NFLGame, plays: GamePlay[]): GamePlay[] {
  const last = game.live?.lastPlay;
  if (!last) return plays;
  const synthetic = playFromLastPlay(game.id, last, playFirstSeenAt(last.id));
  return plays.some((p) => p.id === synthetic.id || p.text === synthetic.text) ? plays : [...plays, synthetic];
}

/**
 * Each started game's play-by-play, by game id. Final games are fetched
 * once; a game in progress re-reads when the scoreboard shows a new play
 * that one of the game's listed players was in, or a score — and otherwise
 * every BACKFILL_MS. Pass in games re-read on each live-clock tick and it
 * keeps itself current. Fetches are shared (see getGamePlays), so two
 * callers on the same tick make one request.
 */
export function useGamePlays(games: GameStarters[]): Record<string, GamePlay[]> {
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

  return playsByGame;
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
 * Each play lists everyone in it, matched by name to your starters or else to
 * `teamPlayers`, for their photos and positions.
 */
export function useRedZoneFeed(
  starters: GameStarters[],
  weekGames: NFLGame[],
  scope: FeedScope,
  /** Who a play's names can be matched to, by team, likeliest first. */
  teamPlayers: Map<string, LinePlayer[]>
): RedZoneFeed {
  const games = useMemo<GameStarters[]>(() => {
    if (scope === "mine") return starters.filter((g) => g.players.length > 0);
    const playersByGame = new Map(starters.map((g) => [g.game.id, g.players]));
    return weekGames.map((game) => ({ game, players: playersByGame.get(game.id) ?? [] }));
  }, [starters, weekGames, scope]);

  const playsByGame = useGamePlays(games);

  const entries = useMemo(() => {
    const out: FeedEntry[] = [];
    for (const { game, players } of games) {
      if (game.state === "pre") continue;
      const candidates = candidatesOf(players);
      const byId = new Map(players.map((p) => [p.playerId, p]));
      const plays = withScoreboardPlay(game, playsByGame[game.id] ?? []);
      // In game order, so each player's running total builds up play by play.
      plays.sort((a, b) => a.sequence - b.sequence);
      // Names are matched to your starters first, then to everyone else on the two teams.
      const pool: LinePlayer[] = [...players, ...(teamPlayers.get(game.homeTeam) ?? []), ...(teamPlayers.get(game.awayTeam) ?? [])];
      const myDefenses = new Set(players.filter((p) => p.position === "DEF" && p.team).map((p) => p.team!));
      const lines = linesForPlays(plays, [game.homeTeam, game.awayTeam], pool, myDefenses);
      for (const play of plays) {
        const matched = playersInPlay(play, candidates);
        if (matched.length === 0 && scope === "mine") continue;
        const involved = matched.map((c) => byId.get(c.playerId)).filter((p): p is GroupedStarter => !!p);
        out.push({ play, game, players: involved, lines: lines.get(play.id) ?? [] });
      }
    }
    return out.sort((a, b) => {
      const byTime = (b.play.at ?? 0) - (a.play.at ?? 0);
      return byTime !== 0 ? byTime : b.play.sequence - a.play.sequence;
    });
  }, [games, playsByGame, scope, teamPlayers]);

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
