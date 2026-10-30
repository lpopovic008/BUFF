"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeagueMatchupCarouselData } from "@/hooks/useLeagueMatchupCarousel";
import type { LineNote, LineTone } from "@/components/LeagueMatchupCarousel";
import { useWeekGames } from "@/hooks/useWeekGames";
import { useGamePlays } from "@/hooks/useRedZoneFeed";
import { GAME_MS, useLiveNow } from "@/components/PointsGraph";
import { getWeeklyPlayerLines, weighProjection } from "@/lib/sleeper";
import { onPace, paceShare } from "@/lib/live-play-points";
import { periodBreak } from "@/lib/nfl-schedule";
import { liveProjection } from "@/lib/matchup-timeline";
import rawStatsSnapshot from "@/data/player-stats.json";
import { defenseRanks, PlayerStatsSnapshot } from "@/lib/player-stats";

/**
 * What a league's lineups show around each starter, for a week: the week's NFL games, every starter's projection
 * stats, each team's live projected total, how each starter's points read (see LineTone) and each starter's second
 * line (see LineNote) — all under the league's scoring.
 */
export function useLineupDetails(
  carousel: LeagueMatchupCarouselData | null,
  season: string | null,
  week: number | null,
  scoring: Record<string, number> | undefined
) {
  const weekGames = useWeekGames(season, week);
  // Every starter's projection, scored under this league's rules.
  const [projectionStats, setProjectionStats] = useState<Record<string, Record<string, number>> | null>(null);
  useEffect(() => {
    if (!season || week == null) return;
    let cancelled = false;
    getWeeklyPlayerLines("projections", season, week)
      .then((lines) => {
        if (!cancelled) setProjectionStats(Object.fromEntries(Object.entries(lines).map(([id, line]) => [id, line.stats])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [season, week]);
  // Each team's projected total: Sleeper's pregame projections, each swapped for the player's actual
  // points once their game is over — so it only moves as games finish.
  const projected = useMemo(() => {
    if (!carousel || !projectionStats) return null;
    const finalTeams = new Set(weekGames.filter((g) => g.state === "post").flatMap((g) => [g.homeTeam, g.awayTeam]));
    const out = new Map<number, number>();
    for (const game of carousel.games) {
      for (const t of game.teams) {
        const starters = t.slots.flatMap((slot) => {
          const p = slot.player;
          if (!p) return [];
          const stats = projectionStats[p.playerId];
          const weighed = stats ? weighProjection(stats, scoring) : undefined;
          return [{ points: slot.livePoints, projected: typeof weighed === "number" ? weighed : null, final: !!p.team && finalTeams.has(p.team) }];
        });
        out.set(t.rosterId, liveProjection(starters));
      }
    }
    return out;
  }, [carousel, projectionStats, weekGames, scoring]);
  // How each starter's points read in the lineups: not played yet (a dash), or — while their game's on —
  // on pace for their projection or behind it, as their player graph reads it; once it's over, whether they beat it.
  const liveGames = useMemo(() => weekGames.filter((g) => g.state === "in").map((game) => ({ game, players: [] })), [weekGames]);
  const playsByGame = useGamePlays(liveGames);
  const now = useLiveNow(liveGames.length > 0);
  const lineTones = useMemo(() => {
    const out = new Map<string, LineTone>();
    if (!carousel) return out;
    const gameOf = new Map(weekGames.flatMap((g) => [[g.homeTeam, g] as const, [g.awayTeam, g] as const]));
    for (const game of carousel.games) {
      for (const t of game.teams) {
        for (const slot of [...t.slots, ...t.bench]) {
          const p = slot.player;
          if (!p) continue;
          const nfl = p.team ? gameOf.get(p.team) : undefined;
          if (!nfl || nfl.state === "pre") {
            out.set(p.playerId, "pre");
            continue;
          }
          const stats = projectionStats?.[p.playerId];
          const weighed = stats ? weighProjection(stats, scoring) : undefined;
          const share = nfl.state === "post" ? 1 : now === null ? undefined : paceShare(new Date(nfl.kickoff).getTime(), playsByGame[nfl.id] ?? [], now, GAME_MS, periodBreak(nfl.statusDetail) === 2);
          const pace = onPace(slot.livePoints, typeof weighed === "number" ? weighed : null, share);
          out.set(p.playerId, pace === null ? null : pace ? "good" : "bad");
        }
      }
    }
    return out;
  }, [carousel, weekGames, projectionStats, scoring, playsByGame, now]);
  // Each starter's second line: who they're playing, how that defense ranks against their position, and their projection.
  const matchupRanks = useMemo(() => defenseRanks(rawStatsSnapshot as unknown as PlayerStatsSnapshot, scoring), [scoring]);
  const lineNotes = useMemo(() => {
    const out = new Map<string, LineNote>();
    if (!carousel) return out;
    const opponentOf = new Map(weekGames.flatMap((g) => [[g.homeTeam, g.awayTeam] as const, [g.awayTeam, g.homeTeam] as const]));
    for (const game of carousel.games) {
      for (const t of game.teams) {
        for (const slot of [...t.slots, ...t.bench]) {
          const p = slot.player;
          if (!p) continue;
          const opponent = p.team ? (opponentOf.get(p.team) ?? null) : null;
          const stats = projectionStats?.[p.playerId];
          const weighed = stats ? weighProjection(stats, scoring) : undefined;
          const defense = opponent ? matchupRanks.get(`${opponent}-${p.position}`) : undefined;
          out.set(p.playerId, {
            opponent,
            // Only once the week's games are in — before, nothing says who anyone's playing.
            bye: weekGames.length > 0 && !opponent,
            rank: defense?.rank ?? null,
            share: defense?.share ?? null,
            projected: typeof weighed === "number" ? weighed : null,
          });
        }
      }
    }
    return out;
  }, [carousel, weekGames, projectionStats, scoring, matchupRanks]);
  return { weekGames, projectionStats, projected, lineTones, lineNotes };
}
