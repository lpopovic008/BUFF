"use client";

import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getLeagueUsers, getMatchups, getWeeklyProjections } from "@/lib/sleeper";
import { buildLeagueMatchups } from "@/lib/league-data";
import { resolvePlayers, ResolvedPlayer } from "@/lib/players";
import { positionSeasonRankIndexFor } from "@/lib/matchup-players";
import { PlayerStatsSnapshot } from "@/lib/player-stats";
import { getWeekGames, NFLGame } from "@/lib/nfl-schedule";
import { MatchupSide, readMatchup, withReading, WinProbPoint } from "@/lib/win-probability";
import { fetchRecordedLines, loadWinProbLines, matchupKey, mergeRecorded, saveWinProbLines } from "@/lib/win-prob-store";
import rawStatsSnapshot from "@/data/player-stats.json";

const statsSnapshot = rawStatsSnapshot as unknown as PlayerStatsSnapshot;

// While any game of the week is on, re-poll Sleeper about as fast as its
// live scoring moves; otherwise every minute.
const LIVE_REFRESH_MS = 10_000;
const IDLE_REFRESH_MS = 60_000;
// How stale a cached Sleeper matchups response may be on a live poll.
const LIVE_MATCHUPS_MAX_AGE_S = 5;

export interface ResolvedSlot {
  slot: string;
  player: ResolvedPlayer | null;
  livePoints: number;
  /** This player's season rank at their position by fantasy points, e.g. "WR12", or null if they haven't played / couldn't be found. */
  seasonRank: string | null;
}

export interface ResolvedMatchupTeam {
  rosterId: number;
  teamName: string;
  points: number;
  slots: ResolvedSlot[];
}

/** A matchup's win-probability line so far, for the team with the lower roster id (`p`, and its score as `a`). */
export interface MatchupWinProb {
  lowRosterId: number;
  points: WinProbPoint[];
  /** A starter's game is being played right now. */
  live: boolean;
  /** No starter's game has kicked off yet: the line is the projection alone. */
  pregame: boolean;
  /** Every starter's game is over: the matchup is decided. */
  final: boolean;
}

export interface ResolvedMatchupGame {
  matchupId: number;
  teams: ResolvedMatchupTeam[];
  winProb: MatchupWinProb | null;
}

export interface LeagueMatchupCarouselData {
  games: ResolvedMatchupGame[];
}

// The lines recorded so far for the league and week on screen, kept across
// polls (and re-read from storage when the page opens).
let recorded: { leagueId: string; week: string; lines: Record<string, WinProbPoint[]> } | null = null;

function linesFor(leagueId: string, week: string): Record<string, WinProbPoint[]> {
  if (!recorded || recorded.leagueId !== leagueId || recorded.week !== week) {
    recorded = { leagueId, week, lines: loadWinProbLines(leagueId, week) };
  }
  return recorded.lines;
}

/** Every matchup for a league's week, full starting lineups resolved to names, with a live win-probability line — re-polled while mounted, every few seconds while games are on. */
export function useLeagueMatchupCarousel(leagueId: string | null, week: number | null): LeagueMatchupCarouselData | null {
  const [data, setData] = useState<LeagueMatchupCarouselData | null>(null);

  useEffect(() => {
    if (!leagueId || week == null) {
      queueMicrotask(() => setData(null));
      return;
    }
    const id = leagueId;
    const currentWeek = week;
    let cancelled = false;
    let live = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Loads everything once; says whether any game of the week is on. */
    async function load(): Promise<boolean> {
      const league = await getLeague(id);
      if (!league || cancelled) return false;
      const weekKey = `${league.season}-${currentWeek}`;
      const [rosters, users, matchups, games, projections, recordedLines] = await Promise.all([
        getLeagueRosters(id),
        getLeagueUsers(id),
        getMatchups(id, currentWeek, live ? LIVE_MATCHUPS_MAX_AGE_S : 60),
        getWeekGames(league.season, currentWeek),
        getWeeklyProjections(league.season, currentWeek, league.scoring_settings),
        fetchRecordedLines(id, weekKey),
      ]);
      if (cancelled) return false;

      const raw = buildLeagueMatchups(league, matchups, rosters, users);
      const allIds = raw.flatMap((g) =>
        g.teams.flatMap((t) => t.slots.map((s) => s.playerId).filter((pid): pid is string => pid !== null))
      );
      const resolved = await resolvePlayers(allIds);
      if (cancelled) return false;
      const byId = new Map(resolved.map((p) => [p.playerId, p]));
      const seasonRankIdx = positionSeasonRankIndexFor(statsSnapshot, league.scoring_settings);

      const gameByTeam = new Map<string, NFLGame>();
      for (const g of games) {
        gameByTeam.set(g.homeTeam, g);
        gameByTeam.set(g.awayTeam, g);
      }
      const now = Date.now();
      // This browser's readings, with the game-day recorder's filled in.
      const lines = linesFor(id, weekKey);
      let changed = false;
      for (const [key, line] of Object.entries(mergeRecorded(lines, recordedLines))) {
        if (line.length !== (lines[key]?.length ?? 0)) {
          lines[key] = line;
          changed = true;
        }
      }

      const withNames: ResolvedMatchupGame[] = raw.map((g) => {
        const teams = g.teams.map((t) => ({
          rosterId: t.rosterId,
          teamName: t.teamName,
          points: t.points,
          slots: t.slots.map((s) => {
            const player = s.playerId ? (byId.get(s.playerId) ?? null) : null;
            const rank = player ? seasonRankIdx.get(player.playerId) : undefined;
            return {
              slot: s.slot,
              player,
              livePoints: s.playerId ? (t.playersPoints[s.playerId] ?? 0) : 0,
              seasonRank: player && rank ? `${player.position}${rank}` : null,
            };
          }),
        }));

        // Win probability needs the NFL schedule (to know how much of each
        // starter's game is left) and two teams.
        if (games.length === 0 || teams.length !== 2) return { matchupId: g.matchupId, teams, winProb: null };
        const [low, high] = teams[0].rosterId < teams[1].rosterId ? [teams[0], teams[1]] : [teams[1], teams[0]];
        const side = (t: ResolvedMatchupTeam): MatchupSide => ({
          points: t.points,
          starters: t.slots.filter((x) => x.player).map((x) => ({ playerId: x.player!.playerId, team: x.player!.team, points: x.livePoints })),
        });
        const reading = readMatchup(side(low), side(high), projections, gameByTeam);
        if (!reading.started) {
          return {
            matchupId: g.matchupId,
            teams,
            winProb: { lowRosterId: low.rosterId, points: [{ t: now, p: reading.pregameP, a: 0, b: 0, synthetic: true }], live: false, pregame: true, final: false },
          };
        }

        const key = matchupKey(low.rosterId, high.rosterId);
        const point: WinProbPoint = { t: now, p: reading.p, a: low.points, b: high.points };
        const next = withReading(lines[key] ?? [], point, reading.live, reading.allDone);
        if (next) {
          lines[key] = next;
          changed = true;
        }
        const kept = lines[key] ?? [];
        // The pregame line, from the first kickoff up to the first reading;
        // and the reading just taken, as the line's live end.
        const firstKickoff = reading.firstKickoff ?? now;
        const points: WinProbPoint[] = [];
        if (!kept.length || kept[0].t > firstKickoff) points.push({ t: Math.min(firstKickoff, kept[0]?.t ?? now), p: reading.pregameP, a: 0, b: 0, synthetic: true });
        points.push(...kept);
        if (reading.live && kept.at(-1) !== point) points.push(point);
        else if (!kept.length) points.push({ ...point, synthetic: true });
        return { matchupId: g.matchupId, teams, winProb: { lowRosterId: low.rosterId, points, live: reading.live, pregame: false, final: reading.allDone } };
      });

      if (changed) saveWinProbLines(id, weekKey, lines);
      if (!cancelled) setData({ games: withNames });
      return games.some((x) => x.state === "in");
    }

    async function tick() {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        live = await load().catch(() => live);
      }
      if (!cancelled) timer = setTimeout(tick, live ? LIVE_REFRESH_MS : IDLE_REFRESH_MS);
    }
    // Coming back to the page refreshes straight away.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [leagueId, week]);

  return data;
}
